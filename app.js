// Variável global para o Excel
let dadosParaExportacao = [];

// --- CONTROLE DO WIZARD (UX) ---
function alterarPasso(passo) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${passo}`).classList.add('active');
}

function iniciarProcessamento() {
    const fileInput = document.getElementById('xmlInput');
    if (fileInput.files.length === 0) return;
    
    alterarPasso(2); // Avança para o ecrã de Loading
    processarXML(); // Inicia a lógica antiga
}

function reiniciarWizard() {
    document.getElementById('xmlInput').value = '';
    document.getElementById('resultado').innerHTML = '';
    dadosParaExportacao = [];
    document.getElementById('btnExportar').style.display = 'none';
    alterarPasso(1);
}

// --- CONTROLE DE UPSELL (PAYWALL IA) ---
function analisarGuiaIA(idUnico, numeroGuia, provedor) {
    // Ao clicar em qualquer botão de IA, exibimos a oferta do plano Premium
    document.getElementById('modalPremium').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalPremium').style.display = 'none';
}

function redirecionarCheckout() {
    // Aqui insere o link para o seu Stripe, Hotmart ou página de subscrição
    window.location.href = "https://seusite.com/checkout-premium";
}

// --- FUNÇÕES DE BUSCA E DICIONÁRIOS (Sua lógica existente mantida) ---
function buscarVariasTags(node, nomeTag) {
    let elementos = node.getElementsByTagNameNS("*", nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName(nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName("ans:" + nomeTag);
    return elementos;
}

function obterNomeDespesaTISS(codigo) {
    const dominios = { "01": "Gasoterapia", "02": "Medicamentos", "03": "Materiais", "05": "Diárias", "07": "Taxas e Alugueis", "08": "Órteses/Próteses (OPME)" };
    return dominios[codigo] || "Outra Despesa";
}

function buscarTagUnica(node, nomeTag) {
    const elementos = buscarVariasTags(node, nomeTag);
    return elementos.length > 0 ? elementos[0] : null;
}

function extrairTexto(node, nomeTag, valorPadrao = "Não informado") {
    const elemento = buscarTagUnica(node, nomeTag);
    return elemento ? elemento.textContent.trim() : valorPadrao;
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
            if (diffDias < 0) validacoesHTML += `<div class="erro-box">❌ Data de atendimento futura.</div>`;
            else if (diffDias > 60) validacoesHTML += `<div class="alerta-box">⚠️ Guia fora da janela de retroatividade (> 60 dias).</div>`;
        }
    }

    if (tipoGuia === 'guiaConsulta') {
        if (extrairTexto(guia, "indicacaoAcidente") === "Não informado") validacoesHTML += `<div class="erro-box">❌ Campo 'Indicação de Acidente' ausente.</div>`;
    } else if (tipoGuia === 'guiaSP-SADT') {
        const carater = extrairTexto(guia, "caraterAtendimento");
        if (carater === "2" || carater === "U") badgesHTML += `<span class="badge bg-urgencia">URGÊNCIA</span>`;
        else if (carater === "1" || carater === "E") badgesHTML += `<span class="badge bg-eletivo">ELETIVO</span>`;
    } else if (tipoGuia === 'guiaResumoInternacao') {
        const obitos = ["41", "42", "43", "61", "62", "63", "64"];
        if (obitos.includes(extrairTexto(guia, "motivoEncerramento"))) badgesHTML += `<span class="badge bg-obito">ÓBITO</span>`;
    }
    return { badges: badgesHTML, alertas: validacoesHTML };
}

// --- O CORE DO PROCESSAMENTO ---
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
            mostrarResultado(`<div class="erro-box"><strong>Erro de formatação:</strong> O ficheiro não é um XML válido.</div>`, false);
            return;
        }

        let versaoTiss = "Versão não encontrada";
        const cabecalho = buscarTagUnica(xmlDoc, "cabecalho");
        if (cabecalho) {
            const tagPadrao = buscarTagUnica(cabecalho, "Padrao") || buscarTagUnica(cabecalho, "versaoPadrao");
            if (tagPadrao) versaoTiss = tagPadrao.textContent.trim();
        }

        try {
            // Chamada à sua Vercel (O Back-end permanece intacto)
            const response = await fetch('/api/validador', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xml: xmlContent, versao: versaoTiss })
            });

            const data = await response.json();

            if (response.ok && data.valido) {
                const tiposGuias = ["guiaConsulta", "guiaSP-SADT", "guiaResumoInternacao", "guiaHonorarioIndividual"];
                let guiasHTML = '';
                let totalGuias = 0;
                dadosParaExportacao = [];

                tiposGuias.forEach(tipo => {
                    let guias = buscarVariasTags(xmlDoc, tipo);
                    for(let i = 0; i < guias.length; i++) {
                        totalGuias++;
                        const guia = guias[i];
                        const numeroGuia = extrairTexto(guia, "numeroGuiaPrestador");
                        const nomeBeneficiario = extrairTexto(guia, "nomeBeneficiario");
                        let dataAtendimento = extrairTexto(guia, "dataAtendimento");
                        const regrasAuditoria = validarRegrasNegocio(guia, tipo, dataAtendimento);
                        
                        // Botões de IA agora acionam o Paywall
                        guiasHTML += `
                        <details style="margin-bottom: 8px; border: 1px solid #b8daff; border-radius: 6px; background: #fff; overflow: hidden;">
                            <summary style="cursor: pointer; font-weight: bold; padding: 12px; background-color: #e2eef9; color: #004085;">
                                📄 Guia: ${numeroGuia} | Paciente: ${nomeBeneficiario} ${regrasAuditoria.badges}
                            </summary>
                            <div style="padding: 10px;">
                                ${regrasAuditoria.alertas}
                                <p style="font-size: 12px; color: #555;">[Detalhes estruturais dos procedimentos suprimidos nesta versão resumida para o código JS]</p>
                                
                                <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end; background: #f9f9f9; padding: 10px; border-radius: 6px; border: 1px dashed #ccc;">
                                    <span style="font-size: 12px; color: #666; margin-top: 8px;">Auditoria IA Avançada:</span>
                                    <button onclick="analisarGuiaIA(${totalGuias}, '${numeroGuia}', 'gemini')" style="background-color: #1a73e8; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">✨ Gemini</button>
                                    <button onclick="analisarGuiaIA(${totalGuias}, '${numeroGuia}', 'chatgpt')" style="background-color: #10a37f; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">✨ ChatGPT</button>
                                    <button onclick="analisarGuiaIA(${totalGuias}, '${numeroGuia}', 'deepseek')" style="background-color: #4d6bfe; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">✨ DeepSeek</button>
                                </div>
                            </div>
                        </details>`;
                    }
                });
                
                mostrarResultado(`<h3>✅ Validação XSD Concluída</h3>${guiasHTML}`, true);
                document.getElementById('btnExportar').style.display = 'inline-block';
            } else {
                mostrarResultado(`<div class="erro-box"><strong>❌ Falha no XSD:</strong> ${data.erros ? data.erros.join(', ') : 'Erro desconhecido'}</div>`, false);
            }
        } catch (error) {
            mostrarResultado(`<div class="erro-box"><strong>Erro de Servidor:</strong> ${error.message}</div>`, false);
        }
    };
    reader.readAsText(file);
}

function mostrarResultado(htmlContent, sucesso) {
    const div = document.getElementById('resultado');
    div.innerHTML = htmlContent;
    alterarPasso(3); // Avança para o ecrã de Resultados
}

// A sua função exportarExcel original vai aqui sem alterações
function exportarExcel() { alert("Função de exportação retida."); }