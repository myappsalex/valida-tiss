// js/modulos/core.js – base comum (carregar PRIMEIRO em todas as páginas)
// Substitui: fetch repetido em cada função, innerHTML com dados crus (XSS),
// alert() bloqueante, sessão confiada ao sessionStorage e handlers inline
// (incompatíveis com CSP). A autenticação real é o cookie HttpOnly do servidor.
'use strict';

// ================= CONTROLE DE VERSÃO (GMUD) =================
const GMUD_VERSAO = "v2.1.1";
const GMUD_DATA = "30/10/2026";
const GMUD_NOTAS = [
    "Refatoração da arquitetura (Micro-monólitos)",
    "Novo painel de publicidade e criação de anúncios avulsos",
    "Segurança aprimorada (JWT, Proteção CSRF, Bcrypt)"
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cria o botão flutuante no rodapé
    const btnVersao = el('div', {
        style: 'position:fixed; bottom:15px; right:15px; background:#0c7489; color:#fff; padding:6px 12px; border-radius:20px; font-size:11px; font-weight:bold; cursor:pointer; z-index:9999; box-shadow:0 2px 5px rgba(0,0,0,0.3); transition: 0.2s;',
        'data-onclick': "abrirModal('modalVersaoGMUD')"
    }, '🚀 Versão ' + GMUD_VERSAO);
    
    // Efeito hover seguro
    btnVersao.onmouseover = () => btnVersao.style.transform = 'scale(1.05)';
    btnVersao.onmouseout = () => btnVersao.style.transform = 'scale(1)';

    // 2. Monta as notas de atualização (respeitando CSP sem usar innerHTML)
    const containerNotas = el('div', { style: 'background:#f8f9fa; padding:12px; border-radius:6px; font-size:12px; text-align:left; border:1px solid #ddd; margin-bottom:15px;' });
    GMUD_NOTAS.forEach(nota => containerNotas.append(el('div', { style: 'margin-bottom:6px; color:#444;' }, '• ' + nota)));

    // 3. Cria o Modal
    const modalVersao = el('div', { id: 'modalVersaoGMUD', class: 'modal-overlay' },
        el('div', { class: 'modal-content', style: 'width:350px; text-align:center;' },
            el('h3', { style: 'color:#0c7489; margin-top:0;' }, 'Informações do Sistema'),
            el('p', { style: 'font-size:18px; font-weight:bold; margin:10px 0; color:#333;' }, 'ValidaTISS ' + GMUD_VERSAO),
            el('p', { style: 'font-size:12px; color:#666; margin-bottom:15px;' }, 'Atualizado em: ' + GMUD_DATA),
            containerNotas,
            el('button', { class: 'btn btn-primary', style: 'width:100%;', 'data-onclick': "fecharModal('modalVersaoGMUD')" }, 'Estou Ciente')
        )
    );

    document.body.append(btnVersao, modalVersao);
});

