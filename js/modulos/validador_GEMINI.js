// js/modulos/validador.js
let xmlDocAtual = null;
let validosTUSS = [];

function iniciarProcessamento() {
    if (document.getElementById('xmlInput').files.length === 0) return;
    if (typeof alterarPasso === 'function') alterarPasso(2);
    setTimeout(processarXML, 500);
}

function buscarVariasTags(node, nomeTag) {
    let elementos = node.getElementsByTagNameNS("*", nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName(nomeTag);
    if (elementos.length === 0) elementos = node.getElementsByTagName("ans:" + nomeTag);
    return elementos;
}

function buscarTagUnica(node, nomeTag) { const elementos = buscarVariasTags(node, nomeTag); return elementos.length > 0 ? elementos[0] : null; }
function extrairTexto(node, nomeTag, valorPadrao = "Não informado") { const elemento = buscarTagUnica(node, nomeTag); return elemento ? elemento.textContent.trim() : valorPadrao; }
function obterNomeDespesaTISS(codigo) { const dominios = { "01": "Gasoterapia", "02": "Medicamentos", "03": "Materiais", "05": "Diárias", "07": "Taxas e Alugueis", "08": "Órteses/Próteses (OPME)" }; return dominios[codigo] || "Outra Despesa"; }

function filtrarTabelaTISS(inputObj, tableId, colIndex) {
    const filter = inputObj.value.toUpperCase();
    const table = document.getElementById(tableId);
    if(!table) return;
    const tr = table.getElementsByTagName("tr");
    
    for (let i = 1; i < tr.length; i++) {
        const td = tr[i].getElementsByTagName("td")[colIndex];
        if (td) {
            let txtValue = td.textContent || td.innerText;
            tr[i].style.display = txtValue.toUpperCase().indexOf(filter) > -1 ? "" : "none";
        }
    }
}

function validarRegrasNegocio(guia, tipoGuia, dataAtendimentoStr) {
    let badgesHTML = '';
    let validacoesHTML = '';

    if (dataAtendimentoStr && dataAtendimentoStr !== "Não informado") {
        const partesData = dataAtendimentoStr.split('T')[0].split('-'); 
        if (partesData.length === 3) {
            const dataAtend = new Date(partesData[0], partesData[1] - 1, partesData[2]);
            const hoje = new Date();
            
            if (dataAtend > hoje) validacoesHTML += `<div class="erro-box">❌ <strong>[Glosa 1203]</strong> Data de atendimento posterior à data de processamento.</div>`;
            const diffDias = Math.ceil((hoje - dataAtend) / (1000 * 60 * 60 * 24));
            if (diffDias > 60 && dataAtend <= hoje) validacoesHTML += `<div class="alerta-box">⚠️ Guia fora da janela de retroatividade contratual (> 60 dias).</div>`;
        }
    }

    if (tipoGuia === 'guiaConsulta') {
        if (extrairTexto(guia, "indicacaoAcidente") === "Não informado") validacoesHTML += `<div class="erro-box">❌ <strong>[Glosa 1801]</strong> Campo 'Indicação de Acidente' ausente ou inválido no XSD.</div>`;
    } else if (tipoGuia === 'guiaSP-SADT') {
        const carater = extrairTexto(guia, "caraterAtendimento");
        const temAutorizacao = buscarTagUnica(guia, "dadosAutorizacao") !== null;

        if (carater === "2" || carater === "U") badgesHTML += `<span class="badge bg-urgencia">URGÊNCIA</span>`; 
        else if (carater === "1" || carater === "E") { 
            badgesHTML += `<span class="badge bg-eletivo">ELETIVO</span>`; 
            if (!temAutorizacao) validacoesHTML += `<div class="erro-box">❌ <strong>[Glosa 1311]</strong> Guia SP/SADT Eletiva exige preenchimento de Dados de Autorização Prévia.</div>`;
        }
    } else if (tipoGuia === 'guiaResumoInternacao') {
        const obitos = ["41", "42", "43", "61", "62", "63", "64"];
        if (obitos.includes(extrairTexto(guia, "motivoEncerramento"))) {
            badgesHTML += `<span class="badge bg-obito">ÓBITO</span>`;
            validacoesHTML += `<div class="alerta-box">⚠️ <strong>[Regra de Negócio]</strong> Óbito identificado. Conta enviada para Auditoria Médica Concorrente.</div>`;
        }
        if (extrairTexto(guia, "dataInicioFaturamento") === "Não informado" || extrairTexto(guia, "dataFimFaturamento") === "Não informado") {
            validacoesHTML += `<div class="erro-box">❌ <strong>[Glosa 1801]</strong> Período de faturamento ausente (Exigência XSD).</div>`;
        }
    } else if (tipoGuia === 'guiaHonorarioIndividual') {
        if (extrairTexto(guia, "guiaSolicitacaoInternacao") === "Não informado") validacoesHTML += `<div class="erro-box">❌ <strong>[Glosa 1014]</strong> Guia de Honorário órfã. Obrigatório informar a Guia de Solicitação de Internação (guia mãe).</div>`;
    }

    return { badges: badgesHTML, alertas: validacoesHTML };
}

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
        const r = await api('/api/auditoria', { guia: numeroGuia, itens: itensDestaGuia, provedor: provedor, email: usuarioLogado.email });
        if (r.ok) {
            usuarioLogado.tokensRestantes -= 1;
            document.getElementById('user-status').innerText = `👤 ${usuarioLogado.nome} | Saldo: ${usuarioLogado.tokensRestantes} IA`;
            let textoFormatado = '';
            try {
                const iaJson = JSON.parse(r.dados.analise.replace(/```json/g, '').replace(/```/g, ''));
                textoFormatado = `<strong>Status:</strong> ${iaJson.status === 'ALERTA' ? '<span style="color:red">⚠️ ALERTA</span>' : '<span style="color:green">✅ OK</span>'}<br><br><strong>Achados:</strong><br>• ${iaJson.achados.join('<br>• ')}`;
            } catch(e) { textoFormatado = r.dados.analise.replace(/\n/g, '<br>'); }
            divResultado.innerHTML = `<strong style="color: #333; font-size: 14px;">Auditor IA (${nomeIA})</strong><br><br>${textoFormatado}`;
        } else divResultado.innerHTML = `<span style="color: #d8000c;"><strong>Erro:</strong> ${erroDe(r)}</span>`;
    } catch (error) { divResultado.innerHTML = `<span style="color: #d8000c;"><strong>Erro na Conexão.</strong></span>`; } 
    finally { btnClicado.disabled = false; btnClicado.innerText = nomeIA; }
}

