// js/modulos/validador.js – validador TISS no navegador (requer core.js, ui.js, tiss_hash.js)
// Reescrito sobre o original: sem innerHTML com dados do XML (XSS), sem handlers inline (CSP),
// IA com identidade da sessão, exportação com hash recalculado/ISO-8859-1/limite no servidor.
'use strict';

let xmlDocAtual = null;
let regrasAtivasCliente = [];
let dadosParaExportacao = [];
let hashConfereOriginal = false;      // o hash do arquivo bate com o nosso algoritmo? (só então regravamos)

const NI = 'Não informado';
// elementos reais do XSD TISS 4.x -> nome canônico usado nas regras do cliente
const TIPOS_GUIAS = { guiaConsulta: 'guiaConsulta', 'guiaSP-SADT': 'guiaSP-SADT', guiaResumoInternacao: 'guiaResumoInternacao',
    guiaHonorarios: 'guiaHonorarioIndividual', guiaHonorarioIndividual: 'guiaHonorarioIndividual', guiaOdonto: 'guiaOdontologia', guiaOdontologia: 'guiaOdontologia' };
const TAGS_PROC = ['procedimentoExecutado', 'procedimentoRealizado'];     // SP/SADT e internação | honorário
const TAGS_TOTAL = { valorProcedimentos: 'proc', valorDiarias: '05', valorTaxasAlugueis: '07', valorMateriais: '03', valorMedicamentos: '02', valorOPME: '08', valorGasesMedicinais: '01' };
const colecao = (no, tags) => tags.flatMap(t => [...buscarVariasTags(no, t)]);
const TABELAS_TUSS = ['18', '19', '20', '22'];
const LIMITE_XML = 4 * 1024 * 1024;
const _guias = [];                    // índice -> {no, tipo, numero, nome, ...}
const _itens = new Map();             // "gi-TIPO-idx" -> item
const _glosas = [];                   // textos de glosa (evita colocar texto em atributos/JS)
let _tussValidos = null;              // Set | null (null = não verificado)
let _ocupado = false;

// ---------- navegação do wizard ----------
function iniciarProcessamento() {
    const inp = document.getElementById('xmlInput');
    if (!inp || inp.files.length === 0 || _ocupado) return;
    alterarPasso(2);
    processarXML();
}

// ---------- apoio TISS ----------
function buscarVariasTags(node, nomeTag) {
    let r = node.getElementsByTagNameNS('*', nomeTag);
    if (r.length === 0) r = node.getElementsByTagName(nomeTag);
    if (r.length === 0) r = node.getElementsByTagName('ans:' + nomeTag);
    return r;
}
function buscarTagUnica(node, nomeTag) { const r = buscarVariasTags(node, nomeTag); return r.length ? r[0] : null; }
function extrairTexto(node, nomeTag, padrao = NI) { const e = buscarTagUnica(node, nomeTag); return e ? e.textContent.trim() : padrao; }
function numero(txt) { const n = parseFloat(String(txt).replace(',', '.')); return Number.isFinite(n) ? n : 0; }
const dinheiro2 = n => (Math.round((n + Number.EPSILON) * 100) / 100);
const fmtBR = n => dinheiro2(n).toFixed(2).replace('.', ',');
const CATEGORIAS = { '01': 'Gasoterapia', '02': 'Medicamentos', '03': 'Materiais', '05': 'Diárias', '07': 'Taxas e Alugueis', '08': 'Órteses/Próteses (OPME)' };
const nomeDespesa = c => CATEGORIAS[c] || 'Outra Despesa';

// ---------- filtros de tabela (todos os filtros da tabela combinam) ----------
function filtrarTabelaTISS(_input, tableId) {
    const tb = document.getElementById(tableId); if (!tb) return;
    const filtros = [...document.querySelectorAll(`input[data-tb="${tableId}"]`)]
        .map(i => ({ col: Number(i.dataset.col), v: i.value.trim().toUpperCase() })).filter(f => f.v);
    for (const tr of tb.rows) {
        if (tr.cells.length && tr.cells[0].tagName === 'TH') continue;
        tr.style.display = filtros.every(f => (tr.cells[f.col] ? tr.cells[f.col].textContent : '').toUpperCase().includes(f.v)) ? '' : 'none';
    }
}

