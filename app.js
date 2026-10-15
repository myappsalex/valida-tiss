// Variáveis Globais
let dadosParaExportacao = [];
let usuarioLogado = null; 
let regrasAtivasCliente = []; 
let xmlDocAtual = null; // NOVO: Mantém o ficheiro XML original em memória para edição

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
    xmlDocAtual = null;
    alterarPasso(1);
}

// --- GESTÃO DE MODAIS E ROTAS ---
function abrirModal(idModal) { document.getElementById(idModal).style.display = 'flex'; }
function fecharModais() { document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none'); }
function solicitarCompra(tipo, pacote) { alert(`Redirecionando para o Gateway de Pagamento...\nItem: ${pacote}`); fecharModais(); }
function enviarPedidoPub() { const empresa = document.getElementById('pub-empresa').value; if(!empresa) { alert("Preencha o nome da empresa."); return; } alert(`Pedido de publicidade para ${empresa} enviado ao administrador!`); fecharModais(); }
function fecharModal(idModal) { const alvo = idModal || 'modalPremium'; const modal = document.getElementById(alvo); if (modal) { modal.style.display = 'none'; } }
function redirecionarCheckout() { alert("Redirecionando para página de pagamento..."); }

// --- AUTENTICAÇÃO (SaaS) ---
function alternarFormAuth(tipo) {
    document.getElementById('form-login').style.display = tipo === 'login' ? 'block' : 'none';
    document.getElementById('form-registro').style.display = tipo === 'registro' ? 'block' : 'none';
}
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }

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
        btnTop.onclick = () => { window.location.href = usuarioLogado.tipo === "INTERNO" ? "admin.html" : "dashboard_cliente.html"; };
    }
}

function efetuarLogout() { sessionStorage.removeItem('sessaoTISS'); window.location.href = "index.html"; }

window.onload = () => {
    const sessaoSalva = sessionStorage.getItem('sessaoTISS');
    if (sessaoSalva) { usuarioLogado = JSON.parse(sessaoSalva); atualizarTopoSite(); }
    if(typeof iniciarRotacaoPublicidade === 'function') iniciarRotacaoPublicidade();
};

async function solicitarConta() {
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const senha = document.getElementById('reg-senha').value;
    
    if (!/(?=.*[!@#$%^&*]).{8,}/.test(senha)) { alert("A palavra-passe deve ter pelo menos 8 caracteres e um caractere especial (!@#$...)."); return; }
    if (!nome || !email) { alert("Preencha todos os campos obrigatórios."); return; }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'registro', nome: nome, email: email, senha: senha })
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) { alert(data.mensagem); alternarFormAuth('login'); } 
        else { alert(`Erro no registo: ${data.erro}`); }
    } catch (error) { alert("Erro ao enviar o pedido de registo."); }
}