// ---------- segurança de saída ----------
const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
function esc(valor) { return String(valor ?? '').replace(/[&<>"'`]/g, c => _ESC[c]); }

/** Cria elemento sem innerHTML: el('td', {class:'x'}, 'texto', outroEl) */
function el(tag, attrs, ...filhos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === false || v == null) continue;
        if (k === 'class') n.className = v;
        else if (k === 'style') n.style.cssText = v;
        else if (k.startsWith('data-')) n.setAttribute(k, v);
        else if (k in n) n[k] = v;
        else n.setAttribute(k, v);
    }
    for (const f of filhos.flat()) if (f != null) n.append(f.nodeType ? f : document.createTextNode(String(f)));
    return n;
}
function limpar(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function linhaMsg(colspan, texto, cor) {
    return el('tr', {}, el('td', { colspan, style: `text-align:center;${cor ? 'color:' + cor : ''}` }, texto));
}
function urlSegura(u) {
    try { const x = new URL(u, location.origin); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
}
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- avisos (substitui alert) ----------
function avisar(msg, tipo = 'info') {
    let r = document.getElementById('vt-avisos');
    if (!r) {
        r = el('div', { id: 'vt-avisos', 'aria-live': 'polite', role: 'status' });
        document.body.append(r);
    }
    const t = el('div', { class: 'vt-aviso vt-' + tipo }, msg);
    r.append(t);
    setTimeout(() => t.remove(), tipo === 'erro' ? 9000 : 5000);
}

// ---------- API ----------
const Sessao = { usuario: null, ouvintes: [] };
let usuarioLogado = null; // compatível com o validador.js existente

function definirUsuario(u) {
    Sessao.usuario = u; usuarioLogado = u; window.usuarioLogado = u;
    // Cache só para exibição (NÃO é autenticação; o servidor revalida via cookie).
    try { u ? sessionStorage.setItem('sessaoTISS', JSON.stringify(u)) : sessionStorage.removeItem('sessaoTISS'); } catch { }
    Sessao.ouvintes.forEach(f => f(u));
}
function pode(permissao) { return !!Sessao.usuario && (Sessao.usuario.permissoes || []).includes(permissao); }

async function api(url, corpo) {
    const opts = { credentials: 'same-origin', headers: {} };
    if (corpo !== undefined) {
        opts.method = 'POST';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(corpo);
    }
    let r;
    try { r = await fetch(url, opts); }
    catch { return { ok: false, status: 0, dados: { erro: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.' } }; }
    let dados = null;
    try { dados = await r.json(); } catch { dados = { erro: 'Resposta inesperada do servidor.' }; }
    if (r.status === 401 && Sessao.usuario) {   // sessão expirou/revogada
        definirUsuario(null);
        avisar('Sua sessão expirou. Entre novamente.', 'erro');
    }
    if (r.status === 403 && dados && dados.codigo === 'troca_senha') abrirTrocaSenha();
    return { ok: r.ok && !(dados && dados.sucesso === false), status: r.status, dados };
}
const erroDe = r => (r.dados && r.dados.erro) || 'Não foi possível concluir a operação.';

async function carregarSessao() {
    const r = await api('/api/auth');
    definirUsuario(r.ok ? r.dados.usuario : null);
    return Sessao.usuario;
}

// ---------- botões com estado de carregamento ----------
async function comCarga(btn, texto, fn) {
    if (typeof btn === 'string') btn = document.getElementById(btn);
    if (!btn || btn.disabled) return;
    const original = btn.textContent;
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    btn.textContent = texto || 'Processando…';
    try { return await fn(); }
    finally { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = original; }
}

// ---------- modais acessíveis ----------
const _pilhaFoco = [];
function abrirModal(id) {
    const m = document.getElementById(id); if (!m) return;
    _pilhaFoco.push(document.activeElement);
    m.style.display = 'flex';
    const c = m.querySelector('.modal-content');
    if (c) { c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true'); c.tabIndex = -1; }
    const alvo = m.querySelector('input:not([type=hidden]):not([readonly]),select,textarea,button') || c;
    if (alvo) alvo.focus();
}
function fecharModal(id) {
    const m = document.getElementById(id || 'modalPremium'); if (!m) return;
    m.style.display = 'none';
    const f = _pilhaFoco.pop(); if (f && f.focus) try { f.focus(); } catch { }
}
function fecharModais() { document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; }); _pilhaFoco.length = 0; }
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const abertos = [...document.querySelectorAll('.modal-overlay')].filter(m => m.style.display === 'flex');
        if (abertos.length) fecharModal(abertos[abertos.length - 1].id);
    }
    if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.enter) {   // Enter envia o formulário
        e.preventDefault(); executar(e.target.dataset.enter, e.target);
    }
});

// ---------- despachante de eventos (CSP: sem onclick inline) ----------
// data-onclick="fn('a', 1, this.value)"  |  data-acao="fn" data-id="..."  (dados dinâmicos)
const _PROIBIDAS = /^(eval|Function|alert|open|fetch|setTimeout|setInterval|write|execScript)$/;
function _args(txt, el) {
    const out = []; let i = 0; const s = txt.trim();
    while (i < s.length) {
        while (s[i] === ' ' || s[i] === ',') i++;
        if (i >= s.length) break;
        if (s[i] === "'" || s[i] === '"') {
            const q = s[i++]; let v = '';
            while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; v += s[i++]; }
            i++; out.push(v);
        } else {
            let t = ''; while (i < s.length && s[i] !== ',') t += s[i++];
            t = t.trim();
            out.push(t === 'this.value' ? el.value : t === 'this' ? el : t === 'true' ? true : t === 'false' ? false
                : t === 'null' ? null : (t !== '' && !isNaN(t)) ? Number(t) : t);
        }
    }
    return out;
}
function _instrucoes(spec) {      // separa "a(); b()" respeitando aspas
    const out = []; let atual = '', q = null;
    for (const c of spec) {
        if (q) { atual += c; if (c === q) q = null; }
        else if (c === "'" || c === '"') { q = c; atual += c; }
        else if (c === ';') { out.push(atual); atual = ''; }
        else atual += c;
    }
    out.push(atual); return out.map(t => t.trim()).filter(Boolean);
}
function executar(spec, elemento) {
    for (const instr of _instrucoes(spec || '')) {
        const m = /^([A-Za-z_$][\w$]*)\s*(?:\((.*)\))?$/s.exec(instr);
        if (!m || _PROIBIDAS.test(m[1])) continue;
        const fn = window[m[1]];
        if (typeof fn !== 'function') continue;
        if (m[2] === undefined) fn.call(elemento, elemento.dataset, elemento);   // modo data-acao
        else fn.apply(elemento, _args(m[2], elemento));
    }
}
for (const [evento, attr] of [['click', 'onclick'], ['change', 'onchange'], ['input', 'oninput'], ['submit', 'onsubmit']]) {
    document.addEventListener(evento, ev => {
        const alvo = ev.target.closest && ev.target.closest(`[data-${attr}]`);
        if (!alvo) return;
        if (evento === 'submit') ev.preventDefault();
        if (alvo.tagName === 'A') ev.preventDefault();
        executar(alvo.getAttribute(`data-${attr}`), alvo);
    });
}
// botões criados dinamicamente: <button data-acao="fn" data-id="..."> (dados vão em dataset, nunca em JS inline)
document.addEventListener('click', ev => {
    const alvo = ev.target.closest && ev.target.closest('[data-acao]');
    if (alvo) executar(alvo.getAttribute('data-acao'), alvo);
});
function maiusculas(_d, elemento) { elemento.value = elemento.value.toUpperCase(); }
function irPara(url) { location.href = url; }