// ---------- regras de negócio TISS (cabeçalho da guia) ----------
function validarRegrasNegocio(guia, tipoGuia, dataStr) {
    const badges = [], alertas = [];
    const erro = (c, t) => alertas.push({ nivel: 'erro', cod: c, texto: t });
    const aviso = (c, t) => alertas.push({ nivel: 'alerta', cod: c, texto: t });
    if (dataStr && dataStr !== NI) {
        const p = dataStr.split('T')[0].split('-');
        if (p.length === 3) {
            const d = new Date(+p[0], +p[1] - 1, +p[2]), hoje = new Date();
            if (d > hoje) erro('Glosa 1203', 'Data de atendimento posterior à data de processamento.');
            else if (Math.floor((hoje - d) / 86400000) > 60) aviso('', 'Guia fora da janela de retroatividade contratual (> 60 dias).');
        }
    }
    if (tipoGuia === 'guiaConsulta') {
        if (extrairTexto(guia, 'indicacaoAcidente') === NI) erro('Glosa 1801', "Campo 'Indicação de Acidente' ausente ou inválido no XSD.");
    } else if (tipoGuia === 'guiaSP-SADT') {
        const carater = extrairTexto(guia, 'caraterAtendimento');
        if (carater === '2' || carater === 'U') badges.push({ cls: 'bg-urgencia', texto: 'URGÊNCIA' });
        else if (carater === '1' || carater === 'E') {
            badges.push({ cls: 'bg-eletivo', texto: 'ELETIVO' });
            if (!buscarTagUnica(guia, 'dadosAutorizacao')) erro('Glosa 1311', 'Guia SP/SADT Eletiva exige preenchimento de Dados de Autorização Prévia.');
        }
    } else if (tipoGuia === 'guiaResumoInternacao') {
        if (['41', '42', '43', '61', '62', '63', '64'].includes(extrairTexto(guia, 'motivoEncerramento'))) {
            badges.push({ cls: 'bg-obito', texto: 'ÓBITO' });
            aviso('Regra de Negócio', 'Óbito identificado. Conta enviada para Auditoria Médica Concorrente.');
        }
        const fim = extrairTexto(guia, 'dataFinalFaturamento') !== NI ? extrairTexto(guia, 'dataFinalFaturamento') : extrairTexto(guia, 'dataFimFaturamento');
        if (extrairTexto(guia, 'dataInicioFaturamento') === NI || fim === NI)
            erro('Glosa 1801', 'Período de faturamento ausente (Exigência XSD).');
    } else if (tipoGuia === 'guiaHonorarioIndividual') {
        if (extrairTexto(guia, 'guiaSolicInternacao') === NI && extrairTexto(guia, 'guiaSolicitacaoInternacao') === NI)
            erro('Glosa 1014', 'Guia de Honorário órfã. Obrigatório informar a Guia de Solicitação de Internação (guia mãe).');
    }
    return { badges, alertas };
}

// ---------- regras do cliente (todas as opções oferecidas na UI agora são avaliadas) ----------
function _compara(real, cond, esperado) {
    const nr = Number(String(real).replace(',', '.')), ne = Number(String(esperado).replace(',', '.'));
    const numericos = real !== '' && esperado !== '' && Number.isFinite(nr) && Number.isFinite(ne);
    if (cond === 'MAIOR_QUE') return numericos && nr > ne;
    if (cond === 'IGUAL') return numericos ? nr === ne : String(real).trim().toUpperCase() === String(esperado).trim().toUpperCase();
    if (cond === 'CONTEM') return String(real).toUpperCase().includes(String(esperado).toUpperCase());
    return false;
}
function _msgRegra(r) {
    return `${r.acao === 'BLOQUEIO' ? '❌ [Bloqueio Cliente]' : '⚠️ [Alerta Cliente]'}: ${r.mensagemErro || r.nomeRegra}`;
}
function _regrasDoTipo(tipoGuia) {
    return (regrasAtivasCliente || []).filter(r => r.tipoGuia === 'TODAS' || r.tipoGuia === tipoGuia);
}

// ---------- validação por item ----------
function validarItemTISS(it) {
    const erros = [], no = it.no;
    const tabela = extrairTexto(no, 'codigoTabela'), cod = extrairTexto(no, 'codigoProcedimento');
    const qtd = it.qtd;
    if (it.tipoGuia === 'guiaConsulta' && it.tipo === 'PROCEDIMENTO') {
        if (qtd > 1) erros.push('[Glosa 1004] Quantidade superior ao permitido para Consulta (Máx: 1).');
        if (tabela !== '22') erros.push('[Glosa 1102] Código de tabela inválido. Exigido Tabela 22.');
    }
    if (it.tipo === 'DESPESA') {
        const t = it.codDespesa;
        if (t === '02' && tabela !== '20' && tabela !== '00') erros.push('[Glosa 1102] Medicamento fora da Tabela 20.');
        if (t === '08' && tabela !== '19' && tabela !== '00') erros.push('[Glosa 1102] OPME fora da Tabela 19.');
        if (t === '05' && tabela !== '63' && tabela !== '00') erros.push('[Glosa 1102] Diária fora da Tabela 63.');
    }
    for (const r of _regrasDoTipo(it.tipoGuia)) {
        let real = null;
        if (r.campoValidado === 'codigoProcedimento') real = cod;
        else if (r.campoValidado === 'quantidadeDespesa') real = String(qtd);
        else if (r.campoValidado === 'tipoDespesa' && it.tipo === 'DESPESA') real = it.codDespesa;
        else if (r.campoValidado === 'grauParticipacao' && it.tipo === 'PROCEDIMENTO') real = it.grauPart === NI ? '' : it.grauPart;
        if (real !== null && _compara(real, r.condicao, r.valorEsperado)) erros.push(_msgRegra(r));
    }
    return erros;
}
function validarGuiaRegras(g) {            // regras no nível da guia (valorTotalGeral)
    return _regrasDoTipo(g.tipo).filter(r => r.campoValidado === 'valorTotalGeral' && _compara(String(g.total), r.condicao, r.valorEsperado)).map(_msgRegra);
}

