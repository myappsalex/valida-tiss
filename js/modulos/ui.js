// js/modulos/ui.js – componentes de interface compartilhados (requer core.js)
'use strict';

// --- Wizard do validador (mantido: o validador.js usa estas funções) ---
function alterarPasso(passo) {
    document.querySelectorAll('.wizard-step').forEach(e => e.classList.remove('active'));
    const s = document.getElementById(`step-${passo}`); if (s) s.classList.add('active');
}
function reiniciarWizard() {
    const i = document.getElementById('xmlInput'); if (i) i.value = '';
    const r = document.getElementById('resultado'); if (r) limpar(r);
    const b = document.getElementById('btnExportar'); if (b) b.style.display = 'none';
    if (typeof xmlDocAtual !== 'undefined') xmlDocAtual = null;
    alterarPasso(1);
}

// Antes: innerHTML = decodeURIComponent(texto) → XSS por XML malicioso. Agora: só texto.
function mostrarGlosaModal(textoCodificado) {
    let t = textoCodificado; try { t = decodeURIComponent(textoCodificado); } catch { }
    const d = document.createElement('div'); d.innerHTML = String(t).replace(/<br\s*\/?>/gi, '\n');
    document.getElementById('texto-glosa-item').textContent = d.textContent;   // d nunca é inserido na página
    abrirModal('modalGlosaItem');
}

function redirecionarCheckout() {
    if (!Sessao.usuario) { fecharModais(); abrirModal('modalAuth'); return; }
    if (Sessao.usuario.tipo !== 'CLIENTE') return avisar('Disponível apenas para contas de cliente.', 'erro');
    irPara('dashboard_cliente.html#assinatura');
}

// --- Banners (conteúdo vindo de terceiros: sempre via DOM, nunca innerHTML) ---
let _anuncios = [], _idx = { CABECALHO: 0, LATERAL: 0 };

