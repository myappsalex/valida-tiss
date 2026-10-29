// js/modulos/cliente.js – painel do cliente (requer core.js, ui.js, auth.js)
'use strict';

let _regras = [], _campanhas = [], _campanhaAtual = null;
const COR_STATUS = { ATIVO: '#1e7e34', AGUARDANDO_PAGAMENTO: '#b45f06', ORCADO: '#b45f06', PENDENTE: '#0056b3', CANCELADO: '#b02a37', REJEITADO: '#b02a37', EXPIRADO: '#5c6770' };
const TXT_STATUS = { ORCADO: 'ORÇAMENTO RECEBIDO', AGUARDANDO_PAGAMENTO: 'AGUARDANDO PIX', PENDENTE: 'EM ANÁLISE' };

// Guarda de rota (a proteção REAL é o servidor; isto só evita tela vazia)
Pronto.then(u => {
    if (!u) { avisar('Entre para acessar o painel.', 'erro'); return irPara('index.html'); }
    if (u.tipo !== 'CLIENTE') return irPara('admin.html');
    carregarPainelCliente();
    if (location.hash === '#assinatura') assinarPremium();
});

async function carregarPainelCliente() {
    const u = Sessao.usuario; if (!u || u.tipo !== 'CLIENTE') return;
    document.getElementById('nome-empresa-painel').textContent = u.nome;
    document.getElementById('dash-tokens').textContent = u.tokensRestantes ?? 0;
    document.getElementById('dash-plano').textContent = u.plano || 'FREEMIUM';
    const st = document.getElementById('dash-status');
    st.textContent = u.statusPagamento || 'ATIVO';
    const ok = (u.statusPagamento || 'ATIVO') === 'ATIVO';
    st.style.backgroundColor = ok ? '#d4edda' : '#f8d7da'; st.style.color = ok ? '#155724' : '#721c24';
    carregarRegrasCliente(); carregarMinhasCampanhas();
}

// ---------- assinatura ----------
function assinarPremium() { return gerarPix({ tipo: 'ASSINATURA' }, 'btn-assinar'); }

// ---------- regras ----------
async function carregarRegrasCliente() {
    const tb = document.getElementById('lista-regras-body'); if (!tb) return;
    const r = await api('/api/regras'); limpar(tb);
    if (!r.ok) return tb.append(linhaMsg(5, erroDe(r), '#c00'));
    _regras = r.dados;
    if (!_regras.length) return tb.append(linhaMsg(5, 'Nenhuma regra criada ainda. Use "+ Criar Nova Regra".'));
    for (const x of _regras) {
        tb.append(el('tr', {},
            el('td', {}, el('strong', {}, x.nomeRegra)), el('td', {}, x.tipoGuia, el('br'), el('small', {}, 'Campo: ' + x.campoValidado)),
            el('td', {}, x.condicao + ' ', el('strong', {}, x.valorEsperado)), el('td', {}, x.acao),
            el('td', {}, el('button', { class: 'btn', 'data-acao': 'abrirModalEdicao', 'data-id': x.id }, 'Editar'), ' ',
                el('button', { class: 'btn btn-danger', 'data-acao': 'excluirRegra', 'data-id': x.id }, 'Excluir'))));
    }
}
const _CAMPOS_REGRA = { 'regra-id': 'id', 'regra-nome': 'nomeRegra', 'regra-tipo': 'tipoGuia', 'regra-campo': 'campoValidado', 'regra-condicao': 'condicao', 'regra-valor': 'valorEsperado', 'regra-acao': 'acao', 'regra-mensagem': 'mensagemErro' };
function abrirModalNovaRegra() {
    for (const id of Object.keys(_CAMPOS_REGRA)) { const e = document.getElementById(id); if (e.tagName !== 'SELECT') e.value = ''; else e.selectedIndex = 0; }
    document.getElementById('titulo-modal-regra').textContent = 'Criar Gatilho de Validação';
    abrirModal('modalNovaRegra');
}
function abrirModalEdicao(d) {
    const r = _regras.find(x => x.id === d.id); if (!r) return;
    for (const [id, campo] of Object.entries(_CAMPOS_REGRA)) document.getElementById(id).value = r[campo] ?? '';
    document.getElementById('titulo-modal-regra').textContent = 'Editar Regra';
    abrirModal('modalNovaRegra');
}
async function salvarRegra() {
    const g = id => document.getElementById(id).value.trim();
    const dados = { id: g('regra-id'), acao_req: g('regra-id') ? 'editar' : 'criar', nomeRegra: g('regra-nome'), tipoGuia: g('regra-tipo'),
        campoValidado: g('regra-campo'), condicao: g('regra-condicao'), valorEsperado: g('regra-valor'), acao: g('regra-acao'), mensagemErro: g('regra-mensagem') };
    if (dados.nomeRegra.length < 2 || !dados.valorEsperado) return avisar('Informe o nome da regra e o valor esperado.', 'erro');
    if (dados.condicao === 'MAIOR_QUE' && isNaN(dados.valorEsperado.replace(',', '.'))) return avisar('Para "Maior que", o valor deve ser numérico.', 'erro');
    const r = await api('/api/regras', dados);
    if (r.ok) { fecharModal('modalNovaRegra'); avisar('Regra salva.', 'ok'); carregarRegrasCliente(); } else avisar(erroDe(r), 'erro');
}
async function excluirRegra(d) {
    if (!confirm('Excluir esta regra? Esta ação não pode ser desfeita.')) return;
    const r = await api('/api/regras', { acao_req: 'excluir', id: d.id });
    if (r.ok) { avisar('Regra excluída.', 'ok'); carregarRegrasCliente(); } else avisar(erroDe(r), 'erro');
}