// ---------- modal de glosa (texto, nunca HTML) ----------
function verGlosa(i) { mostrarGlosaModal(encodeURIComponent((_glosas[i] || []).join('\n\n'))); }
function _pintarGlosa(it) {
    const lista = validarItemTISS(it);
    limpar(it.celGlosa);
    if (!lista.length) { it.celGlosa.append(el('span', { style: 'color:#28a745;', title: 'Sem críticas' }, '✅')); return; }
    _glosas.push(lista);
    it.celGlosa.append(el('button', { type: 'button', class: 'btn-glosa blink-glosa', title: 'Ver críticas', 'aria-label': 'Ver críticas do item',
        'data-onclick': `verGlosa(${_glosas.length - 1})`, style: 'background:none;border:0;cursor:pointer;color:#c82333;font-size:16px;' }, '⚠️'));
}

// ---------- TUSS (lote; consulta pública, só leitura) ----------
async function validarCodigosTUSS(codigos) {
    const unicos = [...new Set(codigos)], validos = new Set();
    for (let i = 0; i < unicos.length; i += 500) {
        const r = await api('/api/dominio_tuss', { acao: 'validar_lote', codigos: unicos.slice(i, i + 500) });
        if (!r.ok) return null;
        r.dados.validos.forEach(c => validos.add(c));
    }
    return validos;
}
function _iconeTUSS(tabela, codigo) {
    if (!TABELAS_TUSS.includes(tabela)) return el('span', { title: 'Tabela própria/sem verificação TUSS', style: 'color:#999;margin-right:5px;' }, '•');
    if (_tussValidos === null) return el('span', { title: 'Base TUSS indisponível no momento', style: 'color:#999;margin-right:5px;' }, '•');
    return _tussValidos.has(codigo)
        ? el('span', { title: 'Código encontrado na base TUSS', style: 'color:green;margin-right:5px;' }, '✅')
        : el('span', { title: 'Código não encontrado na base TUSS cadastrada', style: 'color:#c82333;margin-right:5px;cursor:help;' }, '❌');
}

// ---------- IA ----------
async function analisarGuiaIA(gi, provedor) {
    const g = _guias[gi], u = Sessao.usuario;
    if (!g) return;
    if (!u) { abrirModal('modalAuth'); return; }
    if (u.tipo !== 'CLIENTE') return avisar('A auditoria por IA é exclusiva de contas de cliente.', 'erro');
    if (u.statusPagamento === 'INATIVO' || u.statusConta !== 'ATIVO') return avisar('Plano inativo. Contacte o suporte.', 'erro');
    if (u.tokensRestantes <= 0) { abrirModal('modalPremium'); return; }

    const nomes = { gemini: '✨ Gemini', chatgpt: '✨ ChatGPT', deepseek: '✨ DeepSeek' };
    const btn = document.getElementById(`btn-ia-${provedor}-${gi}`), caixa = document.getElementById(`resultado-ia-${gi}`);
    if (!btn || !caixa || btn.disabled) return;
    const rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Analisando…';
    caixa.style.display = 'block'; limpar(caixa).append(el('strong', {}, 'Aguarde… analisando.'));
    try {
        // Minimização (LGPD): nenhum nome de paciente/profissional vai para o provedor de IA.
        const itens = dadosParaExportacao.filter(i => i.gi === gi).map(i => ({
            tipoDespesa: i.tipoDespesa, codigoItem: i.codigoItem, descricaoItem: i.descricaoItem, qtdItem: i.qtdItem, valorItem: i.valorItem }));
        const contexto = { tipoGuia: g.tipo, caraterAtendimento: extrairTexto(g.no, 'caraterAtendimento', ''), tipoAtendimento: extrairTexto(g.no, 'tipoAtendimento', '') };
        const r = await api('/api/auditoria', { provedor, guia: g.numero, itens, contexto });
        limpar(caixa);
        if (!r.ok) {
            if (r.status === 402) abrirModal('modalPremium');
            caixa.append(el('span', { style: 'color:#d8000c;' }, el('strong', {}, 'Erro: '), erroDe(r)));
            return;
        }
        definirUsuario({ ...Sessao.usuario, tokensRestantes: r.dados.tokensRestantes });
        const alerta = r.dados.status === 'ALERTA';
        caixa.append(el('strong', { style: 'color:#333;font-size:14px;' }, `Auditor IA (${nomes[provedor] || provedor})`), el('br'), el('br'),
            el('strong', {}, 'Status: '), el('span', { style: `color:${alerta ? 'red' : 'green'}` }, alerta ? '⚠️ ALERTA' : '✅ OK'), el('br'), el('br'),
            el('strong', {}, 'Achados:'),
            el('ul', {}, (Array.isArray(r.dados.achados) ? r.dados.achados : []).map(a => el('li', {}, String(a)))));
        if (r.dados.aviso) caixa.append(el('small', { style: 'color:#666;' }, r.dados.aviso));
    } finally { btn.disabled = false; btn.textContent = rotulo; }
}