function _abrirAnuncio(ad) {
    if (!ad || !ad.link) return abrirPedidoPublicidade();
    const u = urlSegura(/^https?:\/\//i.test(ad.link) ? ad.link : 'https://' + ad.link);
    if (u) window.open(u, '_blank', 'noopener,noreferrer'); else abrirPedidoPublicidade();
}
function _pintarCabecalho(ad) {
    const d = document.getElementById('ads_cabecalho'); if (!d) return;
    limpar(d);
    if (ad) d.append(el('h3', { style: 'margin:0' }, '🚀 ' + ad.titulo), el('span', { class: 'pulse-text' }, ad.texto));
    else d.append(el('h3', { style: 'margin:0' }, '🚀 O seu software médico visto por milhares de faturistas!'), el('span', { class: 'pulse-text' }, 'Clique aqui e anuncie no portal'));
    d.onclick = () => _abrirAnuncio(ad);
    d.setAttribute('role', 'link'); d.tabIndex = 0;
    d.onkeydown = e => { if (e.key === 'Enter') d.onclick(); };
}
function _pintarLateral(ad) {
    const d = document.getElementById('ads_lateral'); if (!d) return;
    limpar(d);
    if (ad) {
        d.append(el('h4', {}, ad.titulo), el('p', {}, ad.texto));
        if (ad.banner && ad.banner.startsWith('/api/banner?id='))
            d.append(el('img', { src: ad.banner, alt: 'Anúncio: ' + ad.titulo, width: 150, loading: 'lazy' }));
        d.append(el('span', { class: 'btn-ad' }, 'Acessar'));
    } else d.append(el('h4', {}, 'Anuncie Aqui'), el('p', {}, 'O seu software visto por quem decide.'), el('span', { class: 'btn-ad' }, 'Ver Formatos'));
    d.onclick = () => _abrirAnuncio(ad);
    d.setAttribute('role', 'link'); d.tabIndex = 0;
    d.onkeydown = e => { if (e.key === 'Enter') d.onclick(); };
}
function _girar() {
    if (document.hidden) return;
    for (const [local, pintar] of [['CABECALHO', _pintarCabecalho], ['LATERAL', _pintarLateral]]) {
        const lista = _anuncios.filter(a => a.local === local);
        if (!lista.length) { if (_idx[local] !== -1) { pintar(null); _idx[local] = -1; } continue; }
        _idx[local] = (_idx[local] + 1) % lista.length;
        pintar(lista[_idx[local]]);
    }
}
async function carregarPublicidadesAtivas() {
    if (!document.getElementById('ads_cabecalho') && !document.getElementById('ads_lateral')) return;
    const r = await api('/api/campanhas');
    _anuncios = r.ok && Array.isArray(r.dados) ? r.dados : [];
    _idx = { CABECALHO: -1, LATERAL: -1 }; _girar();
    if (_anuncios.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(_girar, 8000);
}
const iniciarRotacaoPublicidade = carregarPublicidadesAtivas;   // nome legado

// --- Pedido de publicidade (somente cliente logado) ---
function abrirPedidoPublicidade() {
    const u = Sessao.usuario;
    if (!u) return abrirModal('modalBoasVindasPub');
    if (u.tipo !== 'CLIENTE') return avisar('Pedidos de publicidade são feitos pela conta do cliente.', 'info');
    if (!document.getElementById('modalPublicidade')) return irPara('dashboard_cliente.html?abrirPub=1');
    document.getElementById('pub-empresa').value = u.nome;
    document.getElementById('pub-email').value = u.email;
    abrirModal('modalPublicidade');
}
function _lerArquivo(f) {
    return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
}
async function enviarPedidoPub() {
    const link = document.getElementById('pub-link').value.trim();
    const tema = document.getElementById('pub-tema').value.trim();
    const f = document.getElementById('pub-arquivo').files[0];
    if (!urlSegura(link)) return avisar('Informe um link válido começando com http:// ou https://', 'erro');
    if (tema.length < 10) return avisar('Descreva a campanha em pelo menos 10 caracteres.', 'erro');
    if (f && f.size > 300 * 1024) return avisar('A arte deve ter no máximo 300 KB (PNG ou JPG).', 'erro');
    await comCarga('btn-pub-submit', 'Enviando…', async () => {
        const r = await api('/api/publicidade', {
            acao: 'criar', link_destino: link, tema,
            localExibicao: document.getElementById('pub-local').value,
            arquivo_base64: f ? await _lerArquivo(f) : null
        });
        if (r.ok) {
            avisar('Pedido registrado! A equipe comercial enviará um orçamento em breve.', 'ok');
            fecharModais();
            if (typeof carregarMinhasCampanhas === 'function') carregarMinhasCampanhas();
        } else avisar(erroDe(r), 'erro');
    });
}
document.addEventListener('DOMContentLoaded', () => {
    if (new URLSearchParams(location.search).get('abrirPub') === '1')
        Pronto.then(() => abrirPedidoPublicidade());
});

// --- PIX (QR real do Asaas; o valor vem do servidor) ---
function mostrarPix(d) {
    document.getElementById('pix-valor-display').textContent = brl(d.valor);
    const img = document.getElementById('pix-qrcode-img');
    img.src = d.imagem_qrcode ? 'data:image/png;base64,' + d.imagem_qrcode : '';
    img.alt = 'QR Code PIX no valor de ' + brl(d.valor);
    document.getElementById('pix-copia-cola').value = d.payload_pix || '';
    abrirModal('modalPagarAds');
}
async function gerarPix(corpo, btn) {
    const exec = async () => {
        let r = await api('/api/gerar_pix', corpo);
        if (!r.ok && r.dados && r.dados.codigo === 'cpf_cnpj_necessario') {
            const doc = prompt('Informe o CPF ou CNPJ do pagador (exigido pelo PIX):');
            if (!doc) return;
            r = await api('/api/gerar_pix', { ...corpo, cpfCnpj: doc });
        }
        if (r.ok) mostrarPix(r.dados); else avisar(erroDe(r), 'erro');
    };
    return btn ? comCarga(btn, 'Gerando PIX…', exec) : exec();
}
async function copiarPix() {
    const campo = document.getElementById('pix-copia-cola');
    try { await navigator.clipboard.writeText(campo.value); }
    catch { campo.select(); document.execCommand('copy'); }
    avisar('Código PIX copiado.', 'ok');
}

// --- Consulta TUSS (cliente e staff) ---
async function pesquisarDominiosTUSS() {
    const cod = document.getElementById('filtro-codigo-tuss').value.trim();
    const termo = document.getElementById('filtro-termo-tuss').value.trim();
    const tb = document.getElementById('tbody-dominios');
    if (!cod && termo.length < 3) return avisar('Digite um código ou ao menos 3 letras da descrição.', 'erro');
    limpar(tb).append(linhaMsg(7, '⏳ Pesquisando…'));
    const r = await api(`/api/dominio_tuss?codigo=${encodeURIComponent(cod)}&termo=${encodeURIComponent(termo)}`);
    limpar(tb);
    if (!r.ok) return tb.append(linhaMsg(7, erroDe(r), '#c00'));
    if (!r.dados.length) return tb.append(linhaMsg(7, 'Sem resultados.'));
    const staff = pode('tuss:editar');
    for (const d of r.dados) {
        const acoes = staff ? el('td', {},
            el('button', { class: 'btn btn-warning', 'aria-label': 'Editar ' + d.codigoTermo, style: 'padding:4px;font-size:11px', 'data-acao': 'prepararEdicaoDominio', 'data-json': JSON.stringify(d) }, '✏️'), ' ',
            el('button', { class: 'btn btn-danger', 'aria-label': 'Inativar ' + d.codigoTermo, style: 'padding:4px;font-size:11px', 'data-acao': 'excluirDominioTUSS', 'data-id': d.id }, '🗑️')) : null;
        tb.append(el('tr', {}, el('td', {}, d.codigoTabela), el('td', {}, el('strong', {}, d.codigoTermo)),
            el('td', {}, d.termo, d.ativo ? '' : ' (inativo)'), el('td', {}, d.apresentacaoModelo || '-'),
            el('td', {}, d.fabricante || '-'), el('td', {}, d.registroAnvisa || '-'), acoes));
    }
}