// ---------- campanhas ----------
async function carregarMinhasCampanhas() {
    const tb = document.getElementById('lista-minhas-campanhas'); if (!tb) return;
    limpar(tb).append(linhaMsg(4, '⏳ Buscando suas campanhas…'));
    const r = await api('/api/publicidade?acao=listar_minhas'); limpar(tb);
    if (!r.ok) return tb.append(linhaMsg(4, erroDe(r), '#c00'));
    _campanhas = r.dados;
    if (!_campanhas.length) return tb.append(linhaMsg(4, 'Você ainda não solicitou nenhuma campanha.'));
    for (const ad of _campanhas) {
        tb.append(el('tr', {},
            el('td', {}, el('strong', {}, ad.tema)),
            el('td', {}, el('span', { class: 'badge', style: `background:${COR_STATUS[ad.status] || '#5c6770'}` }, TXT_STATUS[ad.status] || ad.status)),
            el('td', {}, el('small', {}, ad.valorOrcamento > 0 ? brl(ad.valorOrcamento) : 'Em análise')),
            el('td', {}, el('button', { class: 'btn', style: 'background:#0c7489;color:#fff;padding:5px;font-size:11px', 'data-acao': 'abrirAcompanhamentoCliente', 'data-id': ad.id },
                ['ORCADO', 'AGUARDANDO_PAGAMENTO'].includes(ad.status) ? 'Ver orçamento' : 'Detalhes'))));
    }
}
function abrirAcompanhamentoCliente(d) {
    const ad = _campanhas.find(x => x.id === d.id); if (!ad) return; _campanhaAtual = ad;
    document.getElementById('acom-cli-tema').value = ad.tema;
    document.getElementById('acom-cli-obs').textContent = ad.observacaoAdmin || 'O administrador ainda não enviou observações.';
    document.getElementById('acom-cli-valor').value = ad.valorOrcamento > 0 ? brl(ad.valorOrcamento) : 'Aguardando definição';
    const pagar = ['ORCADO', 'AGUARDANDO_PAGAMENTO'].includes(ad.status);
    document.getElementById('btn-aprovar-orc').style.display = pagar ? 'inline-block' : 'none';
    document.getElementById('btn-cancelar-orc').style.display = ['PENDENTE', 'ORCADO', 'AGUARDANDO_PAGAMENTO'].includes(ad.status) ? 'inline-block' : 'none';
    abrirModal('modalAcompanharAdCliente');
}
async function aprovarOrcamentoPIX() {
    if (!_campanhaAtual) return;
    const id = _campanhaAtual.id;
    fecharModal('modalAcompanharAdCliente');
    await gerarPix({ tipo: 'AD', id }, null);
    carregarMinhasCampanhas();
}
async function cancelarPedidoCliente() {
    if (!_campanhaAtual || !confirm('Cancelar este pedido de publicidade?')) return;
    const r = await api('/api/publicidade', { acao: 'resposta_cliente', id: _campanhaAtual.id, status: 'CANCELADO' });
    fecharModal('modalAcompanharAdCliente');
    if (r.ok) avisar('Pedido cancelado.', 'ok'); else avisar(erroDe(r), 'erro');
    carregarMinhasCampanhas();
}

const PRECO_TOKEN_EXIBIDO = 0.15;   // só para exibição; o preço real vem de PRECO_TOKEN no servidor

function abrirModalComprarTokens() {
    fecharModais();
    document.getElementById('area-pix-tokens').style.display = 'none';
    document.getElementById('btn-gerar-pix-tokens').style.display = 'block';
    document.getElementById('qtd-tokens-comprar').value = 100;
    calcularValorTokens();
    abrirModal('modalComprarTokens');
}

function calcularValorTokens() {
    const qtd = parseInt(document.getElementById('qtd-tokens-comprar').value) || 0;
    document.getElementById('valor-total-tokens').textContent = brl(qtd * PRECO_TOKEN_EXIBIDO);   // estimativa; o servidor confirma o valor
}

async function gerarPixTokens() {
    const qtd = parseInt(document.getElementById('qtd-tokens-comprar').value, 10);
    if (!qtd || qtd < 10 || qtd > 5000) return avisar('Informe de 10 a 5.000 tokens.', 'erro');

    await comCarga('btn-gerar-pix-tokens', 'Gerando PIX…', async () => {
        // O valor é calculado no SERVIDOR (PRECO_TOKEN); o navegador só informa a quantidade.
        let r = await api('/api/gerar_pix', { tipo: 'TOKENS', quantidade: qtd });
        if (!r.ok && r.dados && r.dados.codigo === 'cpf_cnpj_necessario') {
            const doc = prompt('Informe o CPF ou CNPJ do pagador (exigido pelo PIX):');
            if (!doc) return;
            r = await api('/api/gerar_pix', { tipo: 'TOKENS', quantidade: qtd, cpfCnpj: doc });
        }
        if (!r.ok) return avisar(erroDe(r), 'erro');

        const img = document.getElementById('qrcode-pix-tokens');
        img.src = r.dados.imagem_qrcode ? 'data:image/png;base64,' + r.dados.imagem_qrcode : '';
        document.getElementById('copia-cola-pix-tokens').value = r.dados.payload_pix || '';
        document.getElementById('valor-total-tokens').textContent = brl(r.dados.valor);
        document.getElementById('btn-gerar-pix-tokens').style.display = 'none';
        document.getElementById('area-pix-tokens').style.display = 'block';
    });
}

// Expõe as funções para o HTML
window.abrirModalComprarTokens = abrirModalComprarTokens;
window.calcularValorTokens = calcularValorTokens;
window.gerarPixTokens = gerarPixTokens;