// ---------- leitura do arquivo respeitando o encoding declarado ----------
async function lerArquivoXML(file) {
    const buf = await file.arrayBuffer();
    const cab = new TextDecoder('latin1').decode(buf.slice(0, 200));
    const m = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(cab);
    let enc = (m ? m[1] : 'utf-8').toLowerCase();
    try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// ---------- construção da interface ----------
function _tabelaItens(gi, tipo, itens, titulo, cols, filtros) {
    const tid = `tb-${tipo === 'PROCEDIMENTO' ? 'proc' : 'desp'}-${gi}`;
    const cab = el('tr', { style: 'background-color:#f0f0f0;' }, cols.map(c => el('th', c === 'Glosa' ? { style: 'text-align:center;' } : {}, c)));
    const tb = el('table', { class: 'tabela-dados', id: tid }, cab);
    itens.forEach(it => tb.append(it.tr));
    const soma = el('div', { id: `sum-${tipo === 'PROCEDIMENTO' ? 'proc' : 'desp'}-${gi}`, style: 'text-align:right;margin-top:5px;color:#0056b3;font-weight:bold;' });
    const barra = el('div', { style: 'margin-bottom:10px;display:flex;gap:10px;flex-wrap:wrap;' },
        filtros.map(([rot, col]) => el('input', { type: 'text', placeholder: '🔍 ' + rot, class: 'form-control', 'aria-label': rot,
            style: 'width:150px;padding:4px;font-size:12px;', 'data-tb': tid, 'data-col': col, 'data-oninput': `filtrarTabelaTISS(this, '${tid}')` })));
    return el('details', { style: 'margin-top:15px;border:1px solid #cce5ff;border-radius:6px;overflow:hidden;background:#fff;' },
        el('summary', { style: 'cursor:pointer;font-weight:bold;padding:10px;background-color:#e6f2ff;color:#004085;' }, `${titulo} (${itens.length})`),
        el('div', { style: 'padding:10px;' }, barra, tb, soma));
}
function _inputNum(it, campo, valor, readonly) {
    const a = { type: 'number', class: 'input-calc' + (readonly ? ' input-readonly' : ''), step: '0.01', min: '0', value: valor, 'aria-label': campo };
    if (readonly) a.readOnly = true; else a['data-onchange'] = `atualizarItemXML(${it.gi}, '${it.tipo}', ${it.idx}, this)`;
    return el('input', a);
}
function _montarItem(g, gi, tipo, no, idx) {
    const consulta = no.localName === 'procedimento' && !!no.parentNode && no.parentNode.localName === 'dadosAtendimento';   // 4.x: consulta não tem quantidade
    const tabela = extrairTexto(no, 'codigoTabela'), codigo = extrairTexto(no, 'codigoProcedimento'), descricao = consulta ? 'Consulta' : extrairTexto(no, 'descricaoProcedimento');
    const qtdS = extrairTexto(no, 'quantidadeExecutada'), unS = extrairTexto(no, 'valorUnitario'), totS = extrairTexto(no, 'valorTotal');
    const qtd = consulta ? 1 : (qtdS !== NI ? numero(qtdS) : 0);
    let vlUnit, vlTot;
    if (consulta) { vlTot = vlUnit = numero(extrairTexto(no, 'valorProcedimento', '0')); }
    else if (tipo === 'PROCEDIMENTO') { vlUnit = unS !== NI ? numero(unS) : 0; vlTot = totS !== NI ? numero(totS) : qtd * vlUnit; }
    else { vlTot = totS !== NI ? numero(totS) : 0; vlUnit = unS !== NI ? numero(unS) : (qtd > 0 ? vlTot / qtd : 0); }
    const it = { gi, tipo, idx, no, consulta, tipoGuia: g.tipo, qtd, vlUnit, vlTot, codDespesa: tipo === 'DESPESA' ? extrairTexto(no, 'codigoDespesa') : '', tabela, codigo, descricao, grauPart: NI, nomeProf: NI };
    if (tipo === 'PROCEDIMENTO') {
        it.grauPart = extrairTexto(no, 'grauParticipacao'); if (it.grauPart === NI) it.grauPart = extrairTexto(no, 'grauPart');
        it.nomeProf = extrairTexto(no, 'nomeProfissional'); if (it.nomeProf === NI) it.nomeProf = extrairTexto(no, 'nomeProf');
    }
    it.inQtd = _inputNum(it, 'Quantidade', String(qtd), consulta);
    it.inUn = _inputNum(it, 'Valor unitário', vlUnit.toFixed(2), false);
    it.inTot = _inputNum(it, 'Valor total', vlTot.toFixed(2), true);
    it.celGlosa = el('td', { style: 'text-align:center;vertical-align:middle;' });
    it.celCodigo = el('td', {}, _iconeTUSS(tabela, codigo), codigo);
    const cels = [];
    if (tipo === 'PROCEDIMENTO') {
        const prof = (it.nomeProf !== NI || it.grauPart !== NI)
            ? el('details', { style: 'background:#fdfdfd;padding:2px;border-radius:4px;border:1px solid #eee;' },
                el('summary', { style: 'cursor:pointer;color:#0056b3;font-weight:bold;font-size:11px;' }, 'Ver Equipe'),
                el('div', { style: 'margin-top:5px;font-size:11px;color:#333;' }, el('strong', {}, 'Nome: '), it.nomeProf, el('br'), el('strong', {}, 'Grau Part.: '), it.grauPart))
            : el('span', { style: 'color:#999;font-size:11px;' }, NI);
        cels.push(el('td', {}, tabela), it.celCodigo, el('td', {}, descricao), el('td', {}, prof));
    } else {
        cels.push(el('td', {}, el('span', { class: 'badge', style: 'background:#6c757d;' }, `${it.codDespesa} - ${nomeDespesa(it.codDespesa)}`)), el('td', {}, tabela), it.celCodigo, el('td', {}, descricao));
    }
    cels.push(el('td', {}, it.inQtd), el('td', {}, it.inUn), el('td', {}, it.inTot), it.celGlosa);
    it.tr = el('tr', {}, cels);
    _itens.set(`${gi}-${tipo}-${idx}`, it);
    const nomeGuia = g.tipo.replace('guia', 'Guia ').replace('SP-SADT', 'SP/SADT');
    dadosParaExportacao.push({ gi, tipoGuia: nomeGuia, numeroGuia: g.numero, beneficiario: g.beneficiario, data: g.data, tabela, codigoItem: codigo, descricaoItem: descricao,
        tipoDespesa: tipo === 'PROCEDIMENTO' ? 'Procedimentos' : nomeDespesa(it.codDespesa), profissional: it.nomeProf, grauParticipacao: it.grauPart,
        qtdItem: qtd, valorUnitario: vlUnit, valorItem: vlTot, _it: it });
    return it;
}

async function processarXML() {
    const file = document.getElementById('xmlInput').files[0];
    const saida = limpar(document.getElementById('resultado'));
    const fim = () => { _ocupado = false; alterarPasso(3); };
    const erroBox = (cls, ...f) => saida.append(el('div', { class: cls }, f));
    _ocupado = true;
    try {
        if (!file) return fim();
        if (file.size > LIMITE_XML) { erroBox('erro-box', el('strong', {}, 'Arquivo muito grande: '), `o limite é ${LIMITE_XML / 1048576} MB por arquivo. Divida o lote em arquivos menores.`); return fim(); }
        const xmlContent = await lerArquivoXML(file);
        const xmlDoc = new DOMParser().parseFromString(xmlContent, 'application/xml');
        if (buscarTagUnica(xmlDoc, 'parsererror')) { erroBox('erro-box', el('strong', {}, 'Erro: '), 'O arquivo não é um XML válido.'); return fim(); }
        xmlDocAtual = xmlDoc;

        let versao = '', operadora = 'Não identificada', prestador = NI;
        const cab = buscarTagUnica(xmlDoc, 'cabecalho');
        if (cab) {
            const tp = buscarTagUnica(cab, 'Padrao') || buscarTagUnica(cab, 'versaoPadrao'); if (tp) versao = tp.textContent.trim();
            const dest = buscarTagUnica(cab, 'destino');
            if (dest) {
                const ans = buscarTagUnica(dest, 'registroANS'), cnpj = buscarTagUnica(dest, 'cnpj');
                if (ans) operadora = 'Registro ANS: ' + ans.textContent.trim(); else if (cnpj) operadora = 'CNPJ: ' + cnpj.textContent.trim();
            }
            const ori = buscarTagUnica(cab, 'origem');
            if (ori) { const p = buscarTagUnica(ori, 'CNPJ') || buscarTagUnica(ori, 'codigoPrestadorNaOperadora'); if (p) prestador = p.textContent.trim(); }
        }
        // hash: só regravamos na exportação se o hash ORIGINAL bate com o nosso algoritmo
        const hNo = buscarTagUnica(xmlDoc, 'hash');
        try { hashConfereOriginal = !!(hNo && hNo.textContent.trim().toLowerCase() === calcularHashTISS(xmlDoc.documentElement)); } catch { hashConfereOriginal = false; }

        if (Sessao.usuario && Sessao.usuario.tipo === 'CLIENTE') {
            const rr = await api('/api/regras');
            regrasAtivasCliente = rr.ok && Array.isArray(rr.dados) ? rr.dados.filter(r => !r.status || r.status === 'ATIVO') : [];
        } else regrasAtivasCliente = [];

        const corpo = { xml: xmlContent }; if (/^\d\.\d{2}\.\d{2}$/.test(versao)) corpo.versao = versao;
        const r = await api('/api/validador', corpo);
        if (!(r.ok && r.dados.valido)) {
            const erros = Array.isArray(r.dados.erros) ? r.dados.erros : [erroDe(r)];
            erroBox('erro-box', el('strong', {}, '❌ Erro XSD: '), el('ul', {}, erros.map(e => el('li', {}, String(e)))));
            return fim();
        }

        // ---- extrai guias/itens ----
        _guias.length = 0; _itens.clear(); _glosas.length = 0; dadosParaExportacao = [];
                for (const [elemento, tipo] of Object.entries(TIPOS_GUIAS)) for (const no of buscarVariasTags(xmlDoc, elemento)) {
            const gi = _guias.length;
            const nomeB = extrairTexto(no, 'nomeBeneficiario'), cart = extrairTexto(no, 'numeroCarteira');   // 4.x não traz mais o nome
            const g = { gi, no, tipo, numero: extrairTexto(no, 'numeroGuiaPrestador'), beneficiario: nomeB !== NI ? nomeB : (cart !== NI ? 'Carteira ' + cart : NI), total: 0, itens: [], editado: false };
            g.data = extrairTexto(no, 'dataAtendimento');
            for (const t of ['dataExecucao', 'dataInicioFaturamento']) if (g.data === NI) g.data = extrairTexto(no, t);
            _guias.push(g);
            if (tipo === 'guiaConsulta') {
                const pc = [...buscarVariasTags(no, 'procedimento')].find(n => n.parentNode && n.parentNode.localName === 'dadosAtendimento');
                if (pc) g.itens.push(_montarItem(g, gi, 'PROCEDIMENTO', pc, 0));
            }
            colecao(no, TAGS_PROC).forEach(n => g.itens.push(_montarItem(g, gi, 'PROCEDIMENTO', n, g.itens.filter(x => x.tipo === 'PROCEDIMENTO').length)));
            [...buscarVariasTags(no, 'despesa')].forEach((n, i) => g.itens.push(_montarItem(g, gi, 'DESPESA', n, i)));
            g.total = g.itens.reduce((s, i) => s + i.vlTot, 0);
        }

        // ---- TUSS em lote (1 chamada, só logado) ----
        const cods = _guias.flatMap(g => g.itens.filter(i => TABELAS_TUSS.includes(i.tabela) && i.codigo !== NI).map(i => i.codigo));
        _tussValidos = cods.length ? await validarCodigosTUSS(cods) : null;
        for (const g of _guias) for (const i of g.itens) { i.celCodigo.replaceChild(_iconeTUSS(i.tabela, i.codigo), i.celCodigo.firstChild); }

        // ---- monta a tela ----
        const nodes = [];
        for (const g of _guias) {
            const regras = validarRegrasNegocio(g.no, g.tipo, g.data);
            g.elTotal = el('span', { style: 'color:#0056b3;' });
            g.elAlertasDin = el('div');
            const procs = g.itens.filter(i => i.tipo === 'PROCEDIMENTO'), desps = g.itens.filter(i => i.tipo === 'DESPESA');
            g.itens.forEach(_pintarGlosa);
            let exec = NI;
            if (buscarTagUnica(g.no, 'dadosExecutante')) {
                let cod = extrairTexto(g.no, 'codigoPrestadorNaOperadora'); if (cod === NI) cod = extrairTexto(g.no, 'cnpjContratado');
                let nome = extrairTexto(g.no, 'nomeContratado'); if (nome === NI) nome = extrairTexto(g.no, 'nomeContratadoExecutante');
                exec = nome !== NI ? `(${cod}) ${nome}` : (cod !== NI ? cod : NI);
            }
            const nomeGuia = g.tipo.replace('guia', 'Guia ').replace('SP-SADT', 'SP/SADT');
            const botIA = (prov, cor, rot) => el('button', { type: 'button', id: `btn-ia-${prov}-${g.gi}`, 'data-onclick': `analisarGuiaIA(${g.gi}, '${prov}')`,
                style: `background-color:${cor};color:white;padding:8px 15px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;` }, rot);
            nodes.push(el('details', { style: 'margin-bottom:10px;border:1px solid #b8daff;border-radius:6px;background:#fff;overflow:hidden;' },
                el('summary', { style: 'cursor:pointer;font-weight:bold;padding:12px;background-color:#e2eef9;color:#004085;display:flex;justify-content:space-between;' },
                    el('span', {}, `📄 ${g.numero} | ${g.beneficiario} `, regras.badges.map(b => el('span', { class: 'badge ' + b.cls }, b.texto))), g.elTotal),
                el('div', { style: 'padding:15px;' },
                    regras.alertas.map(a => el('div', { class: a.nivel === 'erro' ? 'erro-box' : 'alerta-box' }, a.nivel === 'erro' ? '❌ ' : '⚠️ ', a.cod ? el('strong', {}, `[${a.cod}] `) : null, a.texto)),
                    g.elAlertasDin,
                    el('h4', { style: 'margin:0 0 10px 0;color:#333;' }, 'O que está sendo cobrado:'),
                    el('table', { class: 'tabela-dados', style: 'margin-top:0;' },
                        el('tr', {}, el('th', {}, 'Executante'), el('td', {}, exec)),
                        el('tr', {}, el('th', {}, 'Guia / Data'), el('td', {}, `${nomeGuia} - ${g.data}`))),
                    procs.length ? _tabelaItens(g.gi, 'PROCEDIMENTO', procs, '💵 Procedimentos Executados', ['Tabela', 'Código', 'Descrição', 'Profissional', 'Qtd', 'V. Unit', 'V. Total', 'Glosa'], [['Filtrar Código...', 1], ['Filtrar Grau Part...', 3]]) : null,
                    desps.length ? _tabelaItens(g.gi, 'DESPESA', desps, '📦 Outras Despesas / OPME', ['Tipo', 'Tabela', 'Código', 'Descrição', 'Qtd', 'V. Unit', 'V. Total', 'Glosa'], [['Filtrar Tipo (Ex: 08)...', 0], ['Filtrar Tabela...', 1], ['Filtrar Código...', 2]]) : null,
                    el('div', { style: 'margin-top:15px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;' }, botIA('gemini', '#1a73e8', '✨ Analisar com Gemini'), botIA('chatgpt', '#10a37f', '✨ Analisar com ChatGPT')),
                    el('div', { id: `resultado-ia-${g.gi}`, role: 'status', style: 'display:none;margin-top:10px;background:#f8f9fa;border:1px solid #ddd;border-radius:6px;padding:12px;font-size:13px;' }))));
        }
        const linhaCat = (rot, chave) => el('tr', {}, el('th', {}, rot), el('td', {}, el('strong', { style: 'color:red;', id: `cat-${chave}` })));
        const resumo = el('div', { style: 'background:#f8f9fa;padding:20px;border-radius:6px;margin-bottom:20px;border:1px solid #ddd;' },
            el('h4', { style: 'margin:0 0 10px 0;color:#333;' }, 'Resumo Financeiro do Lote'),
            el('p', { style: 'margin:5px 0;' }, el('strong', {}, 'Enviado por: '), el('span', { style: 'color:#0056b3;' }, prestador), ' | ', el('strong', {}, 'Operadora: '), operadora),
            el('p', { style: 'margin:5px 0;' }, el('strong', {}, 'Total de Guias: '), el('span', { style: 'color:blue;font-weight:bold;' }, String(_guias.length))),
            el('p', { style: 'margin:5px 0;font-size:16px;' }, el('strong', {}, 'Valor Total a Pagar: '), el('span', { style: 'color:red;font-weight:bold;' }, 'R$ ', el('span', { id: 'sum-lote' }))),
            el('button', { type: 'button', class: 'btn btn-success', 'data-onclick': 'exportarXMLCorrigido()', style: 'margin-top:15px;width:100%;font-size:14px;padding:12px;' }, '💾 Baixar XML corrigido'),
            el('details', { style: 'background:#ededff;padding:10px;border-radius:4px;border:1px solid #eee;margin-top:15px;' },
                el('summary', { style: 'cursor:pointer;color:#0056b3;font-weight:bold;' }, 'Ver Detalhamento por Tipo de Despesa'),
                el('table', { class: 'tabela-dados', style: 'margin-top:10px;' }, linhaCat('Total de Procedimentos:', 'proc'), linhaCat('Total de Diárias:', '05'), linhaCat('Total de Taxas e Alugueis:', '07'),
                    linhaCat('Total de Materiais:', '03'), linhaCat('Total de Medicamentos:', '02'), linhaCat('Total de Gasoterapia:', '01'), linhaCat('Total de OPME:', '08'))));
        saida.append(resumo);
        (r.dados.avisos || []).forEach(a => saida.append(el('div', { class: 'alerta-box' }, '⚠️ ', String(a))));
        saida.append(el('h4', { style: 'color:#333;margin-bottom:10px;' }, 'Análise Individual das Guias'));
        if (nodes.length) nodes.forEach(n => saida.append(n)); else saida.append(el('p', {}, 'Nenhuma guia detalhada encontrada.'));
        _recalcular();
        document.getElementById('btnExportar').style.display = 'inline-block';
        fim();
    } catch (e) {
        limpar(saida).append(el('div', { class: 'erro-box' }, el('strong', {}, 'Não foi possível processar o arquivo: '), 'verifique o XML e tente novamente.'));
        console.error(e); fim();
    }
}

// ---------- recálculo (a partir do modelo, não do DOM) ----------
function _recalcular() {
    let lote = 0; const cat = { proc: 0, '01': 0, '02': 0, '03': 0, '05': 0, '07': 0, '08': 0 };
    for (const g of _guias) {
        let tp = 0, td = 0;
        for (const i of g.itens) {
            lote += i.vlTot;
            if (i.tipo === 'PROCEDIMENTO') { tp += i.vlTot; cat.proc += i.vlTot; } else { td += i.vlTot; if (i.codDespesa in cat) cat[i.codDespesa] += i.vlTot; }
        }
        g.total = tp + td;
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = 'R$ ' + fmtBR(v); };
        set(`sum-proc-${g.gi}`, tp); set(`sum-desp-${g.gi}`, td); g.elTotal.textContent = 'R$ ' + fmtBR(g.total);
        limpar(g.elAlertasDin);
        validarGuiaRegras(g).forEach(t => g.elAlertasDin.append(el('div', { class: 'alerta-box' }, t)));
    }
    const lt = document.getElementById('sum-lote'); if (lt) lt.textContent = fmtBR(lote);
    for (const [k, v] of Object.entries(cat)) { const e = document.getElementById(`cat-${k}`); if (e) e.textContent = 'R$ ' + fmtBR(v); }
}