// ---------- troca obrigatória de senha ----------
function abrirTrocaSenha() {
    if (document.getElementById('modalTrocaSenha')) return abrirModal('modalTrocaSenha');
    const m = el('div', { id: 'modalTrocaSenha', class: 'modal-overlay' },
        el('div', { class: 'modal-content', style: 'max-width:380px' },
            el('h3', {}, '🔑 Defina uma nova senha'),
            el('p', { style: 'font-size:13px;color:#555' }, 'Sua senha é provisória. Crie uma nova para continuar.'),
            el('label', { for: 'ts-atual' }, 'Senha atual'), el('input', { id: 'ts-atual', type: 'password', class: 'form-control', autocomplete: 'current-password' }),
            el('label', { for: 'ts-nova' }, 'Nova senha (mín. 10 caracteres, sem ser fácil de adivinhar)'), el('input', { id: 'ts-nova', type: 'password', class: 'form-control', autocomplete: 'new-password', 'data-enter': 'salvarTrocaSenha' }),
            el('button', { id: 'btn-troca-senha', class: 'btn btn-primary', style: 'width:100%;margin-top:12px', 'data-onclick': 'salvarTrocaSenha' }, 'Salvar nova senha')));
    document.body.append(m); abrirModal('modalTrocaSenha');
}
async function salvarTrocaSenha() {
    await comCarga('btn-troca-senha', 'Salvando…', async () => {
        const r = await api('/api/auth', { acao: 'trocar_senha', senha_atual: document.getElementById('ts-atual').value, nova_senha: document.getElementById('ts-nova').value });
        if (r.ok) { definirUsuario(r.dados.usuario); fecharModais(); avisar('Senha alterada com sucesso.', 'ok'); }
        else avisar(erroDe(r), 'erro');
    });
}

// ---------- inicialização ----------
const Pronto = new Promise(res => {
    const iniciar = async () => { await carregarSessao(); res(Sessao.usuario); };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();
});
