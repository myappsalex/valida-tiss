let dadosParaExportacao = [];

// --- NAVEGAÇÃO DO WIZARD ---
function alterarPasso(passo) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${passo}`).classList.add('active');
}

function iniciarProcessamento() {
    if (document.getElementById('xmlInput').files.length === 0) return;
    alterarPasso(2);
    setTimeout(processarXML, 500); // Pequeno atraso para a interface desenhar o spinner
}

function reiniciarWizard() {
    document.getElementById('xmlInput').value = '';
    document.getElementById('resultado').innerHTML = '';
    document.getElementById('btnExportar').style.display = 'none';
    alterarPasso(1);
}


function alternarFormAuth(tipo) {
    document.getElementById('form-login').style.display = tipo === 'login' ? 'block' : 'none';
    document.getElementById('form-registro').style.display = tipo === 'registro' ? 'block' : 'none';
}

function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
// --- LIGAÇÃO REAL COM O BACK-END DE AUTENTICAÇÃO ---

async function efetuarLogin() {
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-senha').value;
    
    if (!email || !senha) {
        alert("Por favor, preencha o e-mail e a palavra-passe.");
        return;
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'login', email: email, senha: senha })
        });
        
        const data = await response.json();
        
        if (response.ok && data.sucesso) {
            usuarioLogado = data.usuario; // Guarda os dados e os tokens na sessão
            fecharModalAuth();
            alert(`Bem-vindo, ${usuarioLogado.nome}! Saldo atual: ${usuarioLogado.tokensRestantes} análises IA.`);
        } else {
            alert(`Falha no login: ${data.erro}`);
        }
    } catch (error) {
        alert("Erro ao comunicar com o servidor de autenticação.");
    }
}

async function solicitarConta() {
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const senha = document.getElementById('reg-senha').value;
    
    // Validação básica de segurança da palavra-passe no ecrã (Front-end)
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
            alternarFormAuth('login'); // Volta para o ecrã de login
        } else {
            alert(`Erro no registo: ${data.erro}`);
        }
    } catch (error) {
        alert("Erro ao enviar o pedido de registo.");
    }
}


// --- UPSELL IA E INTERCEÇÃO ---
async function analisarGuiaIA(idUnico, numeroGuia, provedor) {
    // 1. Regra de Negócio: Exigir Login e Saldo Ativo
    if (!usuarioLogado) {
        document.getElementById('modalAuth').style.display = 'flex';
        return; 
    }
    
    if (usuarioLogado.statusPagamento !== 'ATIVO' || usuarioLogado.tokensRestantes <= 0) {
        alert("O seu plano não está ativo ou esgotou o limite de tokens. Contacte o administrador.");
        return;
    }

    // 2. Execução da IA (Deduz 1 Token localmente para UX)
    usuarioLogado.tokensRestantes -= 1;
    
    // NOTA: O código de fetch('/api/auditoria') que fará a requisição real virá aqui
    alert("Simulação: Token deduzido! IA em processamento...");
}

function fecharModal() { document.getElementById('modalPremium').style.display = 'none'; }
function redirecionarCheckout() { alert("Redirecionando para página de pagamento..."); }

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

    if (dataAtendimentoStr && dataAtendimentoStr !== "Não informado") {
        const partesData = dataAtendimentoStr.split('T')[0].split('-'); 
        if (partesData.length === 3) {
            const dataAtend = new Date(partesData[0], partesData[1] - 1, partesData[2]);
            const hoje = new Date();
            const diffDias = Math.ceil((hoje - dataAtend) / (1000 * 60 * 60 * 24));
            if (diffDias > 60) validacoesHTML += `<div class="alerta-box">⚠️ Guia fora da janela de retroatividade (> 60 dias). Validar contrato.</div>`;
        }
    }

    if (tipoGuia === 'guiaConsulta') {
        if (extrairTexto(guia, "indicacaoAcidente") === "Não informado") validacoesHTML += `<div class="erro-box">❌ Campo 'Indicação de Acidente' ausente.</div>`;
        let procedimentos = buscarVariasTags(guia, "procedimentoExecutado");
        if(procedimentos.length > 0 && extrairTexto(procedimentos[0], "codigoTabela") !== "22") {
            validacoesHTML += `<div class="erro-box">❌ Código deve pertencer à Tabela TUSS 22.</div>`;
        }
    } else if (tipoGuia === 'guiaSP-SADT') {
        const carater = extrairTexto(guia, "caraterAtendimento");
        if (carater === "2" || carater === "U") {
            badgesHTML += `<span class="badge bg-urgencia">URGÊNCIA</span>`;
            validacoesHTML += `<div class="alerta-box">ℹ️ Validação de Autorização mitigada (Caráter de Urgência).</div>`;
        } else if (carater === "1" || carater === "E") {
            badgesHTML += `<span class="badge bg-eletivo">ELETIVO</span>`;
        }
    } else if (tipoGuia === 'guiaResumoInternacao') {
        const obitos = ["41", "42", "43", "61", "62", "63", "64"];
        if (obitos.includes(extrairTexto(guia, "motivoEncerramento"))) {
            badgesHTML += `<span class="badge bg-obito">ÓBITO</span>`;
            validacoesHTML += `<div class="alerta-box">⚠️ Óbito identificado. Gatilho de bloqueio de carteira acionado.</div>`;
        }
    }
    return { badges: badgesHTML, alertas: validacoesHTML };
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

        // Dados do Cabeçalho
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
            // Validação no Back-end (Vercel)
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
                
                // Variáveis de Totalização do seu código original restauradas
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
                        
                        // Dados Base
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

                        // Aplicar Motor de Regras de Negócio
                        const regrasAuditoria = validarRegrasNegocio(guia, tipo, dataAtendimento);

                        // Dados Executante
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

                        // Extração Procedimentos
                        if (procedimentos.length > 0) {
                            tabelaProcedimentosHTML = `
                                <details style="margin-top: 15px; border: 1px solid #cce5ff; border-radius: 6px; overflow: hidden; background: #fff;">
                                    <summary style="cursor: pointer; font-weight: bold; padding: 10px; background-color: #e6f2ff; color: #004085; outline: none;"> 
                                        💵 Procedimentos Executados (${procedimentos.length})								
                                    </summary>
                                    <div style="padding: 10px;">
                                        <table class="tabela-dados">
                                            <tr style="background-color: #f0f0f0;">
                                                <th>Tabela</th><th>Código</th><th>Descrição</th><th>Qtd</th><th>V. Unit</th><th>V. Total</th>
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
                                
                                // EXTRAÇÃO ROBUSTA DE PROFISSIONAL (Internação e SADT)
                                let grauPart = extrairTexto(proc, "grauParticipacao");
                                if (grauPart === "Não informado") grauPart = extrairTexto(proc, "grauPart"); // Variação de versão TISS
                                
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

                        // Extração Despesas
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

                        // Montagem Final da Guia (com Erros e Resumo Financeiro)
                        guiasHTML += `
                        <details style="margin-bottom: 10px; border: 1px solid #b8daff; border-radius: 6px; background: #fff; overflow: hidden;">
                            <summary style="cursor: pointer; font-weight: bold; padding: 12px; background-color: #e2eef9; color: #004085; display: flex; justify-content: space-between;">
                                <span>📄 ${numeroGuia} | ${nomeBeneficiario} ${regrasAuditoria.badges}</span>
                                <span style="color: #0056b3;">R$ ${valorGuia.toFixed(2).replace('.', ',')}</span>
                            </summary>
                            <div style="padding: 15px;">
                                ${regrasAuditoria.alertas} <!-- AQUI EXIBE SE ALGO ESTÁ INCORRETO -->
                                
                                <h4 style="margin: 0 0 10px 0; color: #333;">O que está a ser cobrado:</h4>
                                <table class="tabela-dados" style="margin-top: 0;">
                                    <tr><th>Executante</th><td>${dadosExecutanteGuia}</td></tr>
                                    <tr><th>Guia / Data</th><td>${nomeExibicaoGuia} - ${dataAtendimento}</td></tr>
                                </table>
                                
                                ${tabelaProcedimentosHTML}
                                ${tabelaOutrasDespesasHTML}
                                
                                <!-- Paywall dos Botões IA -->
                                <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                                    <button onclick="analisarGuiaIA(${totalGuias}, '${numeroGuia}', 'gemini')" style="background-color: #1a73e8; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">✨ Analisar com Gemini</button>
                                    <button onclick="analisarGuiaIA(${totalGuias}, '${numeroGuia}', 'chatgpt')" style="background-color: #10a37f; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">✨ Analisar com ChatGPT</button>
                                </div>
                            </div>
                        </details>
                        `;
                    }
                });

                // Resumo Financeiro Global Restaurado
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

// --- GESTÃO DE MODAIS E ROTAS ---
function abrirModal(idModal) {
    document.getElementById(idModal).style.display = 'flex';
}

function fecharModais() {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none');
}

function solicitarCompra(tipo, pacote) {
    // Na vida real, enviaria os dados do pacote para o Stripe/Asaas
    alert(`Redirecionando para o Gateway de Pagamento...\nItem: ${pacote}`);
    fecharModais();
}

function enviarPedidoPub() {
    const empresa = document.getElementById('pub-empresa').value;
    if(!empresa) { alert("Preencha o nome da empresa."); return; }
    alert(`Pedido de publicidade para ${empresa} enviado ao administrador! Em breve entraremos em contato com as métricas e contrato.`);
    fecharModais();
}

// Sobrescrita da função da IA para intercetar o fluxo de compra
async function analisarGuiaIA(idUnico, numeroGuia, provedor) {
    // Simulação: Se o utilizador não estiver logado, ofereça a venda
    if (!usuarioLogado) {
        // Redireciona para o fluxo de compra/login
        abrirModal('modalLojaTokens');
        return; 
    }
    
    // ... [Se logado, desconta token e executa a IA conforme o código que criámos anteriormente] ...
}