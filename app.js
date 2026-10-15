// Variáveis Globais
let dadosParaExportacao = [];
let usuarioLogado = null; 
let regrasAtivasCliente = []; 

// --- NAVEGAÇÃO DO WIZARD ---
function alterarPasso(passo) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${passo}`).classList.add('active');
}

function iniciarProcessamento() {
    if (document.getElementById('xmlInput').files.length === 0) return;
    alterarPasso(2);
    setTimeout(processarXML, 500);
}

function reiniciarWizard() {
    document.getElementById('xmlInput').value = '';
    document.getElementById('resultado').innerHTML = '';
    document.getElementById('btnExportar').style.display = 'none';
    alterarPasso(1);
}

// --- GESTÃO DE MODAIS E ROTAS ---
function abrirModal(idModal) {
    document.getElementById(idModal).style.display = 'flex';
}

function fecharModais() {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none');
}

function solicitarCompra(tipo, pacote) {
    alert(`Redirecionando para o Gateway de Pagamento...\nItem: ${pacote}`);
    fecharModais();
}

function enviarPedidoPub() {
    const empresa = document.getElementById('pub-empresa').value;
    if(!empresa) { alert("Preencha o nome da empresa."); return; }
    alert(`Pedido de publicidade para ${empresa} enviado ao administrador!`);
    fecharModais();
}

function fecharModal(idModal) { 
    const alvo = idModal || 'modalPremium';
    const modal = document.getElementById(alvo);
    if (modal) {
        modal.style.display = 'none'; 
    }
}

function redirecionarCheckout() { 
    alert("Redirecionando para página de pagamento..."); 
}

// --- AUTENTICAÇÃO (SaaS) ---
function alternarFormAuth(tipo) {
    document.getElementById('form-login').style.display = tipo === 'login' ? 'block' : 'none';
    document.getElementById('form-registro').style.display = tipo === 'registro' ? 'block' : 'none';
}

function fecharModalAuth() { 
    document.getElementById('modalAuth').style.display = 'none'; 
}

// --- LOGIN SEGURO DO CLIENTE ---
async function efetuarLogin() {
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-senha').value;
    if (!email || !senha) { alert("Preencha todos os campos."); return; }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'login', email: email, senha: senha })
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) {
            usuarioLogado = data.usuario; 
            sessionStorage.setItem('sessaoTISS', JSON.stringify(usuarioLogado));
            fecharModalAuth();
            atualizarTopoSite();
            alert(`Bem-vindo, ${usuarioLogado.nome}!`);
        } else {
            alert(`Falha no login: ${data.erro}`);
        }
    } catch (error) { alert("Erro ao comunicar com o servidor."); }
}

function atualizarTopoSite() {
    if(!usuarioLogado) return;
    
    const elStatus = document.getElementById('user-status');
    const btnTop = document.getElementById('btn-login-top');
    
    if (elStatus && btnTop) {
        if (usuarioLogado.tipo === "INTERNO") {
            elStatus.innerText = `👤 ${usuarioLogado.nome} | Perfil: ${usuarioLogado.perfil}`;
            elStatus.style.color = "#dc3545"; 
        } else {
            elStatus.innerText = `👤 ${usuarioLogado.nome} | Saldo: ${usuarioLogado.tokensRestantes} IA`;
            elStatus.style.color = "#0056b3"; 
        }

        btnTop.innerText = usuarioLogado.tipo === "INTERNO" ? "⚙️ Área Master" : "📊 Meu Painel";	
        btnTop.onclick = () => { 
            window.location.href = usuarioLogado.tipo === "INTERNO" ? "admin.html" : "dashboard_cliente.html"; 
        };
    }
}

function efetuarLogout() {
    sessionStorage.removeItem('sessaoTISS');
    window.location.href = "index.html";
}

window.onload = () => {
    const sessaoSalva = sessionStorage.getItem('sessaoTISS');
    if (sessaoSalva) {
        usuarioLogado = JSON.parse(sessaoSalva);
        atualizarTopoSite();
    }
    iniciarRotacaoPublicidade();
};

async function solicitarConta() {
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const senha = document.getElementById('reg-senha').value;
    
    const regexSenha = /(?=.*[!@#$%^&*]).{8,}/;
    if (!regexSenha.test(senha)) {
        alert("A palavra-passe deve ter pelo menos 8 caracteres e um caractere especial (!@#$...).");
        return;
    }
    
    if (!nome || !email) {
        alert("Preencha todos os campos obrigatórios.");
        return;
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'registro', nome: nome, email: email, senha: senha })
        });
        
        const data = await response.json();
        
        if (response.ok && data.sucesso) {
            alert(data.mensagem);
            alternarFormAuth('login'); 
        } else {
            alert(`Erro no registo: ${data.erro}`);
        }
    } catch (error) {
        alert("Erro ao enviar o pedido de registo.");
    }
}

// --- FUNÇÕES DE APOIO (TISS) ---
function buscarVariasTags(node, nomeTag) {
    let elementos = node.getElementsByTagNameNS("*", nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName(nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName("ans:" + nomeTag);
    return elementos;
}

function buscarTagUnica(node, nomeTag) {
    const elementos = buscarVariasTags(node, nomeTag);
    return elementos.length > 0 ? elementos[0] : null;
}

function extrairTexto(node, nomeTag, valorPadrao = "Não informado") {
    const elemento = buscarTagUnica(node, nomeTag);
    return elemento ? elemento.textContent.trim() : valorPadrao;
}

function obterNomeDespesaTISS(codigo) {
    const dominios = { "01": "Gasoterapia", "02": "Medicamentos", "03": "Materiais", "05": "Diárias", "07": "Taxas e Alugueis", "08": "Órteses/Próteses (OPME)" };
    return dominios[codigo] || "Outra Despesa";
}

// --- MOTOR DE REGRAS DE NEGÓCIO ---
function validarRegrasNegocio(guia, tipoGuia, dataAtendimentoStr) {
    let badgesHTML = '';
    let validacoesHTML = '';

    // 1. REGRAS PADRÃO DO SISTEMA
    if (dataAtendimentoStr && dataAtendimentoStr !== "Não informado") {
        const partesData = dataAtendimentoStr.split('T')[0].split('-'); 
        if (partesData.length === 3) {
            const dataAtend = new Date(partesData[0], partesData[1] - 1, partesData[2]);
            const hoje = new Date();
            const diffDias = Math.ceil((hoje - dataAtend) / (1000 * 60 * 60 * 24));
            if (diffDias > 60) validacoesHTML += `<div class="alerta-box">⚠️ Guia fora da janela de retroatividade (> 60 dias).</div>`;
        }
    }

    if (tipoGuia === 'guiaConsulta') {
        if (extrairTexto(guia, "indicacaoAcidente") === "Não informado") validacoesHTML += `<div class="erro-box">❌ Campo 'Indicação de Acidente' ausente.</div>`;
    } else if (tipoGuia === 'guiaSP-SADT') {
        const carater = extrairTexto(guia, "caraterAtendimento");
        if (carater === "2" || carater === "U") {
            badgesHTML += `<span class="badge bg-urgencia">URGÊNCIA</span>`;
        } else if (carater === "1" || carater === "E") {
            badgesHTML += `<span class="badge bg-eletivo">ELETIVO</span>`;
        }
    } else if (tipoGuia === 'guiaResumoInternacao') {
        const obitos = ["41", "42", "43", "61", "62", "63", "64"];
        if (obitos.includes(extrairTexto(guia, "motivoEncerramento"))) {
            badgesHTML += `<span class="badge bg-obito">ÓBITO</span>`;
            validacoesHTML += `<div class="alerta-box">⚠️ Óbito identificado. Gatilho de bloqueio acionado.</div>`;
        }
    }

    // 2. NOVAS REGRAS CUSTOMIZADAS DO CLIENTE (ERP Avançado)
    if (typeof regrasAtivasCliente !== 'undefined' && regrasAtivasCliente.length > 0) {
        regrasAtivasCliente.forEach(regra => {
            if (regra.tipoGuia === 'TODAS' || regra.tipoGuia === tipoGuia) {
                let disparar = false;

                // A) Valor Total
                if (regra.campoValidado === 'valorTotalGeral') {
                    let valorStr = extrairTexto(guia, "valorTotalGuia") !== "Não informado" ? extrairTexto(guia, "valorTotalGuia") : extrairTexto(guia, "valorTotalGeral");
                    if (valorStr !== "Não informado") {
                        let valorGuia = parseFloat(valorStr);
                        let valorRegra = parseFloat(regra.valorEsperado);
                        if (regra.condicao === 'MAIOR_QUE' && valorGuia > valorRegra) disparar = true;
                        if (regra.condicao === 'IGUAL' && valorGuia === valorRegra) disparar = true;
                    }
                }

                // B) Código do Procedimento
                if (regra.campoValidado === 'codigoProcedimento') {
                    let procs = Array.from(buscarVariasTags(guia, "procedimentoExecutado") || []);
                    let desps = Array.from(buscarVariasTags(guia, "despesa") || []);
                    let itens = procs.concat(desps);
                    
                    itens.forEach(item => {
                        let cod = extrairTexto(item, "codigoProcedimento");
                        if (cod !== "Não informado") {
                            if (regra.condicao === 'IGUAL' && cod === regra.valorEsperado) disparar = true;
                            if (regra.condicao === 'CONTEM' && cod.includes(regra.valorEsperado)) disparar = true;
                        }
                    });
                }

                // C) Quantidade Faturada
                if (regra.campoValidado === 'quantidadeDespesa') {
                    let procs = Array.from(buscarVariasTags(guia, "procedimentoExecutado") || []);
                    let desps = Array.from(buscarVariasTags(guia, "despesa") || []);
                    let itens = procs.concat(desps);
                    
                    itens.forEach(item => {
                        let qtdStr = extrairTexto(item, "quantidadeExecutada");
                        if (qtdStr !== "Não informado") {
                            let qtd = parseFloat(qtdStr);
                            let limite = parseFloat(regra.valorEsperado);
                            if (regra.condicao === 'MAIOR_QUE' && qtd > limite) disparar = true;
                            if (regra.condicao === 'IGUAL' && qtd === limite) disparar = true;
                        }
                    });
                }

                // D) Grau de Participação
                if (regra.campoValidado === 'grauParticipacao') {
                    let itens = Array.from(buscarVariasTags(guia, "procedimentoExecutado") || []);
                    itens.forEach(item => {
                        let grau = extrairTexto(item, "grauParticipacao");
                        if (grau === "Não informado") grau = extrairTexto(item, "grauPart");
                        if (grau !== "Não informado") {
                            if (regra.condicao === 'IGUAL' && grau === regra.valorEsperado) disparar = true;
                            if (regra.condicao === 'CONTEM' && grau.includes(regra.valorEsperado)) disparar = true;
                        }
                    });
                }

                // E) Tipo de Despesa TISS
                if (regra.campoValidado === 'tipoDespesa') {
                    let despesas = Array.from(buscarVariasTags(guia, "despesa") || []);
                    despesas.forEach(desp => {
                        let tipo = extrairTexto(desp, "codigoDespesa");
                        if (tipo !== "Não informado") {
                            if (regra.condicao === 'IGUAL' && tipo === regra.valorEsperado) disparar = true;
                            if (regra.condicao === 'CONTEM' && tipo.includes(regra.valorEsperado)) disparar = true;
                        }
                    });
                }

                // Disparo visual no Front-end
                if (disparar) {
                    if (regra.acao === 'BLOQUEIO') {
                        badgesHTML += `<span class="badge" style="background-color: #dc3545; color: white;">BLOQUEIO</span>`;
                        validacoesHTML += `<div class="erro-box">❌ <strong>Regra: ${regra.nomeRegra}</strong> - ${regra.mensagemErro}</div>`;
                    } else {
                        badgesHTML += `<span class="badge" style="background-color: #f39c12; color: white;">ALERTA</span>`;
                        validacoesHTML += `<div class="alerta-box">⚠️ <strong>Regra: ${regra.nomeRegra}</strong> - ${regra.mensagemErro}</div>`;
                    }
                }
            }
        });
    }

    return { badges: badgesHTML, alertas: validacoesHTML };
}

// --- CHAMADA REAL DE IA LIGADA AO PYTHON ---
async function analisarGuiaIA(idUnico, numeroGuia, provedor) {
    if (!usuarioLogado) {
        abrirModal('modalAuth');
        return; 
    }
    
    if (usuarioLogado.statusPagamento !== 'ATIVO' || usuarioLogado.tokensRestantes <= 0) {
        alert("O seu plano não está ativo ou esgotou o limite de tokens. Contacte o administrador.");
        return;
    }

    const btnClicado = document.getElementById(`btn-ia-${provedor}-${idUnico}`);
    const divResultado = document.getElementById(`resultado-ia-${idUnico}`);
    const nomesProvedores = { 'gemini': '✨ Gemini', 'chatgpt': '✨ ChatGPT', 'deepseek': '✨ DeepSeek' };
    const nomeIA = nomesProvedores[provedor];

    if (!btnClicado || !divResultado) {
        alert("Erro de interface. Tente expandir a guia novamente.");
        return;
    }

    btnClicado.disabled = true;
    btnClicado.innerText = "⏳ A processar...";
    divResultado.style.display = 'block';
    divResultado.innerHTML = `<strong>Aguarde...</strong> O ${nomeIA} está a analisar a guia <strong>${numeroGuia}</strong>...`;

    try {
        const itensDestaGuia = dadosParaExportacao.filter(item => item.numeroGuia === numeroGuia);

        const response = await fetch('/api/auditoria', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                guia: numeroGuia, 
                itens: itensDestaGuia, 
                provedor: provedor,
                email: usuarioLogado.email 
            })
        });

        const data = await response.json();

        if (response.ok) {
            usuarioLogado.tokensRestantes -= 1;
            document.getElementById('user-status').innerText = `👤 ${usuarioLogado.nome} | Saldo: ${usuarioLogado.tokensRestantes} IA`;

            let textoFormatado = '';
            try {
                const iaJson = JSON.parse(data.analise.replace(/```json/g, '').replace(/```/g, ''));
                textoFormatado = `<strong>Status:</strong> ${iaJson.status === 'ALERTA' ? '<span style="color:red">⚠️ ALERTA</span>' : '<span style="color:green">✅ OK</span>'}<br><br>`;
                textoFormatado += `<strong>Achados da Auditoria:</strong><br>• ${iaJson.achados.join('<br>• ')}`;
            } catch(e) {
                textoFormatado = data.analise.replace(/\n/g, '<br>');
            }
            
            divResultado.innerHTML = `
                <strong style="color: #333; font-size: 14px;">Parecer do Auditor IA (${nomeIA})</strong><br><br>
                ${textoFormatado}
            `;
        } else {
            divResultado.innerHTML = `<span style="color: #d8000c;"><strong>Erro:</strong> ${data.erro}</span>`;
        }
    } catch (error) {
        divResultado.innerHTML = `<span style="color: #d8000c;"><strong>Erro na Conexão:</strong> Não foi possível alcançar a IA.</span>`;
    } finally {
        btnClicado.disabled = false;
        btnClicado.innerText = nomeIA;
    }
}

// --- PROCESSAMENTO CENTRAL E EXTRAÇÃO ---
async function processarXML() {
    const fileInput = document.getElementById('xmlInput');
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        const xmlContent = e.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
        
        const parserError = buscarTagUnica(xmlDoc, "parsererror");
        if (parserError) {
            document.getElementById('resultado').innerHTML = `<div class="erro-box"><strong>Erro de formatação:</strong> O arquivo não é um XML válido.</div>`;
            alterarPasso(3);
            return;
        }

        let versaoTiss = "Versão não encontrada";
        let operadoraID = "Não identificada";
        let prestadorID = "Não informado";
        
        const cabecalho = buscarTagUnica(xmlDoc, "cabecalho");
        if (cabecalho) {
            const tagPadrao = buscarTagUnica(cabecalho, "Padrao") || buscarTagUnica(cabecalho, "versaoPadrao");
            if (tagPadrao) versaoTiss = tagPadrao.textContent.trim();

            const destino = buscarTagUnica(cabecalho, "destino");
            if (destino) {
                const regANS = buscarTagUnica(destino, "registroANS");
                const cnpj = buscarTagUnica(destino, "cnpj");
                if (regANS) operadoraID = "Registro ANS: " + regANS.textContent.trim();
                else if (cnpj) operadoraID = "CNPJ: " + cnpj.textContent.trim();
            }
            
            const origem = buscarTagUnica(cabecalho, "origem");
            if (origem){
                const prestador = buscarTagUnica(origem, "CNPJ") || buscarTagUnica(origem, "codigoPrestadorNaOperadora");
                if (prestador) prestadorID = prestador.textContent.trim();
            }
        }

        try {
			if (usuarioLogado && usuarioLogado.tipo === "CLIENTE") {
				try {
					const resRegras = await fetch(`/api/regras?clienteId=${usuarioLogado.id}`);
					if (resRegras.ok) regrasAtivasCliente = await resRegras.json();
				} catch (e) { console.log("Erro ao carregar regras customizadas"); }
			}
            const response = await fetch('/api/validador', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xml: xmlContent, versao: versaoTiss })
            });
            const data = await response.json();

            if (response.ok && data.valido) {
                const tiposGuias = ["guiaConsulta", "guiaSP-SADT", "guiaResumoInternacao", "guiaHonorarioIndividual", "guiaOdontologia"];
                let guiasHTML = '';
                let totalGuias = 0;
                
                let valorTotalLote = 0;
                let valorGasoterapia = 0;
                let valorMateriais = 0;
                let valorMedicamentos = 0;
                let valorDiarias = 0;
                let valorTaxasAlugueis = 0;
                let valorOPME = 0;
                let valorTotalProcedimentosItem = 0;
                
                dadosParaExportacao = [];

                tiposGuias.forEach(tipo => {
                    let guias = buscarVariasTags(xmlDoc, tipo);

                    for(let i = 0; i < guias.length; i++) {
                        totalGuias++;
                        const guia = guias[i];
                        
                        const numeroGuia = extrairTexto(guia, "numeroGuiaPrestador");
                        const nomeBeneficiario = extrairTexto(guia, "nomeBeneficiario");
                        const carteira = extrairTexto(guia, "numeroCarteira");
                        let dataAtendimento = extrairTexto(guia, "dataAtendimento");
                        if (dataAtendimento === "Não informado") dataAtendimento = extrairTexto(guia, "dataExecucao");
                        
                        let valorGuiaStr = extrairTexto(guia, "valorTotalGuia");
                        if (valorGuiaStr === "Não informado") valorGuiaStr = extrairTexto(guia, "valorTotalGeral");
                        
                        let valorGuia = 0;
                        let valorTotalProcedimentos = 0;
                        let valorTotalOutrasDespesas = 0;

                        const regrasAuditoria = validarRegrasNegocio(guia, tipo, dataAtendimento);

                        let dadosExecutanteGuia = "Não informado";
                        let dadosExecutante = buscarTagUnica(guia, "dadosExecutante");
                        if (dadosExecutante){
                            let cod = extrairTexto(guia, "codigoPrestadorNaOperadora");
                            if(cod === "Não informado") cod = extrairTexto(guia, "cnpjContratado");
                            const nome = extrairTexto(guia, "nomeContratado") || extrairTexto(guia, "nomeContratadoExecutante");
                            if(nome !== "Não informado") dadosExecutanteGuia = `(${cod}) ${nome}`;
                        }

                        const nomeExibicaoGuia = tipo.replace('guia', 'Guia ').replace('SP-SADT', 'SP/SADT');
                        let procedimentos = buscarVariasTags(guia, "procedimentoExecutado");
                        let despesas = buscarVariasTags(guia, "despesa"); 
                        
                        let tabelaProcedimentosHTML = '';
                        let tabelaOutrasDespesasHTML = '';

                        if (procedimentos.length > 0) {
                            tabelaProcedimentosHTML = `
                                <details style="margin-top: 15px; border: 1px solid #cce5ff; border-radius: 6px; overflow: hidden; background: #fff;">
                                    <summary style="cursor: pointer; font-weight: bold; padding: 10px; background-color: #e6f2ff; color: #004085; outline: none;"> 
                                        💵 Procedimentos Executados (${procedimentos.length})								
                                    </summary>
                                    <div style="padding: 10px;">
                                        <table class="tabela-dados">
                                            <tr style="background-color: #f0f0f0;">
                                                <th>Tabela</th><th>Código</th><th>Descrição</th><th>Profissional</th><th>Qtd</th><th>V. Unit</th><th>V. Total</th>
                                            </tr>
                            `;
                            for(let p = 0; p < procedimentos.length; p++) {
                                const proc = procedimentos[p];
                                const tabela = extrairTexto(proc, "codigoTabela");
                                const codigo = extrairTexto(proc, "codigoProcedimento");
                                const descricao = extrairTexto(proc, "descricaoProcedimento");
                                const qtd = extrairTexto(proc, "quantidadeExecutada");
                                const vlUnit = extrairTexto(proc, "valorUnitario");
                                const valorTotalProc = extrairTexto(proc, "valorTotal");
                                
                                let grauPart = extrairTexto(proc, "grauParticipacao");
                                if (grauPart === "Não informado") grauPart = extrairTexto(proc, "grauPart"); 
                                
                                let nomeProf = extrairTexto(proc, "nomeProfissional");
                                if (nomeProf === "Não informado") nomeProf = extrairTexto(proc, "nomeProf");
                                
                                let profHTML = `<span style="color: #999; font-size: 11px;">Não informado</span>`;
                                if (nomeProf !== "Não informado" || grauPart !== "Não informado") {
                                    profHTML = `
                                        <details style="background: #fdfdfd; padding: 2px; border-radius: 4px; border: 1px solid #eee;">
                                            <summary style="cursor: pointer; color: #0056b3; outline: none; font-weight: bold; font-size: 11px;">Ver Equipe</summary>
                                            <div style="margin-top: 5px; font-size: 11px; color: #333;">
                                                <strong>Nome:</strong> ${nomeProf}<br>
                                                <strong>Grau Part.:</strong> ${grauPart}
                                            </div>
                                        </details>
                                    `;
                                }

                                let valorProc = 0;
                                if (valorTotalProc !== "Não informado"){
                                    valorProc = parseFloat(valorTotalProc);
                                    valorTotalProcedimentos += valorProc;
                                    valorGuia += valorProc;
                                    valorTotalProcedimentosItem += valorProc;
                                } 				
                                valorTotalLote += valorProc;
                                
                                tabelaProcedimentosHTML += `<tr><td>${tabela}</td><td>${codigo}</td><td>${descricao}</td><td>${profHTML}</td><td>${qtd}</td><td>R$ ${vlUnit}</td><td>R$ ${valorTotalProc}</td></tr>`;
                                
                                dadosParaExportacao.push({
                                    tipoGuia: nomeExibicaoGuia, numeroGuia: numeroGuia, beneficiario: nomeBeneficiario, 
                                    tabela: tabela, codigoItem: codigo, descricaoItem: descricao, tipoDespesa: "Procedimentos",
                                    profissional: nomeProf, grauParticipacao: grauPart,
                                    qtdItem: qtd, valorUnitario: vlUnit.replace('.',','), valorItem: valorTotalProc.replace('.', ',')
                                });
                            }
                            tabelaProcedimentosHTML += `</table><div style="text-align: right; margin-top: 5px; color: #0056b3; font-weight: bold;">Total Procedimentos: R$ ${valorTotalProcedimentos.toFixed(2).replace('.', ',')}</div></div></details>`;
                        }

                        if(despesas.length > 0) {
                            tabelaOutrasDespesasHTML = `
                                <details style="margin-top: 15px; border: 1px solid #cce5ff; border-radius: 6px; overflow: hidden; background: #fff;">
                                    <summary style="cursor: pointer; font-weight: bold; padding: 10px; background-color: #e6f2ff; color: #004085; outline: none;">
                                        📦 Outras Despesas / OPME (${despesas.length})												
                                    </summary>
                                    <div style="padding: 10px;">
                                        <table class="tabela-dados">
                                            <tr style="background-color: #f0f0f0;">
                                                <th>Tipo</th><th>Tabela</th><th>Código</th><th>Descrição</th><th>Qtd</th><th>V. Total</th>
                                            </tr>
                            `;
                            for(let o = 0; o < despesas.length; o++) {
                                const desp = despesas[o];
                                const tabela = extrairTexto(desp, "codigoTabela");
                                const codigo = extrairTexto(desp, "codigoProcedimento");
                                const descricao = extrairTexto(desp, "descricaoProcedimento");
                                const qtd = extrairTexto(desp, "quantidadeExecutada");
                                const vlUnit = extrairTexto(desp, "valorUnitario");
                                const valorTotalDesp = extrairTexto(desp, "valorTotal");
                                const tipoDespesaCod = extrairTexto(desp, "codigoDespesa"); 
                                const tipoDespesaNome = obterNomeDespesaTISS(tipoDespesaCod);
                                
                                let vlDespesa = 0;
                                if (valorTotalDesp !== "Não informado"){
                                    vlDespesa = parseFloat(valorTotalDesp);	
                                    valorGuia += vlDespesa;																				
                                    if(tipoDespesaCod === '01') valorGasoterapia += vlDespesa;
                                    else if(tipoDespesaCod === '02') valorMedicamentos += vlDespesa;
                                    else if(tipoDespesaCod === '03') valorMateriais += vlDespesa;
                                    else if(tipoDespesaCod === '05') valorDiarias += vlDespesa;
                                    else if(tipoDespesaCod === '07') valorTaxasAlugueis += vlDespesa;
                                    else if(tipoDespesaCod === '08') valorOPME += vlDespesa;
                                    
                                    valorTotalOutrasDespesas += vlDespesa;
                                    valorTotalLote += vlDespesa;
                                }
                                tabelaOutrasDespesasHTML += `<tr><td><span class="badge" style="background:#6c757d;">${tipoDespesaCod} - ${tipoDespesaNome}</span></td><td>${tabela}</td><td>${codigo}</td><td>${descricao}</td><td>${qtd}</td><td>R$ ${valorTotalDesp}</td></tr>`;
                                dadosParaExportacao.push({
                                    tipoGuia: nomeExibicaoGuia, numeroGuia: numeroGuia, beneficiario: nomeBeneficiario, 
                                    tabela: tabela, codigoItem: codigo, descricaoItem: descricao, tipoDespesa: tipoDespesaNome,
                                    qtdItem: qtd, valorUnitario: vlUnit.replace('.',','), valorItem: valorTotalDesp.replace('.', ',')
                                });
                            }
                            tabelaOutrasDespesasHTML += `</table><div style="text-align: right; margin-top: 5px; color: #0056b3; font-weight: bold;">Total Despesas: R$ ${valorTotalOutrasDespesas.toFixed(2).replace('.', ',')}</div></div></details>`;
                        }

                        guiasHTML += `
                        <details style="margin-bottom: 10px; border: 1px solid #b8daff; border-radius: 6px; background: #fff; overflow: hidden;">
                            <summary style="cursor: pointer; font-weight: bold; padding: 12px; background-color: #e2eef9; color: #004085; display: flex; justify-content: space-between;">
                                <span>📄 ${numeroGuia} | ${nomeBeneficiario} ${regrasAuditoria.badges}</span>
                                <span style="color: #0056b3;">R$ ${valorGuia.toFixed(2).replace('.', ',')}</span>
                            </summary>
                            <div style="padding: 15px;">
                                ${regrasAuditoria.alertas}
                                
                                <h4 style="margin: 0 0 10px 0; color: #333;">O que está a ser cobrado:</h4>
                                <table class="tabela-dados" style="margin-top: 0;">
                                    <tr><th>Executante</th><td>${dadosExecutanteGuia}</td></tr>
                                    <tr><th>Guia / Data</th><td>${nomeExibicaoGuia} - ${dataAtendimento}</td></tr>
                                </table>
                                
                                ${tabelaProcedimentosHTML}
                                ${tabelaOutrasDespesasHTML}
                                
                                <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                                    <button onclick="analisarGuiaIA(${totalGuias}, '${numeroGuia}', 'gemini')" style="background-color: #1a73e8; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">✨ Analisar com Gemini</button>
                                    <button onclick="analisarGuiaIA(${totalGuias}, '${numeroGuia}', 'chatgpt')" style="background-color: #10a37f; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">✨ Analisar com ChatGPT</button>
                                </div>
                            </div>
                        </details>
                        `;
                    }
                });

                const htmlSucesso = `
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #ddd;">
                        <h4 style="margin: 0 0 10px 0; color: #333;">Resumo Financeiro do Lote</h4>
                        <p style="margin: 5px 0;"><strong>Enviado por:</strong> <span style="color: #0056b3;">${prestadorID}</span> | <strong>Operadora:</strong> ${operadoraID}</p>
                        <p style="margin: 5px 0;"><strong>Total de Guias:</strong> <span style="color: blue; font-weight: bold;">${totalGuias}</span></p>
                        <p style="margin: 5px 0; font-size: 16px;"><strong>Valor Total a Pagar:</strong> <span style="color: red; font-weight: bold;">R$ ${valorTotalLote.toFixed(2).replace('.', ',')}</span></p>
                        
                        <details style="background: #ededff; padding: 10px; border-radius: 4px; border: 1px solid #eee; margin-top: 15px;">
                             <summary style="cursor: pointer; color: #0056b3; font-weight: bold;">Ver Detalhamento por Tipo de Despesa</summary>
                             <table class="tabela-dados" style="margin-top: 10px;">
                                <tr><th>Total de Procedimentos:</th> <td><strong style="color: red;">R$ ${valorTotalProcedimentosItem.toFixed(2).replace('.',',')}</strong></td></tr>
                                <tr><th>Total de Diárias:</th> <td><strong style="color: red;">R$ ${valorDiarias.toFixed(2).replace('.',',')}</strong></td></tr> 
                                <tr><th>Total de Taxas e Alugueis:</th> <td><strong style="color: red;">R$ ${valorTaxasAlugueis.toFixed(2).replace('.',',')}</strong></td></tr>
                                <tr><th>Total de Materiais:</th> <td><strong style="color: red;">R$ ${valorMateriais.toFixed(2).replace('.',',')}</strong></td></tr> 
                                <tr><th>Total de Medicamentos:</th> <td><strong style="color: red;">R$ ${valorMedicamentos.toFixed(2).replace('.',',')}</strong></td></tr>
                                <tr><th>Total de Gasoterapia:</th> <td><strong style="color: red;">R$ ${valorGasoterapia.toFixed(2).replace('.',',')}</strong></td></tr>
                                <tr><th>Total de OPME:</th> <td><strong style="color: red;">R$ ${valorOPME.toFixed(2).replace('.',',')}</strong></td></tr>
                             </table>
                        </details>
                    </div>					
                    <h4 style="color: #333; margin-bottom: 10px;">Análise Individual das Guias</h4>
                    ${guiasHTML || "<p>Nenhuma guia detalhada encontrada.</p>"}
                `;
                
                document.getElementById('resultado').innerHTML = htmlSucesso;
                document.getElementById('btnExportar').style.display = 'inline-block';
                alterarPasso(3);
                
            } else {
                document.getElementById('resultado').innerHTML = `<div class="erro-box"><strong>❌ Erro XSD:</strong> ${data.erros.join('<br>')}</div>`;
                alterarPasso(3);
            }
        } catch (error) {
            document.getElementById('resultado').innerHTML = `<div class="erro-box"><strong>Erro de Conexão:</strong> ${error.message}</div>`;
            alterarPasso(3);
        }
    };
    reader.readAsText(file);
}

function exportarExcel() {
    if (dadosParaExportacao.length === 0) return;
    let csvContent = "\uFEFF"; 
    csvContent += "Tipo de Guia;Número da Guia;Nome do Beneficiário;Data Atendimento;Tabela;Código Item;Descrição do Item;Tipo Despesa;Quantidade;Valor Unitário;Valor Total\r\n";
    dadosParaExportacao.forEach(l => {
        csvContent += `${l.tipoGuia};${l.numeroGuia};${l.beneficiario};${l.data};${l.tabela};${l.codigoItem};${l.descricaoItem.replace(/;/g, ",")};${l.tipoDespesa};${l.qtdItem};${l.valorUnitario};${l.valorItem}\r\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Relatorio_TISS_Completo.csv");
    link.click();
}