// --- FUNÇÕES DE APOIO (TISS) ---
function buscarVariasTags(node, nomeTag) {
    let elementos = node.getElementsByTagNameNS("*", nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName(nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName("ans:" + nomeTag);
    return elementos;
}

function buscarTagUnica(node, nomeTag) { const elementos = buscarVariasTags(node, nomeTag); return elementos.length > 0 ? elementos[0] : null; }
function extrairTexto(node, nomeTag, valorPadrao = "Não informado") { const elemento = buscarTagUnica(node, nomeTag); return elemento ? elemento.textContent.trim() : valorPadrao; }
function obterNomeDespesaTISS(codigo) { const dominios = { "01": "Gasoterapia", "02": "Medicamentos", "03": "Materiais", "05": "Diárias", "07": "Taxas e Alugueis", "08": "Órteses/Próteses (OPME)" }; return dominios[codigo] || "Outra Despesa"; }

// --- NOVAS FUNÇÕES: FILTROS E EDIÇÃO XML (AUDITORIA) ---

// 1. Filtro dinâmico nas tabelas
function filtrarTabelaTISS(inputObj, tableId, colIndex) {
    const filter = inputObj.value.toUpperCase();
    const table = document.getElementById(tableId);
    if(!table) return;
    const tr = table.getElementsByTagName("tr");
    
    for (let i = 1; i < tr.length; i++) {
        const td = tr[i].getElementsByTagName("td")[colIndex];
        if (td) {
            let txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}

// 2. Atualiza o XML real em memória quando o analista altera um input
function atualizarNodeXML(numeroGuia, tipoItem, indexItem, tagAlvo, novoValor) {
    if(!xmlDocAtual) return;
    const tiposGuias = ["guiaConsulta", "guiaSP-SADT", "guiaResumoInternacao", "guiaHonorarioIndividual", "guiaOdontologia"];
    let guiaNode = null;
    
    for(let tipo of tiposGuias) {
        let guias = buscarVariasTags(xmlDocAtual, tipo);
        for(let i=0; i<guias.length; i++) {
            if(extrairTexto(guias[i], "numeroGuiaPrestador") === numeroGuia) {
                guiaNode = guias[i]; break;
            }
        }
        if(guiaNode) break;
    }
    
    if(!guiaNode) return;

    let tagColecao = tipoItem === 'PROCEDIMENTO' ? "procedimentoExecutado" : "despesa";
    let itens = buscarVariasTags(guiaNode, tagColecao);
    if(itens[indexItem]) {
        let alvo = buscarTagUnica(itens[indexItem], tagAlvo);
        if(alvo) {
            alvo.textContent = novoValor;
            console.log(`XML Modificado: Guia ${numeroGuia} | ${tagAlvo} -> ${novoValor}`);
        }
    }
}

// 3. Exportador do XML corrigido
function exportarXMLCorrigido() {
    if (!xmlDocAtual) { alert("Nenhum ficheiro XML processado."); return; }
    
    const serializer = new XMLSerializer();
    let xmlString = serializer.serializeToString(xmlDocAtual);

    // Garante o cabeçalho correto do TISS
    if (!xmlString.startsWith("<?xml")) {
        xmlString = '<?xml version="1.0" encoding="ISO-8859-1"?>\n' + xmlString;
    }

    const blob = new Blob([xmlString], { type: 'text/xml;charset=iso-8859-1;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Lote_Corrigido_ValidaTISS.xml");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// --- MOTOR DE REGRAS DE NEGÓCIO ---
function validarRegrasNegocio(guia, tipoGuia, dataAtendimentoStr) {
    let badgesHTML = '';
    let validacoesHTML = '';

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
        if (carater === "2" || carater === "U") { badgesHTML += `<span class="badge bg-urgencia">URGÊNCIA</span>`; } 
        else if (carater === "1" || carater === "E") { badgesHTML += `<span class="badge bg-eletivo">ELETIVO</span>`; }
    } else if (tipoGuia === 'guiaResumoInternacao') {
        const obitos = ["41", "42", "43", "61", "62", "63", "64"];
        if (obitos.includes(extrairTexto(guia, "motivoEncerramento"))) {
            badgesHTML += `<span class="badge bg-obito">ÓBITO</span>`;
            validacoesHTML += `<div class="alerta-box">⚠️ Óbito identificado. Gatilho de bloqueio acionado.</div>`;
        }
    }

    if (typeof regrasAtivasCliente !== 'undefined' && regrasAtivasCliente.length > 0) {
        regrasAtivasCliente.forEach(regra => {
            if (regra.tipoGuia === 'TODAS' || regra.tipoGuia === tipoGuia) {
                let disparar = false;

                if (regra.campoValidado === 'valorTotalGeral') {
                    let valorStr = extrairTexto(guia, "valorTotalGuia") !== "Não informado" ? extrairTexto(guia, "valorTotalGuia") : extrairTexto(guia, "valorTotalGeral");
                    if (valorStr !== "Não informado") {
                        let valorGuia = parseFloat(valorStr); let valorRegra = parseFloat(regra.valorEsperado);
                        if (regra.condicao === 'MAIOR_QUE' && valorGuia > valorRegra) disparar = true;
                        if (regra.condicao === 'IGUAL' && valorGuia === valorRegra) disparar = true;
                    }
                }

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

                if (regra.campoValidado === 'quantidadeDespesa') {
                    let procs = Array.from(buscarVariasTags(guia, "procedimentoExecutado") || []);
                    let desps = Array.from(buscarVariasTags(guia, "despesa") || []);
                    let itens = procs.concat(desps);
                    itens.forEach(item => {
                        let qtdStr = extrairTexto(item, "quantidadeExecutada");
                        if (qtdStr !== "Não informado") {
                            let qtd = parseFloat(qtdStr); let limite = parseFloat(regra.valorEsperado);
                            if (regra.condicao === 'MAIOR_QUE' && qtd > limite) disparar = true;
                            if (regra.condicao === 'IGUAL' && qtd === limite) disparar = true;
                        }
                    });
                }

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

// --- CHAMADA REAL DE IA ---
async function analisarGuiaIA(idUnico, numeroGuia, provedor) {
    if (!usuarioLogado) { abrirModal('modalAuth'); return; }
    if (usuarioLogado.statusPagamento !== 'ATIVO' || usuarioLogado.tokensRestantes <= 0) { alert("Plano inativo ou saldo insuficiente."); return; }

    const btnClicado = document.getElementById(`btn-ia-${provedor}-${idUnico}`);
    const divResultado = document.getElementById(`resultado-ia-${idUnico}`);
    const nomesProvedores = { 'gemini': '✨ Gemini', 'chatgpt': '✨ ChatGPT', 'deepseek': '✨ DeepSeek' };
    const nomeIA = nomesProvedores[provedor];

    btnClicado.disabled = true; btnClicado.innerText = "⏳ A processar...";
    divResultado.style.display = 'block'; divResultado.innerHTML = `<strong>Aguarde...</strong> A analisar...`;

    try {
        const itensDestaGuia = dadosParaExportacao.filter(item => item.numeroGuia === numeroGuia);
        const response = await fetch('/api/auditoria', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guia: numeroGuia, itens: itensDestaGuia, provedor: provedor, email: usuarioLogado.email })
        });
        const data = await response.json();

        if (response.ok) {
            usuarioLogado.tokensRestantes -= 1;
            document.getElementById('user-status').innerText = `👤 ${usuarioLogado.nome} | Saldo: ${usuarioLogado.tokensRestantes} IA`;
            let textoFormatado = '';
            try {
                const iaJson = JSON.parse(data.analise.replace(/```json/g, '').replace(/```/g, ''));
                textoFormatado = `<strong>Status:</strong> ${iaJson.status === 'ALERTA' ? '<span style="color:red">⚠️ ALERTA</span>' : '<span style="color:green">✅ OK</span>'}<br><br><strong>Achados:</strong><br>• ${iaJson.achados.join('<br>• ')}`;
            } catch(e) { textoFormatado = data.analise.replace(/\n/g, '<br>'); }
            
            divResultado.innerHTML = `<strong style="color: #333; font-size: 14px;">Auditor IA (${nomeIA})</strong><br><br>${textoFormatado}`;
        } else {
            divResultado.innerHTML = `<span style="color: #d8000c;"><strong>Erro:</strong> ${data.erro}</span>`;
        }
    } catch (error) { divResultado.innerHTML = `<span style="color: #d8000c;"><strong>Erro na Conexão.</strong></span>`; } 
    finally { btnClicado.disabled = false; btnClicado.innerText = nomeIA; }
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
            document.getElementById('resultado').innerHTML = `<div class="erro-box"><strong>Erro:</strong> O arquivo não é um XML válido.</div>`;
            alterarPasso(3); return;
        }

        // Armazena em memória para permitir a exportação do XML Corrigido
        xmlDocAtual = xmlDoc;

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
				} catch (e) { console.log("Erro ao carregar regras"); }
			}
            const response = await fetch('/api/validador', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xml: xmlContent, versao: versaoTiss })
            });
            const data = await response.json();

            if (response.ok && data.valido) {
                const tiposGuias = ["guiaConsulta", "guiaSP-SADT", "guiaResumoInternacao", "guiaHonorarioIndividual", "guiaOdontologia"];
                let guiasHTML = ''; let totalGuias = 0; let valorTotalLote = 0;
                let valorGasoterapia = 0; let valorMateriais = 0; let valorMedicamentos = 0;
                let valorDiarias = 0; let valorTaxasAlugueis = 0; let valorOPME = 0; let valorTotalProcedimentosItem = 0;
                
                dadosParaExportacao = [];

                tiposGuias.forEach(tipo => {
                    let guias = buscarVariasTags(xmlDoc, tipo);
                    for(let i = 0; i < guias.length; i++) {
                        totalGuias++;
                        const guia = guias[i];
                        
                        const numeroGuia = extrairTexto(guia, "numeroGuiaPrestador");
                        const nomeBeneficiario = extrairTexto(guia, "nomeBeneficiario");
                        let dataAtendimento = extrairTexto(guia, "dataAtendimento");
                        if (dataAtendimento === "Não informado") dataAtendimento = extrairTexto(guia, "dataExecucao");
                        
                        let valorGuiaStr = extrairTexto(guia, "valorTotalGuia");
                        if (valorGuiaStr === "Não informado") valorGuiaStr = extrairTexto(guia, "valorTotalGeral");
                        
                        let valorGuia = 0; let valorTotalProcedimentos = 0; let valorTotalOutrasDespesas = 0;
                        const regrasAuditoria = validarRegrasNegocio(guia, tipo, dataAtendimento);

                        let dadosExecutanteGuia = "Não informado";
                        let dadosExecutante = buscarTagUnica(guia, "dadosExecutante");
                        if (dadosExecutante){
                            let cod = extrairTexto(guia, "codigoPrestadorNaOperadora");
                            if(cod === "Não informado") cod = extrairTexto(guia, "cnpjContratado");
                            const nome = extrairTexto(guia, "nomeContratado") || extrairTexto(guia, "nomeContratadoExecutante");
                            if(nome !== "Não informado") dadosExecutanteGuia = `(${cod})${nome}`;
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
                                        <!-- FILTROS APLICADOS PARA O ANALISTA -->
                                        <div style="margin-bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                                            <input type="text" placeholder="🔍 Filtrar Código..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-proc-${numeroGuia}', 1)">
                                            <input type="text" placeholder="🔍 Filtrar Grau Part..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-proc-${numeroGuia}', 3)">
                                        </div>
                                        <table class="tabela-dados" id="tb-proc-${numeroGuia}">
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
                                            <div style="margin-top: 5px; font-size: 11px; color: #333;"><strong>Nome:</strong> ${nomeProf}<br><strong>Grau Part.:</strong>${grauPart}</div>
                                        </details>
                                    `;
                                }

                                let valorProc = 0;
                                if (valorTotalProc !== "Não informado"){ valorProc = parseFloat(valorTotalProc); valorTotalProcedimentos += valorProc; valorGuia += valorProc; valorTotalProcedimentosItem += valorProc; } 				
                                valorTotalLote += valorProc;
                                
                                // CAMPOS EDITÁVEIS (QUANTIDADE E VALOR) QUE MODIFICAM O XML
                                let inputQtd = `<input type="number" step="0.01" value="${qtd}" onchange="atualizarNodeXML('${numeroGuia}', 'PROCEDIMENTO',${p}, 'quantidadeExecutada', this.value)" style="width: 60px; padding: 2px; border: 1px solid #ccc; border-radius: 4px;">`;
                                let inputVlTotal = `<input type="number" step="0.01" value="${valorTotalProc}" onchange="atualizarNodeXML('${numeroGuia}', 'PROCEDIMENTO',${p}, 'valorTotal', this.value)" style="width: 80px; padding: 2px; border: 1px solid #ccc; border-radius: 4px;">`;

                                tabelaProcedimentosHTML += `<tr><td>${tabela}</td><td>${codigo}</td><td>${descricao}</td><td>${profHTML}</td><td>${inputQtd}</td><td>R$ ${vlUnit}</td><td>R$ ${inputVlTotal}</td></tr>`;
                                
                                dadosParaExportacao.push({ tipoGuia: nomeExibicaoGuia, numeroGuia: numeroGuia, beneficiario: nomeBeneficiario, tabela: tabela, codigoItem: codigo, descricaoItem: descricao, tipoDespesa: "Procedimentos", profissional: nomeProf, grauParticipacao: grauPart, qtdItem: qtd, valorUnitario: vlUnit.replace('.',','), valorItem: valorTotalProc.replace('.', ',') });
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
                                        <!-- FILTROS APLICADOS PARA O ANALISTA -->
                                        <div style="margin-bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                                            <input type="text" placeholder="🔍 Filtrar Tipo (Ex: 08)..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-desp-${numeroGuia}', 0)">
                                            <input type="text" placeholder="🔍 Filtrar Tabela..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-desp-${numeroGuia}', 1)">
                                            <input type="text" placeholder="🔍 Filtrar Código..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-desp-${numeroGuia}', 2)">
                                        </div>
                                        <table class="tabela-dados" id="tb-desp-${numeroGuia}">
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
                                    vlDespesa = parseFloat(valorTotalDesp); valorGuia += vlDespesa;																				
                                    if(tipoDespesaCod === '01') valorGasoterapia += vlDespesa; else if(tipoDespesaCod === '02') valorMedicamentos += vlDespesa; else if(tipoDespesaCod === '03') valorMateriais += vlDespesa; else if(tipoDespesaCod === '05') valorDiarias += vlDespesa; else if(tipoDespesaCod === '07') valorTaxasAlugueis += vlDespesa; else if(tipoDespesaCod === '08') valorOPME += vlDespesa;
                                    valorTotalOutrasDespesas += vlDespesa; valorTotalLote += vlDespesa;
                                }
                                
                                // CAMPOS EDITÁVEIS QUE MODIFICAM O XML
                                let inputQtdD = `<input type="number" step="0.01" value="${qtd}" onchange="atualizarNodeXML('${numeroGuia}', 'DESPESA',${o}, 'quantidadeExecutada', this.value)" style="width: 60px; padding: 2px; border: 1px solid #ccc; border-radius: 4px;">`;
                                let inputVlTotalD = `<input type="number" step="0.01" value="${valorTotalDesp}" onchange="atualizarNodeXML('${numeroGuia}', 'DESPESA',${o}, 'valorTotal', this.value)" style="width: 80px; padding: 2px; border: 1px solid #ccc; border-radius: 4px;">`;

                                tabelaOutrasDespesasHTML += `<tr><td><span class="badge" style="background:#6c757d;">${tipoDespesaCod} -${tipoDespesaNome}</span></td><td>${tabela}</td><td>${codigo}</td><td>${descricao}</td><td>${inputQtdD}</td><td>R$ ${inputVlTotalD}</td></tr>`;
                                dadosParaExportacao.push({ tipoGuia: nomeExibicaoGuia, numeroGuia: numeroGuia, beneficiario: nomeBeneficiario, tabela: tabela, codigoItem: codigo, descricaoItem: descricao, tipoDespesa: tipoDespesaNome, qtdItem: qtd, valorUnitario: vlUnit.replace('.',','), valorItem: valorTotalDesp.replace('.', ',') });
                            }
                            tabelaOutrasDespesasHTML += `</table><div style="text-align: right; margin-top: 5px; color: #0056b3; font-weight: bold;">Total Despesas: R$ ${valorTotalOutrasDespesas.toFixed(2).replace('.', ',')}</div></div></details>`;
                        }

                        guiasHTML += `
                        <details style="margin-bottom: 10px; border: 1px solid #b8daff; border-radius: 6px; background: #fff; overflow: hidden;">
                            <summary style="cursor: pointer; font-weight: bold; padding: 12px; background-color: #e2eef9; color: #004085; display: flex; justify-content: space-between;">
                                <span>📄 ${numeroGuia} | ${nomeBeneficiario}${regrasAuditoria.badges}</span>
                                <span style="color: #0056b3;">R$ ${valorGuia.toFixed(2).replace('.', ',')}</span>
                            </summary>
                            <div style="padding: 15px;">
                                ${regrasAuditoria.alertas}
                                <h4 style="margin: 0 0 10px 0; color: #333;">O que está a ser cobrado:</h4>
                                <table class="tabela-dados" style="margin-top: 0;">
                                    <tr><th>Executante</th><td>${dadosExecutanteGuia}</td></tr>
                                    <tr><th>Guia / Data</th><td>${nomeExibicaoGuia} -${dataAtendimento}</td></tr>
                                </table>
                                ${tabelaProcedimentosHTML}${tabelaOutrasDespesasHTML}
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
                        <p style="margin: 5px 0;"><strong>Enviado por:</strong> <span style="color: #0056b3;">${prestadorID}</span> \vert{} <strong>Operadora:</strong>${operadoraID}</p>
                        <p style="margin: 5px 0;"><strong>Total de Guias:</strong> <span style="color: blue; font-weight: bold;">${totalGuias}</span></p>
                        <p style="margin: 5px 0; font-size: 16px;"><strong>Valor Total a Pagar:</strong> <span style="color: red; font-weight: bold;">R$ ${valorTotalLote.toFixed(2).replace('.', ',')}</span></p>
                        
                        <!-- BOTÃO DE EXPORTAÇÃO DO XML -->
                        <button onclick="exportarXMLCorrigido()" class="btn btn-success" style="margin-top: 15px; width: 100%; font-size: 14px; padding: 12px;">💾 Descarregar XML Corrigido (Livre de Glosas)</button>

                        <details style="background: #ededff; padding: 10px; border-radius: 4px; border: 1px solid #eee; margin-top: 15px;">
                             <summary style="cursor: pointer; color: #0056b3; font-weight: bold;">Ver Detalhamento por Tipo de Despesa</summary>
                             <table class="tabela-dados" style="margin-top: 10px;">
                                <tr><th>Total de Procedimentos:</th> <td><strong style="color: red;">R$ ${valorTotalProcedimentosItem.toFixed(2).replace('.',',')}</strong></td></tr>
                                <tr><th>Total de Diárias:</th> <td><strong style="color: red;">R$ ${valorDiarias.