// Variáveis Globais
let dadosParaExportacao = [];
let usuarioLogado = null; 

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

function fecharModal() { 
    document.getElementById('modalPremium').style.display = 'none'; 
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
            usuarioLogado = data.usuario; 
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

// --- INTERCEÇÃO DA IA ---
async function analisarGuiaIA(idUnico, numeroGuia, provedor) {
    if (!usuarioLogado) {
        document.getElementById('modalAuth').style.display = 'flex';
        return; 
    }
    
    if (usuarioLogado.statusPagamento !== 'ATIVO' || usuarioLogado.tokensRestantes <= 0) {
        alert("O seu plano não está ativo ou esgotou o limite de tokens. Contacte o administrador.");
        return;
    }

    // Deduz Token Localmente e Executa a Simulação/Chamada
    usuarioLogado.tokensRestantes -= 1;
    alert(`Token Deduzido! Iniciando análise IA com ${provedor} para a Guia ${numeroGuia}...`);
    // No futuro, a chamada real de IA (`fetch('/api/auditoria')`) será injetada aqui.
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
}