// --- MOTOR DE ROTAÇÃO DE PUBLICIDADE DINÂMICA ---
let filaAnuncios = [];
let anuncioAtual = 0;

async function iniciarRotacaoPublicidade() {
    const bannersCabecalho = document.querySelectorAll('.ad-banner-animated');
    const bannersRodape = document.querySelectorAll('.ad-banner-animated-rodape');
    if (bannersCabecalho.length === 0 && bannersRodape.length === 0) return;

    try {
        const response = await fetch('/api/campanhas');
        if (response.ok) {
            filaAnuncios = await response.json();
        }
    } catch (e) {
        console.log("A carregar anúncios locais (API não disponível).");
    }

    if (filaAnuncios.length === 0) {
        filaAnuncios = [
            { titulo: "🚀 O seu software médico visto por milhares!", texto: "Anuncie no portal", link: "modal", cor: "linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5)", local: "TODOS" },
            { titulo: "🎓 Especialização em Auditoria TISS", texto: "Aprenda a evitar glosas.", link: "https://google.com", cor: "linear-gradient(-45deg, #23a6d5, #23d5ab)", local: "TODOS" }
        ];
    }

    setInterval(() => {
        if(filaAnuncios.length === 0) return;
        
        anuncioAtual = (anuncioAtual + 1) % filaAnuncios.length;
        const ad = filaAnuncios[anuncioAtual];
        
        const htmlConteudo = `<h3 style="margin: 0; color: white;">${ad.titulo}</h3><span class="pulse-text" style="color: #333; margin-top: 5px;">${ad.texto}</span>`;
        const acaoClique = () => { ad.link === "modal" ? abrirModal('modalPublicidade') : window.open(ad.link, '_blank'); };

        if (ad.local === "CABECALHO" || ad.local === "TODOS") {
            bannersCabecalho.forEach(b => { b.style.background = ad.cor; b.innerHTML = htmlConteudo; b.onclick = acaoClique; });
        }
        if (ad.local === "RODAPE" || ad.local === "TODOS") {
            bannersRodape.forEach(b => { b.style.background = ad.cor; b.innerHTML = htmlConteudo; b.onclick = acaoClique; });
        }
    }, 6000); 
}