function atualizarItemXML(gi, tipoItem, idx) {
    const it = _itens.get(`${gi}-${tipoItem}-${idx}`); if (!it) return;
    const q = numero(it.inQtd.value), u = numero(it.inUn.value);
    if (!(q >= 0) || !(u >= 0) || it.inQtd.value === '' || it.inUn.value === '') {      // valor inválido: volta ao anterior
        it.inQtd.value = String(it.qtd); it.inUn.value = it.vlUnit.toFixed(2);
        return avisar('Informe valores numéricos maiores ou iguais a zero.', 'erro');
    }
    it.qtd = q; it.vlUnit = dinheiro2(u); it.vlTot = dinheiro2(q * u);
    it.inTot.value = it.vlTot.toFixed(2);
    const set = (tag, v) => { const t = buscarTagUnica(it.no, tag); if (t) t.textContent = v; };
    if (it.consulta) set('valorProcedimento', it.vlTot.toFixed(2));
    else { set('quantidadeExecutada', String(q)); set('valorUnitario', it.vlUnit.toFixed(2)); set('valorTotal', it.vlTot.toFixed(2)); }
    _guias[gi].editado = true;
    const linha = dadosParaExportacao.find(d => d._it === it);
    if (linha) { linha.qtdItem = q; linha.valorUnitario = it.vlUnit; linha.valorItem = it.vlTot; }
    _pintarGlosa(it);
    _recalcular();
}