async function validarCodigosTUSS(arrayDeCodigos) {
    if (!arrayDeCodigos.length) return [];
    try {
        const r = await api('/api/dominio_tuss', { acao: 'validar_lote', codigos: arrayDeCodigos });
        if (r.ok) return r.dados;
        return [];
    } catch (e) { return []; }
}

async function processarXML() {
    const fileInput = document.getElementById('xmlInput');
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        const xmlContent = e.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
        
        if (buscarTagUnica(xmlDoc, "parsererror")) {
            document.getElementById('resultado').innerHTML = `<div class="erro-box"><strong>Erro:</strong> O arquivo não é um XML válido.</div>`;
            if (typeof alterarPasso === 'function') alterarPasso(3); 
            return;
        }

        xmlDocAtual = xmlDoc;

        let versaoTiss = "Versão não encontrada", operadoraID = "Não identificada", prestadorID = "Não informado";
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
                const resRegras = await api(`/api/regras?clienteId=${usuarioLogado.id}`);
                if (resRegras.ok) window.regrasAtivasCliente = resRegras.dados;
            }
            const rVal = await api('/api/validador', { xml: xmlContent, versao: versaoTiss });

            if (rVal.ok && rVal.dados.valido) {
                const tiposGuias = ["guiaConsulta", "guiaSP-SADT", "guiaResumoInternacao", "guiaHonorarioIndividual", "guiaOdontologia"];
                
                // INTEGRAÇÃO: Pré-coleta de todos os códigos do XML para validação TUSS em Lote O(1)
                let codigosParaValidar = new Set();
                tiposGuias.forEach(tipo => {
                    let guias = buscarVariasTags(xmlDoc, tipo);
                    for(let i = 0; i < guias.length; i++) {
                        let procedimentos = buscarVariasTags(guias[i], "procedimentoExecutado");
                        for(let p = 0; p < procedimentos.length; p++) codigosParaValidar.add(extrairTexto(procedimentos[p], "codigoProcedimento"));
                        let despesas = buscarVariasTags(guias[i], "despesa");
                        for(let d = 0; d < despesas.length; d++) codigosParaValidar.add(extrairTexto(despesas[d], "codigoProcedimento"));
                    }
                });
                validosTUSS = await validarCodigosTUSS(Array.from(codigosParaValidar));

                let guiasHTML = ''; let totalGuias = 0; let valorTotalLote = 0;
                let valorGasoterapia = 0; let valorMateriais = 0; let valorMedicamentos = 0;
                let valorDiarias = 0; let valorTaxasAlugueis = 0; let valorOPME = 0; let valorTotalProcedimentosItem = 0;
                
                window.dadosParaExportacao = [];

                tiposGuias.forEach(tipo => {
                    let guias = buscarVariasTags(xmlDoc, tipo);
                    for(let i = 0; i < guias.length; i++) {
                        totalGuias++;
                        const guia = guias[i];
                        
                        const numeroGuia = extrairTexto(guia, "numeroGuiaPrestador");
                        const nomeBeneficiario = extrairTexto(guia, "nomeBeneficiario");
                        let dataAtendimento = extrairTexto(guia, "dataAtendimento");
                        if (dataAtendimento === "Não informado") dataAtendimento = extrairTexto(guia, "dataExecucao");
                        
                        let valorGuia = 0; let valorTotalProcedimentos = 0; let valorTotalOutrasDespesas = 0;
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

                        // ---------------- TABELA DE PROCEDIMENTOS ----------------
                        if (procedimentos.length > 0) {
                            tabelaProcedimentosHTML = `
                                <details style="margin-top: 15px; border: 1px solid #cce5ff; border-radius: 6px; overflow: hidden; background: #fff;">
                                    <summary style="cursor: pointer; font-weight: bold; padding: 10px; background-color: #e6f2ff; color: #004085; outline: none;"> 
                                        💵 Procedimentos Executados (${procedimentos.length})								
                                    </summary>
                                    <div style="padding: 10px;">
                                        <div style="margin-bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                                            <input type="text" placeholder="🔍 Filtrar Código..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-proc-${numeroGuia}', 1)">
                                            <input type="text" placeholder="🔍 Filtrar Grau Part..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-proc-${numeroGuia}', 3)">
                                        </div>
                                        <table class="tabela-dados" id="tb-proc-${numeroGuia}">
                                            <tr style="background-color: #f0f0f0;">
                                                <th>Tabela</th><th>Código</th><th>Descrição</th><th>Profissional</th><th>Qtd</th><th>V. Unit</th><th>V. Total</th><th style="text-align:center;">Glosa</th>
                                            </tr>
                            `;
                            for(let p = 0; p < procedimentos.length; p++) {
                                const proc = procedimentos[p];
                                const tabela = extrairTexto(proc, "codigoTabela");
                                const codigo = extrairTexto(proc, "codigoProcedimento");
                                const descricao = extrairTexto(proc, "descricaoProcedimento");
                                
                                let qtdStr = extrairTexto(proc, "quantidadeExecutada");
                                let vlUnitStr = extrairTexto(proc, "valorUnitario");
                                let vlTotStr = extrairTexto(proc, "valorTotal");
                                
                                let qtd = qtdStr !== "Não informado" ? parseFloat(qtdStr) : 0;
                                let vlUnit = vlUnitStr !== "Não informado" ? parseFloat(vlUnitStr) : 0;
                                let vlTot = vlTotStr !== "Não informado" ? parseFloat(vlTotStr) : (qtd * vlUnit);

                                let grauPart = extrairTexto(proc, "grauParticipacao");
                                if (grauPart === "Não informado") grauPart = extrairTexto(proc, "grauPart"); 
                                let nomeProf = extrairTexto(proc, "nomeProfissional");
                                if (nomeProf === "Não informado") nomeProf = extrairTexto(proc, "nomeProf");
                                
                                let profHTML = `<span style="color: #999; font-size: 11px;">Não informado</span>`;
                                if (nomeProf !== "Não informado" || grauPart !== "Não informado") {
                                    profHTML = `
                                        <details style="background: #fdfdfd; padding: 2px; border-radius: 4px; border: 1px solid #eee;">
                                            <summary style="cursor: pointer; color: #0056b3; outline: none; font-weight: bold; font-size: 11px;">Ver Equipe</summary>
                                            <div style="margin-top: 5px; font-size: 11px; color: #333;"><strong>Nome:</strong> ${nomeProf}<br><strong>Grau Part.:</strong> ${grauPart}</div>
                                        </details>
                                    `;
                                }

                                valorTotalProcedimentos += vlTot;
                                valorGuia += vlTot;
                                valorTotalProcedimentosItem += vlTot;
                                valorTotalLote += vlTot;
                                
                                let glosasItem = validarItemTISS(proc, 'PROCEDIMENTO', tipo);
                                
                                // INTEGRAÇÃO: Lógica TUSS e Glosa
                                let iconeTUSS = validosTUSS.includes(codigo) 
                                    ? `<span title="Código validado no padrão TUSS" style="color: green; margin-right: 5px;">✅</span>` 
                                    : `<span title="Código não encontrado na TUSS" style="color: red; margin-right: 5px; cursor: help;">❌</span>`;
                                
                                let htmlGlosa = glosasItem.length > 0 
                                    ? `<i class="fa-solid fa-triangle-exclamation blink-glosa" title="Ver Críticas" onclick="mostrarGlosaModal('${encodeURIComponent(glosasItem.join('<br><br>'))}')"></i>` 
                                    : ``; // Vazio em vez de falso check verde

                                let idBase = `proc-${numeroGuia}-${p}`;
                                let inputQtd = `<input type="number" id="qtd-${idBase}" class="input-calc" step="0.01" value="${qtd}" onchange="atualizarItemXML('${numeroGuia}', 'PROCEDIMENTO', ${p}, this)">`;
                                let inputVlUnit = `<input type="number" id="unit-${idBase}" class="input-calc" step="0.01" value="${vlUnit.toFixed(2)}" onchange="atualizarItemXML('${numeroGuia}', 'PROCEDIMENTO', ${p}, this)">`;
                                let inputVlTot = `<input type="number" id="tot-${idBase}" class="input-calc input-readonly vltot-proc-${numeroGuia}" value="${vlTot.toFixed(2)}" readonly>`;

                                tabelaProcedimentosHTML += `<tr><td>${tabela}</td><td>${iconeTUSS}${codigo}</td><td>${descricao}</td><td>${profHTML}</td><td>${inputQtd}</td><td>${inputVlUnit}</td><td>${inputVlTot}</td><td style="text-align:center; vertical-align: middle;">${htmlGlosa}</td></tr>`;
                                
                                dadosParaExportacao.push({ tipoGuia: nomeExibicaoGuia, numeroGuia: numeroGuia, beneficiario: nomeBeneficiario, tabela: tabela, codigoItem: codigo, descricaoItem: descricao, tipoDespesa: "Procedimentos", profissional: nomeProf, grauParticipacao: grauPart, qtdItem: qtd, valorUnitario: vlUnit, valorItem: vlTot });
                            }
                            tabelaProcedimentosHTML += `</table><div style="text-align: right; margin-top: 5px; color: #0056b3; font-weight: bold;" id="sum-proc-${numeroGuia}">R$ ${valorTotalProcedimentos.toFixed(2).replace('.', ',')}</div></div></details>`;
                        }

                        // ---------------- TABELA DE OUTRAS DESPESAS ----------------
                        if(despesas.length > 0) {
                            tabelaOutrasDespesasHTML = `
                                <details style="margin-top: 15px; border: 1px solid #cce5ff; border-radius: 6px; overflow: hidden; background: #fff;">
                                    <summary style="cursor: pointer; font-weight: bold; padding: 10px; background-color: #e6f2ff; color: #004085; outline: none;">
                                        📦 Outras Despesas / OPME (${despesas.length})												
                                    </summary>
                                    <div style="padding: 10px;">
                                        <div style="margin-bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                                            <input type="text" placeholder="🔍 Filtrar Tipo (Ex: 08)..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-desp-${numeroGuia}', 0)">
                                            <input type="text" placeholder="🔍 Filtrar Tabela..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-desp-${numeroGuia}', 1)">
                                            <input type="text" placeholder="🔍 Filtrar Código..." class="form-control" style="width: 150px; padding: 4px; font-size: 12px;" onkeyup="filtrarTabelaTISS(this, 'tb-desp-${numeroGuia}', 2)">
                                        </div>
                                        <table class="tabela-dados" id="tb-desp-${numeroGuia}">
                                            <tr style="background-color: #f0f0f0;">
                                                <th>Tipo</th><th>Tabela</th><th>Código</th><th>Descrição</th><th>Qtd</th><th>V. Unit</th><th>V. Total</th><th style="text-align:center;">Glosa</th>
                                            </tr>
                            `;
                            for(let o = 0; o < despesas.length; o++) {
                                const desp = despesas[o];
                                const tabela = extrairTexto(desp, "codigoTabela");
                                const codigo = extrairTexto(desp, "codigoProcedimento");
                                const descricao = extrairTexto(desp, "descricaoProcedimento");
                                const tipoDespesaCod = extrairTexto(desp, "codigoDespesa"); 
                                const tipoDespesaNome = obterNomeDespesaTISS(tipoDespesaCod);
                                
                                let qtdStr = extrairTexto(desp, "quantidadeExecutada");
                                let vlUnitStr = extrairTexto(desp, "valorUnitario");
                                let vlTotStr = extrairTexto(desp, "valorTotal");

                                let qtd = qtdStr !== "Não informado" ? parseFloat(qtdStr) : 0;
                                let vlTot = vlTotStr !== "Não informado" ? parseFloat(vlTotStr) : 0;
                                let vlUnit = vlUnitStr !== "Não informado" ? parseFloat(vlUnitStr) : (qtd > 0 ? (vlTot / qtd) : 0);
                                
                                valorGuia += vlTot;																				
                                if(tipoDespesaCod === '01') valorGasoterapia += vlTot;
                                else if(tipoDespesaCod === '02') valorMedicamentos += vlTot;
                                else if(tipoDespesaCod === '03') valorMateriais += vlTot;
                                else if(tipoDespesaCod === '05') valorDiarias += vlTot;
                                else if(tipoDespesaCod === '07') valorTaxasAlugueis += vlTot;
                                else if(tipoDespesaCod === '08') valorOPME += vlTot;
                                
                                valorTotalOutrasDespesas += vlTot;
                                valorTotalLote += vlTot;

                                let glosasItem = validarItemTISS(desp, 'DESPESA', tipo);
                                
                                // INTEGRAÇÃO: Lógica TUSS e Glosa
                                let iconeTUSS = validosTUSS.includes(codigo) 
                                    ? `<span title="Código validado no padrão TUSS" style="color: green; margin-right: 5px;">✅</span>` 
                                    : `<span title="Código não encontrado na TUSS" style="color: red; margin-right: 5px; cursor: help;">❌</span>`;

                                let htmlGlosa = glosasItem.length > 0 
                                    ? `<i class="fa-solid fa-triangle-exclamation blink-glosa" title="Ver Críticas" onclick="mostrarGlosaModal('${encodeURIComponent(glosasItem.join('<br><br>'))}')"></i>` 
                                    : ``; // Vazio em vez de falso check verde

                                let idBase = `desp-${numeroGuia}-${o}`;
                                let inputQtdD = `<input type="number" id="qtd-${idBase}" class="input-calc" step="0.01" value="${qtd}" onchange="atualizarItemXML('${numeroGuia}', 'DESPESA', ${o}, this)">`;
                                let inputVlUnitD = `<input type="number" id="unit-${idBase}" class="input-calc" step="0.01" value="${vlUnit.toFixed(2)}" onchange="atualizarItemXML('${numeroGuia}', 'DESPESA', ${o}, this)">`;
                                let inputVlTotD = `<input type="number" id="tot-${idBase}" class="input-calc input-readonly vltot-desp-${numeroGuia}" value="${vlTot.toFixed(2)}" readonly>`;

                                tabelaOutrasDespesasHTML += `<tr><td><span class="badge" style="background:#6c757d;">${tipoDespesaCod} - ${tipoDespesaNome}</span></td><td>${tabela}</td><td>${iconeTUSS}${codigo}</td><td>${descricao}</td><td>${inputQtdD}</td><td>${inputVlUnitD}</td><td>${inputVlTotD}</td><td style="text-align:center; vertical-align: middle;">${htmlGlosa}</td></tr>`;
                                
                                dadosParaExportacao.push({ tipoGuia: nomeExibicaoGuia, numeroGuia: numeroGuia, beneficiario: nomeBeneficiario, tabela: tabela, codigoItem: codigo, descricaoItem: descricao, tipoDespesa: tipoDespesaNome, qtdItem: qtd, valorUnitario: vlUnit, valorItem: vlTot });
                            }
                            tabelaOutrasDespesasHTML += `</table><div style="text-align: right; margin-top: 5px; color: #0056b3; font-weight: bold;" id="sum-desp-${numeroGuia}">R$ ${valorTotalOutrasDespesas.toFixed(2).replace('.', ',')}</div></div></details>`;
                        }

                        guiasHTML += `
                        <details style="margin-bottom: 10px; border: 1px solid #b8daff; border-radius: 6px; background: #fff; overflow: hidden;">
                            <summary style="cursor: pointer; font-weight: bold; padding: 12px; background-color: #e2eef9; color: #004085; display: flex; justify-content: space-between;">
                                <span>📄 ${numeroGuia} | ${nomeBeneficiario} ${regrasAuditoria.badges}</span>
                                <span style="color: #0056b3;" id="sum-guia-${numeroGuia}">R$ ${valorGuia.toFixed(2).replace('.', ',')}</span>
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
                        <p style="margin: 5px 0; font-size: 16px;"><strong>Valor Total a Pagar:</strong> <span style="color: red; font-weight: bold;">R$ <span id="sum-lote">${valorTotalLote.toFixed(2).replace('.', ',')}</span></span></p>
                        
                        <!-- BOTÃO DE EXPORTAÇÃO DO XML -->
                        <button onclick="exportarXMLCorrigido()" class="btn btn-success" style="margin-top: 15px; width: 100%; font-size: 14px; padding: 12px;">💾 Descarregar XML Corrigido (Livre de Glosas)</button>

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
                if (typeof alterarPasso === 'function') alterarPasso(3);
                
            } else {
                document.getElementById('resultado').innerHTML = `<div class="erro-box"><strong>❌ Erro XSD:</strong><br>${rVal.dados.erros.join('<br>')}</div>`;
                if (typeof alterarPasso === 'function') alterarPasso(3);
            }
        } catch (error) {
            document.getElementById('resultado').innerHTML = `<div class="erro-box"><strong>Erro de Conexão:</strong> ${error.message}</div>`;
            if (typeof alterarPasso === 'function') alterarPasso(3);
        }
    };
    reader.readAsText(file);
}

function validarItemTISS(itemNode, tipoItem, tipoGuia) {
    let erros = [];
    let qtdStr = extrairTexto(itemNode, "quantidadeExecutada");
    let qtd = qtdStr !== "Não informado" ? parseFloat(qtdStr) : 0;
    let tabela = extrairTexto(itemNode, "codigoTabela");
    let cod = extrairTexto(itemNode, "codigoProcedimento");

    if (tipoGuia === 'guiaConsulta' && tipoItem === 'PROCEDIMENTO') {
        if (qtd > 1) erros.push("<strong>[Glosa 1004]</strong> Quantidade superior ao permitido para Consulta (Máx: 1).");
        if (tabela !== "22") erros.push("<strong>[Glosa 1102]</strong> Código de tabela inválido. Exigido Tabela 22.");
    }
    if (tipoItem === 'DESPESA') {
        let tipoDesp = extrairTexto(itemNode, "codigoDespesa");
        if (tipoDesp === '02' && tabela !== "20" && tabela !== "00") erros.push("<strong>[Glosa 1102]</strong> Medicamento fora da Tabela 20.");
        if (tipoDesp === '08' && tabela !== "19" && tabela !== "00") erros.push("<strong>[Glosa 1102]</strong> OPME fora da Tabela 19.");
        if (tipoDesp === '05' && tabela !== "63" && tabela !== "00") erros.push("<strong>[Glosa 1102]</strong> Diária fora da Tabela 63.");
    }

    if (typeof window.regrasAtivasCliente !== 'undefined' && window.regrasAtivasCliente.length > 0) {
        window.regrasAtivasCliente.forEach(regra => {
            if (regra.tipoGuia === 'TODAS' || regra.tipoGuia === tipoGuia) {
                let disparar = false;
                if (regra.campoValidado === 'codigoProcedimento' && (regra.condicao === 'IGUAL' && cod === regra.valorEsperado || regra.condicao === 'CONTEM' && cod.includes(regra.valorEsperado))) disparar = true;
                if (regra.campoValidado === 'quantidadeDespesa' && (regra.condicao === 'MAIOR_QUE' && qtd > parseFloat(regra.valorEsperado) || regra.condicao === 'IGUAL' && qtd === parseFloat(regra.valorEsperado))) disparar = true;
                if (regra.campoValidado === 'tipoDespesa' && tipoItem === 'DESPESA') {
                    let tDesp = extrairTexto(itemNode, "codigoDespesa");
                    if (regra.condicao === 'IGUAL' && tDesp === regra.valorEsperado || regra.condicao === 'CONTEM' && tDesp.includes(regra.valorEsperado)) disparar = true;
                }
                
                if (disparar) {
                    let prefixo = regra.acao === 'BLOQUEIO' ? '❌ [Bloqueio Cliente]' : '⚠️ [Alerta Cliente]';
                    erros.push(`<strong>${prefixo}:</strong> ${regra.mensagemErro}`);
                }
            }
        });
    }
    return erros;
}

function atualizarItemXML(numeroGuia, tipoItem, indexItem, inputElem) {
    const baseId = inputElem.id.split('-').slice(1).join('-');
    const inQtd = document.getElementById(`qtd-${baseId}`);
    const inVlUnit = document.getElementById(`unit-${baseId}`);
    const inVlTot = document.getElementById(`tot-${baseId}`);

    let qtd = parseFloat(inQtd.value) || 0;
    let vlUnit = parseFloat(inVlUnit.value) || 0;
    let novoVlTot = (qtd * vlUnit).toFixed(2);
    
    inVlTot.value = novoVlTot;

    if(!xmlDocAtual) return;
    const tiposGuias = ["guiaConsulta", "guiaSP-SADT", "guiaResumoInternacao", "guiaHonorarioIndividual", "guiaOdontologia"];
    let guiaNode = null;
    for(let tipo of tiposGuias) {
        let guias = Array.from(buscarVariasTags(xmlDocAtual, tipo));
        guiaNode = guias.find(g => extrairTexto(g, "numeroGuiaPrestador") === numeroGuia);
        if(guiaNode) break;
    }
    if(!guiaNode) return;

    let tagColecao = tipoItem === 'PROCEDIMENTO' ? "procedimentoExecutado" : "despesa";
    let itens = buscarVariasTags(guiaNode, tagColecao);
    if(itens[indexItem]) {
        let itemNode = itens[indexItem];
        let tQtd = buscarTagUnica(itemNode, "quantidadeExecutada"); if(tQtd) tQtd.textContent = qtd;
        let tUnit = buscarTagUnica(itemNode, "valorUnitario"); if(tUnit) tUnit.textContent = vlUnit;
        let tTot = buscarTagUnica(itemNode, "valorTotal"); if(tTot) tTot.textContent = novoVlTot;
    }

    recalcularTotaisGuiaVisuais(numeroGuia);
}

function recalcularTotaisGuiaVisuais(numeroGuia) {
    let totalProc = 0; let totalDesp = 0;
    document.querySelectorAll(`.vltot-proc-${numeroGuia}`).forEach(el => totalProc += parseFloat(el.value) || 0);
    document.querySelectorAll(`.vltot-desp-${numeroGuia}`).forEach(el => totalDesp += parseFloat(el.value) || 0);
    
    let totalGuia = totalProc + totalDesp;
    
    const elTProc = document.getElementById(`sum-proc-${numeroGuia}`);
    if(elTProc) elTProc.innerText = `R$ ${totalProc.toFixed(2).replace('.', ',')}`;
    
    const elTDesp = document.getElementById(`sum-desp-${numeroGuia}`);
    if(elTDesp) elTDesp.innerText = `R$ ${totalDesp.toFixed(2).replace('.', ',')}`;
    
    const elTGuia = document.getElementById(`sum-guia-${numeroGuia}`);
    if(elTGuia) elTGuia.innerText = `R$ ${totalGuia.toFixed(2).replace('.', ',')}`;

    let totalLote = 0;
    document.querySelectorAll('.input-readonly').forEach(el => totalLote += parseFloat(el.value) || 0);
    const elTLote = document.getElementById('sum-lote');
    if(elTLote) elTLote.innerText = totalLote.toFixed(2).replace('.', ',');
}

async function exportarXMLCorrigido() {
    if (!xmlDocAtual) { alert("Nenhum ficheiro XML processado."); return; }
    if (!usuarioLogado) { alert("🔒 A funcionalidade de exportação requer uma conta."); abrirModal('modalAuth'); return; }

    let limite = usuarioLogado.exportacoesRestantes ?? 3; 
    let isPremium = usuarioLogado.plano === 'PREMIUM';

    if (!isPremium) {
        if (limite <= 0) {
            alert("⚠️ Atingiu o limite Freemium. Adquira o Premium para correções ilimitadas.");
            return;
        } else {
            let confirma = confirm(`Restam-lhe ${limite} exportações gratuitas. Deseja utilizar uma agora?`);
            if(!confirma) return;
            usuarioLogado.exportacoesRestantes = limite - 1;
        }
    }

    const serializer = new XMLSerializer();
    let xmlString = serializer.serializeToString(xmlDocAtual);
    if (!xmlString.startsWith("<?xml")) xmlString = '<?xml version="1.0" encoding="ISO-8859-1"?>\n' + xmlString;

    const blob = new Blob([xmlString], { type: 'text/xml;charset=iso-8859-1;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Lote_Corrigido.xml`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function exportarExcel() {
    if (!window.dadosParaExportacao || window.dadosParaExportacao.length === 0) return;
    let csvContent = "\uFEFFTipo de Guia;Número da Guia;Nome do Beneficiário;Data Atendimento;Tabela;Código Item;Descrição do Item;Tipo Despesa;Quantidade;Valor Unitário;Valor Total\r\n";
    window.dadosParaExportacao.forEach(l => { csvContent += `${l.tipoGuia};${l.numeroGuia};${l.beneficiario};${l.data};${l.tabela};${l.codigoItem};${l.descricaoItem.replace(/;/g, ",")};${l.tipoDespesa};${l.qtdItem};${l.valorUnitario};${l.valorItem}\r\n`; });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Relatorio_TISS_Completo.csv");
    link.click();
}