// --- LOGIN SEGURO ADMINISTRATIVO ---
async function efetuarLoginAdmin() {
    const email = document.getElementById('admin-email').value;
    const senha = document.getElementById('admin-senha').value;
    if (!email || !senha) { alert("Preencha as credenciais administrativas."); return; }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'login_admin', email: email, senha: senha })
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) {
            sessionStorage.setItem('sessaoTISS', JSON.stringify(data.usuario));
            window.location.href = "admin.html"; 
        } else {
            alert(`Falha no acesso restrito: ${data.erro}`);
        }
    } catch (error) { alert("Erro de conexão com o servidor."); }
}

// --- CADASTRO DE USUÁRIOS (SÓ RODA NO ADMIN.HTML) ---
async function cadastrarUsuarioInterno() {
    if (!usuarioLogado || usuarioLogado.perfil !== "ADMIN") {
        alert("Sem permissão para cadastrar utilizadores internos.");
        return;
    }

    const nome = document.getElementById('cad-nome-interno').value;
    const perfil = document.getElementById('cad-perfil-interno').value;
    const email = document.getElementById('cad-email-interno').value;
    const senha = document.getElementById('cad-senha-interno').value;

    if (!nome || !email || !senha) { alert("Preencha todos os campos."); return; }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'registro_admin', nome: nome, email: email, senha: senha, perfil: perfil })
        });
        const data = await response.json();
        if (response.ok && data.sucesso) {
            alert(data.mensagem);
            fecharModais(); 
        } else {
            alert(`Erro: ${data.erro}`);
        }
    } catch (error) { alert("Erro ao cadastrar usuário."); }
}