// Totais do próprio XML (<valorTotal> da guia / valorTotalHonorarios): só nas guias editadas, para a operadora não glosar divergência.
function _sincronizarTotaisXML(g) {
    const cat = { proc: 0, '01': 0, '02': 0, '03': 0, '05': 0, '07': 0, '08': 0 };
    g.itens.forEach(i => { const k = i.tipo === 'PROCEDIMENTO' ? 'proc' : i.codDespesa; if (k in cat) cat[k] += i.vlTot; });
    const filhos = [...g.no.children];
    const vt = filhos.find(c => c.localName === 'valorTotal');
    if (vt) for (const c of vt.children) {
        if (c.localName === 'valorTotalGeral') c.textContent = dinheiro2(g.total).toFixed(2);
        else if (c.localName in TAGS_TOTAL) c.textContent = dinheiro2(cat[TAGS_TOTAL[c.localName]] || 0).toFixed(2);
    }
    const vh = filhos.find(c => c.localName === 'valorTotalHonorarios'); if (vh) vh.textContent = dinheiro2(g.total).toFixed(2);
}

// ---------- exportação ----------
function _paraLatin1(str) {             // Blob(string) sempre grava UTF-8: precisamos dos bytes ISO-8859-1
    const out = [];
    for (const ch of str) { const c = ch.codePointAt(0); if (c < 256) out.push(c); else for (const b of `&#${c};`) out.push(b.charCodeAt(0)); }
    return new Uint8Array(out);
}
function _baixar(blob, nome) {
    const url = URL.createObjectURL(blob), a = el('a', { href: url, download: nome });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportarXMLCorrigido() {
    if (!xmlDocAtual) return avisar('Nenhum arquivo XML processado.', 'erro');
    const u = Sessao.usuario;
    if (!u) { avisar('A exportação do arquivo corrigido requer uma conta ativa.', 'erro'); abrirModal('modalAuth'); return; }
    if (u.tipo === 'CLIENTE') {
        if (u.plano !== 'PREMIUM' && !confirm(`Você tem ${u.exportacoesRestantes ?? 0} exportação(ões) gratuita(s). Deseja usar uma agora?`)) return;
        const r = await api('/api/exportacao', {});          // o servidor decide e debita (não o navegador)
        if (!r.ok) { if (r.status === 402) abrirModal('modalPremium'); return avisar(erroDe(r), 'erro'); }
        if (r.dados.restantes !== null) definirUsuario({ ...Sessao.usuario, exportacoesRestantes: r.dados.restantes });
    }
    _guias.filter(g => g.editado).forEach(_sincronizarTotaisXML);
    if (hashConfereOriginal) {
        const h = buscarTagUnica(xmlDocAtual, 'hash');
        if (h) h.textContent = calcularHashTISS(xmlDocAtual.documentElement);
    } else if (buscarTagUnica(xmlDocAtual, 'hash')) {
        avisar('Atenção: o hash do epílogo não foi recalculado (o original não conferia com o algoritmo padrão). Confirme com a operadora.', 'info');
    }
    let xml = new XMLSerializer().serializeToString(xmlDocAtual).replace(/^<\?xml[^>]*\?>\s*/, '');
    xml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n' + xml;
    const nome = String(u.nome || 'cliente').replace(/[^\w\-]+/g, '_').slice(0, 40);
    _baixar(new Blob([_paraLatin1(xml)], { type: 'text/xml;charset=iso-8859-1' }), `Lote_Corrigido_${nome}.xml`);
}

function _celulaCSV(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                    // neutraliza fórmulas do Excel (CSV injection)
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportarExcel() {
    if (!dadosParaExportacao.length) return;
    const num = n => String(dinheiro2(n)).replace('.', ',');
    const linhas = [['Tipo de Guia', 'Número da Guia', 'Beneficiário (nome/carteira)', 'Data Atendimento', 'Tabela', 'Código Item', 'Descrição do Item', 'Tipo Despesa', 'Quantidade', 'Valor Unitário', 'Valor Total']];
    dadosParaExportacao.forEach(l => linhas.push([l.tipoGuia, l.numeroGuia, l.beneficiario, l.data, l.tabela, l.codigoItem, l.descricaoItem, l.tipoDespesa, String(l.qtdItem).replace('.', ','), num(l.valorUnitario), num(l.valorItem)]));
    const csv = '﻿' + linhas.map(l => l.map(_celulaCSV).join(';')).join('\r\n') + '\r\n';
    _baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'Relatorio_TISS_Completo.csv');
}