// --- GESTÃO DE ACESSOS (IAM) ---
function abrirModalGestaoAcessos() {
    abrirModal('modalGestaoAcessos');
    carregarListaUsuarios(); 
}

async function carregarListaUsuarios() {
    const tipo = document.getElementById('filtro-tipo-usuario').value;
    const tbody = document.getElementById('lista-usuarios-body');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">⏳ A pesquisar na base de dados...</td></tr>';
    
    try {
        const response = await fetch(`/api/gestao_usuarios?tipo=${tipo}`);
        const data = await response.json();
        
        if (response.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum registo encontrado.</td></tr>';
                return;
            }
            
            data.forEach(user => {
                const perfilStatus = tipo === 'INTERNO' ? user.perfil : user.statusConta;
                const corBadge = (perfilStatus === 'ATIVO' || perfilStatus === 'ADMIN') ? '#28a745' : (perfilStatus === 'BLOQUEADO' ? '#dc3545' : '#f39c12');
                
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${user.nome}</strong></td>
                        <td>${user.email}</td>
                        <td><span style="background: ${corBadge}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">${perfilStatus}</span></td>
                        <td>
                            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="editarAcesso('${user.id}', '${tipo}', '${perfilStatus}')">✏️ Editar</button>
                            <button class="btn btn-warning" style="padding: 4px 8px; font-size: 11px; color: #333;" onclick="resetarSenha('${user.id}', '${tipo}', '${user.email}')">🔑 Reset Senha</button>
                            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="bloquearAcesso('${user.id}', '${tipo}')">🚫 Bloquear</button>
                        </td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Erro: ${data.erro}</td></tr>`;
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro de comunicação com o servidor.</td></tr>';
    }
}

async function executarAcaoIAM(acao, id, tipo, novoDado = null) {
    try {
        const response = await fetch('/api/gestao_usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: acao, id: id, tipo: tipo, novo_dado: novoDado })
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) {
            alert(data.mensagem);
            carregarListaUsuarios(); 
        } else {
            alert(`Erro do Servidor: ${data.erro}`);
        }
    } catch(e) {
        alert("Erro de comunicação com o servidor.");
    }
}

function resetarSenha(id, tipo, email) {
    if(confirm(`Confirma a redefinição de senha para ${email}?\nA nova senha provisória será: Mudar@123`)) {
        executarAcaoIAM('resetar', id, tipo);
    }
}

function bloquearAcesso(id, tipo) {
    if(confirm("Deseja realmente bloquear este utilizador? Ele perderá imediatamente o acesso ao sistema.")) {
        executarAcaoIAM('bloquear', id, tipo);
    }
}

function editarAcesso(id, tipo, statusAtual) {
    const instrucao = tipo === 'INTERNO' 
        ? "Digite o novo PERFIL (ADMIN, OPERACAO, PUBLICIDADE, GESTAO):" 
        : "Digite o novo STATUS (ATIVO, PENDENTE, BLOQUEADO):";
        
    const novoValor = prompt(instrucao, statusAtual);
    
    if (novoValor && novoValor.trim() !== "" && novoValor.toUpperCase() !== statusAtual) {
        executarAcaoIAM('editar', id, tipo, novoValor);
    }
}

// --- DASHBOARD DO CLIENTE: REGRAS CUSTOMIZADAS ---
function abrirModalNovaRegra() {
    document.getElementById('titulo-modal-regra').innerText = "Criar Gatilho de Validação";
    document.getElementById('regra-id').value = ""; 
    document.getElementById('regra-nome').value = "";
    document.getElementById('regra-valor').value = "";
    document.getElementById('regra-mensagem').value = "";
    abrirModal('modalNovaRegra');
}

function abrirModalEdicao(id, nome, tipoGuia, campo, condicao, valor, acao, mensagem) {
    document.getElementById('titulo-modal-regra').innerText = "✏️ Editar Regra";
    document.getElementById('regra-id').value = id;
    document.getElementById('regra-nome').value = nome;
    document.getElementById('regra-tipo').value = tipoGuia;
    document.getElementById('regra-campo').value = campo;
    document.getElementById('regra-condicao').value = condicao;
    document.getElementById('regra-valor').value = valor;
    document.getElementById('regra-acao').value = acao;
    document.getElementById('regra-mensagem').value = mensagem;
    abrirModal('modalNovaRegra');
}

async function carregarRegrasCliente() {
    if (!usuarioLogado) return; 
    
    const tbody = document.getElementById('lista-regras-body');
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">⏳ A comunicar com o servidor...</td></tr>';
    
    try {
        const response = await fetch(`/api/regras?clienteId=${usuarioLogado.id}`);
        const data = await response.json();
        
        if (response.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma regra configurada. Crie a sua primeira regra!</td></tr>';
                return;
            }
            
            data.forEach(r => {
                const corBadge = r.acao === 'BLOQUEIO' ? '#dc3545' : '#f39c12';
                const nomeSeguro = r.nomeRegra ? r.nomeRegra.replace(/'/g,"") : "Regra";
                const msgSegura = r.mensagemErro ? r.mensagemErro.replace(/'/g,"") : "";
                const argsEdit = `'${r.id}', '${nomeSeguro}', '${r.tipoGuia}', '${r.campoValidado}', '${r.condicao}', '${r.valorEsperado}', '${r.acao}', '${msgSegura}'`;
                
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${r.nomeRegra}</strong></td>
                        <td>${r.tipoGuia} <br><span style="font-size: 11px; color: #666;">Campo: ${r.campoValidado}</span></td>
                        <td>${r.condicao} <strong>${r.valorEsperado}</strong></td>
                        <td><span style="background: ${corBadge}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${r.acao}</span></td>
                        <td>
                            <button class="btn btn-warning" style="padding: 4px 8px; font-size: 11px; color: #333;" onclick="abrirModalEdicao(${argsEdit})">✏️ Editar</button>
                            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="excluirRegra('${r.id}')">🗑️ Cancelar</button>
                        </td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#dc3545;"><strong>Erro da API:</strong> ${data.erro || 'Motivo desconhecido.'}</td></tr>`;
        }
    } catch (e) {
        console.error("Erro Crítico no JS:", e);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#dc3545;"><strong>Erro Crítico:</strong> ${e.message}</td></tr>`;
    }
}

async function salvarRegra() {
    const dados = {
        id: document.getElementById('regra-id').value, 
        acao_req: document.getElementById('regra-id').value ? 'editar' : 'criar',
        clienteId: usuarioLogado.id,
        nomeRegra: document.getElementById('regra-nome').value,
        tipoGuia: document.getElementById('regra-tipo').value,
        campoValidado: document.getElementById('regra-campo').value,
        condicao: document.getElementById('regra-condicao').value,
        valorEsperado: document.getElementById('regra-valor').value,
        acao: document.getElementById('regra-acao').value,
        mensagemErro: document.getElementById('regra-mensagem').value
    };

    if(!dados.nomeRegra || !dados.valorEsperado || !dados.mensagemErro) {
        alert("Preencha todos os campos obrigatórios!");
        return;
    }

    try {
        const response = await fetch('/api/regras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const resultado = await response.json();
        
        if (response.ok && resultado.sucesso) {
            alert(resultado.mensagem || "Operação realizada com sucesso!");
            fecharModal('modalNovaRegra');
            carregarRegrasCliente();
        } else {
            alert(`Erro: ${resultado.erro}`);
        }
    } catch (e) { alert("Erro de comunicação com o servidor."); }
}

async function excluirRegra(idRegra) {
    if(!confirm("Tem a certeza que deseja cancelar e excluir esta regra?")) return;
    
    try {
        const response = await fetch('/api/regras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao_req: 'excluir', id: idRegra })
        });
        const resultado = await response.json();
        if (response.ok && resultado.sucesso) {
            carregarRegrasCliente();
        } else {
            alert(`Erro: ${resultado.erro}`);
        }
    } catch (e) { alert("Erro de comunicação."); }
}

window.addEventListener('DOMContentLoaded', () => {
    const sessao = JSON.parse(sessionStorage.getItem('sessaoTISS'));
    if (sessao) {
        usuarioLogado = sessao;
        const nomeEl = document.getElementById('nome-empresa-painel');
        const saldoEl = document.getElementById('saldo-tokens-painel');
        if(nomeEl) nomeEl.innerText = sessao.nome || "Empresa";
        if(saldoEl) saldoEl.innerText = sessao.tokensRestantes || 0;
        carregarRegrasCliente();
    }
});