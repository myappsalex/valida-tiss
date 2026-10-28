// js/modulos/admin.js – backoffice (requer core.js, ui.js, auth.js)
// Toda autorização é imposta pelo servidor; esconder botões (data-perm) é só UX.
'use strict';

Pronto.then(u => {
    if (!u) { avisar('Entre com suas credenciais administrativas.', 'erro'); return irPara('index.html'); }
    if (u.tipo !== 'INTERNO') return irPara('dashboard_cliente.html');
    if (u.mustChangePassword) abrirTrocaSenha();
    document.getElementById('admin-quem').textContent = `${u.nome} · ${u.perfil}`;
    document.querySelectorAll('[data-perm]').forEach(e => { if (!pode(e.dataset.perm)) e.style.display = 'none'; });
    if (pode('clientes:ler')) pesquisarContratos();
});

const COR = { ATIVO: '#1e7e34', ADMIN: '#1e7e34', BLOQUEADO: '#b02a37', CANCELADO: '#b02a37', REJEITADO: '#b02a37', EXPIRADO: '#5c6770', PENDENTE: '#0056b3', ORCADO: '#b45f06', AGUARDANDO_PAGAMENTO: '#b45f06', INATIVO: '#b02a37' };
const badge = t => el('span', { class: 'badge', style: `background:${COR[t] || '#5c6770'}` }, t);
const btn = (txt, acao, dados, cls = 'btn btn-primary', extra = {}) =>
    el('button', { class: cls, style: 'padding:4px 8px;font-size:11px', 'data-acao': acao, ...Object.fromEntries(Object.entries(dados || {}).map(([k, v]) => ['data-' + k, v])), ...extra }, txt);
const val = id => document.getElementById(id).value;
function preencherSelect(sel, itens, vazio) {
    limpar(sel); sel.append(el('option', { value: '' }, vazio));
    for (const [v, t] of itens) sel.append(el('option', { value: v }, t));
}
let _clientes = [];
async function carregarClientes() {
    const r = await api('/api/gestao_usuarios?tipo=CLIENTE&pageSize=200');
    if (!r.ok) { avisar(erroDe(r), 'erro'); return false; }
    _clientes = r.dados; return true;
}

// ================= CARTEIRA DE CLIENTES =================
async function pesquisarContratos() {
    const tb = document.getElementById('tbody-contratos');
    limpar(tb).append(linhaMsg(6, '⏳ Consultando clientes…'));
    const q = new URLSearchParams({ tipo: 'CLIENTE', pageSize: 50 });
    for (const [campo, id] of [['nome', 'filtro-cli-nome'], ['email', 'filtro-cli-email'], ['statusConta', 'filtro-cli-status']]) if (val(id).trim()) q.set(campo, val(id).trim());
    const r = await api('/api/gestao_usuarios?' + q); limpar(tb);
    if (!r.ok) return tb.append(linhaMsg(6, erroDe(r), '#c00'));
    _clientes = r.dados;
    document.getElementById('paginacao-clientes').textContent = r.dados.length ? `Exibindo ${r.dados.length} cliente(s). Refine os filtros para localizar outros.` : '';
    if (!r.dados.length) return tb.append(linhaMsg(6, 'Nenhum cliente encontrado com esses filtros.'));
    for (const c of r.dados) {
        tb.append(el('tr', {},
            el('td', {}, el('strong', {}, c.nome)), el('td', {}, c.email),
            el('td', {}, badge(c.statusConta), ' ', c.statusPagamento === 'INATIVO' ? badge('INATIVO') : ''),
            el('td', {}, el('strong', {}, c.plano)),
            el('td', {}, el('strong', { style: 'color:#0056b3;font-size:16px' }, c.tokensRestantes ?? 0)),
            el('td', {},
                pode('clientes:editar') ? btn('✏️ Dados', 'abrirDadosCliente', { id: c.id }, 'btn btn-info') : '', ' ',
                pode('tokens:ajustar') ? btn('💰 Tokens', 'abrirModalTokens', { id: c.id }, 'btn btn-success') : '', ' ',
                pode('assinatura:editar') ? btn('💲 Assinatura', 'abrirModalAssinaturas', { id: c.id }, 'btn btn-premium') : '')));
    }
}
function abrirDadosCliente(d) {
    const c = _clientes.find(x => x.id === d.id); if (!c) return;
    document.getElementById('dados-cli-id').value = c.id; document.getElementById('dados-cli-nome').value = c.nome;
    document.getElementById('dados-cli-email').value = c.email;
    const cancelado = c.statusConta === 'CANCELADO';
    document.getElementById('chk-cancelar-conta').checked = cancelado;
    document.getElementById('dados-cli-data-cancelamento').value = cancelado && c.dataCancelamento ? String(c.dataCancelamento).slice(0, 10) : '';
    toggleDataCancelamento(); abrirModal('modalDadosCliente');
}
function toggleDataCancelamento() { document.getElementById('div-data-cancelamento').style.display = document.getElementById('chk-cancelar-conta').checked ? 'block' : 'none'; }
async function salvarDadosCliente() {
    const cancelar = document.getElementById('chk-cancelar-conta').checked, data = val('dados-cli-data-cancelamento');
    if (cancelar && !data) return avisar('Informe a data efetiva do cancelamento.', 'erro');
    if (cancelar && !confirm('Cancelar o acesso desta conta? O cliente será desconectado imediatamente.')) return;
    await comCarga('btn-dados-cli', 'Salvando…', async () => {
        const r = await api('/api/gestao_usuarios', { acao: 'editar_dados', tipo: 'CLIENTE', id: val('dados-cli-id'), nome: val('dados-cli-nome').trim(), cancelar, dataCancelamento: data || null });
        if (r.ok) { avisar(r.dados.mensagem, 'ok'); fecharModal('modalDadosCliente'); pesquisarContratos(); } else avisar(erroDe(r), 'erro');
    });
}

// ================= TOKENS =================
async function abrirModalTokens(d) {
    abrirModal('modalTokens'); document.getElementById('area-edicao-token').style.display = 'none';
    const sel = document.getElementById('select-cliente-token'); preencherSelect(sel, [], 'Carregando…');
    if (!(await carregarClientes())) return;
    preencherSelect(sel, _clientes.map(c => [c.id, `${c.nome} (${c.email})`]), '-- Selecione um cliente --');
    if (d && d.id) { sel.value = d.id; carregarDadosTokenCliente(d.id); }
}
function carregarDadosTokenCliente(id) {
    document.getElementById('token-qtd-add').value = ''; document.getElementById('token-motivo').value = '';
    const c = _clientes.find(x => x.id === id);
    document.getElementById('area-edicao-token').style.display = c ? 'block' : 'none';
    if (c) document.getElementById('token-saldo-atual').textContent = c.tokensRestantes ?? 0;
}
async function salvarTokensCliente() {
    const id = val('select-cliente-token'), q = parseInt(val('token-qtd-add'), 10);
    if (!id) return;
    if (!q) return avisar('Informe uma quantidade diferente de zero.', 'erro');
    await comCarga('btn-tokens', 'Salvando…', async () => {
        const r = await api('/api/gestao_usuarios', { acao: 'atualizar_tokens', tipo: 'CLIENTE', id, quantidade: q, motivo: val('token-motivo').trim() });
        if (r.ok) { avisar(`Saldo atualizado: ${r.dados.tokensRestantes} tokens.`, 'ok'); fecharModal('modalTokens'); pesquisarContratos(); } else avisar(erroDe(r), 'erro');
    });
}

// ================= ASSINATURAS =================
async function abrirModalAssinaturas(d) {
    abrirModal('modalAssinaturas'); document.getElementById('area-edicao-assinatura').style.display = 'none';
    const sel = document.getElementById('select-cliente-assinatura'); preencherSelect(sel, [], 'Carregando…');
    if (!(await carregarClientes())) return;
    preencherSelect(sel, _clientes.map(c => [c.id, `${c.nome} (${c.plano})`]), '-- Selecione um cliente --');
    if (d && d.id) { sel.value = d.id; carregarDadosAssinaturaCliente(d.id); }
}
function carregarDadosAssinaturaCliente(id) {
    const c = _clientes.find(x => x.id === id);
    document.getElementById('area-edicao-assinatura').style.display = c ? 'block' : 'none';
    if (!c) return;
    document.getElementById('edit-plano-cliente').value = c.plano || 'FREEMIUM';
    document.getElementById('edit-status-pagamento').value = c.statusPagamento || 'ATIVO';
    document.getElementById('edit-validade-plano').value = '';
}
async function salvarAssinaturaCliente() {
    const id = val('select-cliente-assinatura'); if (!id) return;
    const plano = val('edit-plano-cliente');
    await comCarga('btn-assinatura', 'Salvando…', async () => {
        const r = await api('/api/assinatura', { id, plano, statusPagamento: val('edit-status-pagamento'), planoValidoAte: plano === 'PREMIUM' ? (val('edit-validade-plano') || null) : null });
        if (r.ok) { avisar('Assinatura atualizada.', 'ok'); fecharModal('modalAssinaturas'); pesquisarContratos(); } else avisar(erroDe(r), 'erro');
    });
}

// ================= IAM =================
const PERFIS = [['ADMIN', 'Administrador geral'], ['OPERACAO', 'Operação'], ['PUBLICIDADE', 'Publicidade'], ['GESTAO', 'Gestão (leitura)']];
const STATUS_CLI = [['PENDENTE', 'Pendente'], ['ATIVO', 'Ativo'], ['BLOQUEADO', 'Bloqueado'], ['CANCELADO', 'Cancelado']];
let _usuarios = [], _editando = null;
function abrirModalGestaoAcessos() { abrirModal('modalGestaoAcessos'); carregarListaUsuarios(); }
async function carregarListaUsuarios() {
    const tipo = val('filtro-tipo-usuario'), tb = document.getElementById('lista-usuarios-body');
    limpar(tb).append(linhaMsg(4, '⏳ Pesquisando…'));
    const r = await api(`/api/gestao_usuarios?tipo=${tipo}&pageSize=200`); limpar(tb);
    if (!r.ok) return tb.append(linhaMsg(4, erroDe(r), '#c00'));
    _usuarios = r.dados;
    if (!r.dados.length) return tb.append(linhaMsg(4, 'Nenhum registro encontrado.'));
    for (const u of r.dados) {
        const rotulo = tipo === 'INTERNO' ? `${u.perfil} · ${u.status}` : u.statusConta;
        const bloqueado = (tipo === 'INTERNO' ? u.status : u.statusConta) === 'BLOQUEADO';
        tb.append(el('tr', {}, el('td', {}, el('strong', {}, u.nome)), el('td', {}, u.email), el('td', {}, badge(tipo === 'INTERNO' ? u.status : u.statusConta), ' ', tipo === 'INTERNO' ? el('small', {}, u.perfil) : ''),
            el('td', {}, btn('✏️ Editar', 'editarAcesso', { id: u.id, tipo }), ' ',
                btn('🔑 Resetar senha', 'resetarSenha', { id: u.id, tipo, email: u.email }, 'btn btn-warning'), ' ',
                bloqueado ? btn('♻️ Reativar', 'reativarAcesso', { id: u.id, tipo }, 'btn btn-success') : btn('🚫 Bloquear', 'bloquearAcesso', { id: u.id, tipo }, 'btn btn-danger'))));
        void rotulo;
    }
}
async function executarAcaoIAM(acao, id, tipo, novoDado) {
    const r = await api('/api/gestao_usuarios', { acao, id, tipo, novo_dado: novoDado });
    if (r.ok) { carregarListaUsuarios(); if (tipo === 'CLIENTE') pesquisarContratos(); }
    else avisar(erroDe(r), 'erro');
    return r;
}
function editarAcesso(d) {
    const u = _usuarios.find(x => x.id === d.id); if (!u) return;
    _editando = { id: d.id, tipo: d.tipo };
    document.getElementById('ea-rotulo').textContent = d.tipo === 'INTERNO' ? 'perfil' : 'situação da conta';
    document.getElementById('ea-quem').textContent = `${u.nome} · ${u.email}`;
    const sel = document.getElementById('ea-valor'); limpar(sel);
    for (const [v, t] of d.tipo === 'INTERNO' ? PERFIS : STATUS_CLI) sel.append(el('option', { value: v }, t));
    sel.value = d.tipo === 'INTERNO' ? u.perfil : u.statusConta;
    abrirModal('modalEditarAcesso');
}
async function salvarEdicaoAcesso() {
    if (!_editando) return;
    const r = await executarAcaoIAM('editar', _editando.id, _editando.tipo, val('ea-valor'));
    if (r.ok) { fecharModal('modalEditarAcesso'); avisar(r.dados.mensagem, 'ok'); }
}
async function bloquearAcesso(d) {
    if (!confirm('Bloquear este usuário? Ele será desconectado imediatamente.')) return;
    const r = await executarAcaoIAM('bloquear', d.id, d.tipo); if (r.ok) avisar(r.dados.mensagem || 'Usuário bloqueado.', 'ok');
}
async function reativarAcesso(d) {
    const r = await executarAcaoIAM('reativar', d.id, d.tipo); if (r.ok) avisar(r.dados.mensagem || 'Usuário reativado.', 'ok');
}
async function resetarSenha(d) {
    if (!confirm(`Gerar nova senha provisória para ${d.email}? A senha atual deixará de funcionar.`)) return;
    const r = await executarAcaoIAM('resetar', d.id, d.tipo);
    if (r.ok) mostrarSenhaTemp(d.email, r.dados.senhaTemporaria);
}
function mostrarSenhaTemp(quem, senha) {
    document.getElementById('st-quem').textContent = quem; document.getElementById('st-senha').value = senha; abrirModal('modalSenhaTemp');
}
async function copiarSenhaTemp() {
    const c = document.getElementById('st-senha');
    try { await navigator.clipboard.writeText(c.value); avisar('Copiada.', 'ok'); } catch { c.select(); }
}
function fecharSenhaTemp() { document.getElementById('st-senha').value = ''; fecharModal('modalSenhaTemp'); }
async function cadastrarUsuarioInterno() {
    const nome = val('cad-nome-interno').trim(), email = val('cad-email-interno').trim();
    if (!nome || !email) return avisar('Preencha nome e e-mail.', 'erro');
    await comCarga('btn-cad-interno', 'Criando…', async () => {
        const r = await api('/api/gestao_usuarios', { acao: 'criar_interno', nome, email, perfil: val('cad-perfil-interno') });
        if (!r.ok) return avisar(erroDe(r), 'erro');
        fecharModal('modalFuncionario'); document.getElementById('cad-nome-interno').value = ''; document.getElementById('cad-email-interno').value = '';
        mostrarSenhaTemp(email, r.dados.senhaTemporaria);
    });
}

// ================= TUSS =================
function verificarArquivoSelecionado() {
    const f = document.getElementById('arquivo-csv-tuss').files[0], d = document.getElementById('resultado-carga'); limpar(d);
    if (f) d.append(el('span', { style: 'color:#0c7489' }, `📁 ${f.name} (${(f.size / 1024).toFixed(1)} KB) pronto para envio.`));
}
async function processarCargaTUSS() {
    const f = document.getElementById('arquivo-csv-tuss').files[0], saida = document.getElementById('resultado-carga');
    const msg = (t, cor) => limpar(saida).append(el('span', { style: `color:${cor || '#333'}` }, t));
    if (!f) return msg('❌ Selecione um arquivo CSV primeiro.', '#b02a37');
    await comCarga('btn-upload-tuss', 'Processando…', async () => {
        const linhas = (await f.text()).split(/\r?\n/), cab = linhas[0], TAM = 2000;
        const corpo = linhas.slice(1).filter(l => l.trim()); let criados = 0, pacote = 0;
        for (let i = 0; i < corpo.length; i += TAM) {
            pacote++; msg(`Enviando pacote ${pacote} de ${Math.ceil(corpo.length / TAM)}…`);
            const r = await api('/api/carga_tuss', { tabela: val('tabela-importacao'), csv_data: cab + '\n' + corpo.slice(i, i + TAM).join('\n') });
            if (!r.ok) return msg(`❌ Erro no pacote ${pacote}: ${erroDe(r)} (${criados} registros já gravados; reenviar é seguro — duplicados são ignorados).`, '#b02a37');
            criados += r.dados.criados || 0;
        }
        msg(`✅ Concluído: ${criados} novos registros em ${pacote} pacote(s).`, '#1e7e34');
        document.getElementById('arquivo-csv-tuss').value = '';
    });
}
function prepararEdicaoDominio(d, elemento) {
    let x; try { x = JSON.parse(elemento.dataset.json); } catch { return; }
    document.getElementById('edit-tuss-id').value = x.id; document.getElementById('edit-tuss-tabela').value = x.codigoTabela;
    document.getElementById('edit-tuss-codigo').value = x.codigoTermo; document.getElementById('edit-tuss-termo').value = x.termo;
    document.getElementById('edit-tuss-anvisa').value = x.registroAnvisa || ''; document.getElementById('edit-tuss-fabricante').value = x.fabricante || '';
    document.getElementById('edit-tuss-modelo').value = x.apresentacaoModelo || ''; document.getElementById('edit-tuss-risco').value = x.classeRisco || '';
    abrirModal('modalEdicaoDominio');
}
async function salvarEdicaoDominio() {
    await comCarga('btn-edit-tuss', 'Salvando…', async () => {
        const r = await api('/api/dominio_tuss', { acao: 'editar', id: val('edit-tuss-id'), codigoTabela: val('edit-tuss-tabela'), codigoTermo: val('edit-tuss-codigo').trim(),
            termo: val('edit-tuss-termo').trim(), registroAnvisa: val('edit-tuss-anvisa').trim(), fabricante: val('edit-tuss-fabricante').trim(),
            apresentacaoModelo: val('edit-tuss-modelo').trim(), classeRisco: val('edit-tuss-risco').trim() });
        if (r.ok) { avisar('Domínio atualizado.', 'ok'); fecharModal('modalEdicaoDominio'); pesquisarDominiosTUSS(); } else avisar(erroDe(r), 'erro');
    });
}
async function excluirDominioTUSS(d) {
    if (!confirm('Inativar este domínio? Ele deixa de aparecer para os clientes (pode ser reativado).')) return;
    const r = await api('/api/dominio_tuss', { acao: 'excluir', id: d.id });
    if (r.ok) pesquisarDominiosTUSS(); else avisar(erroDe(r), 'erro');
}

// ================= REGRAS DOS CLIENTES (leitura) =================
async function abrirModalRegrasAdmin() {
    abrirModal('modalRegrasAdmin'); const sel = document.getElementById('select-clientes-regras');
    preencherSelect(sel, [], 'Carregando…');
    if (!(await carregarClientes())) return;
    preencherSelect(sel, _clientes.map(c => [c.id, `${c.nome} (${c.email})`]), '-- Selecione um cliente --');
}
async function carregarRegrasClienteAdmin(id) {
    const tb = document.getElementById('tbody-regras-admin'); limpar(tb);
    if (!id) return tb.append(linhaMsg(4, 'Selecione um cliente.'));
    const r = await api('/api/regras?clienteId=' + encodeURIComponent(id));
    if (!r.ok) return tb.append(linhaMsg(4, erroDe(r), '#c00'));
    if (!r.dados.length) return tb.append(linhaMsg(4, 'Este cliente ainda não criou regras.'));
    for (const x of r.dados) tb.append(el('tr', {}, el('td', {}, el('strong', {}, x.nomeRegra)),
        el('td', {}, x.tipoGuia, el('br'), el('small', {}, 'Campo: ' + x.campoValidado)), el('td', {}, x.condicao + ' ', el('strong', {}, x.valorEsperado)),
        el('td', {}, el('span', { class: 'badge', style: `background:${x.acao === 'BLOQUEIO' ? '#b02a37' : '#b45f06'}` }, x.acao))));
}

// ================= PUBLICIDADE =================
let _pedidos = [];
function abrirGestaoAdsAdminGeral() { abrirModal('modalGestaoAdsAdmin'); pesquisarPedidosAdAdmin(); }
async function pesquisarPedidosAdAdmin() {
    const tb = document.getElementById('tbody-gestao-ads-admin'); limpar(tb).append(linhaMsg(5, '⏳ Buscando pedidos…'));
    const q = new URLSearchParams({ acao: 'listar' });
    if (val('filtro-ad-cliente').trim()) q.set('cliente', val('filtro-ad-cliente').trim());
    if (val('filtro-ad-status')) q.set('status', val('filtro-ad-status'));
    const r = await api('/api/publicidade?' + q); limpar(tb);
    if (!r.ok) return tb.append(linhaMsg(5, erroDe(r), '#c00'));
    _pedidos = r.dados;
    if (!r.dados.length) return tb.append(linhaMsg(5, 'Nenhum pedido encontrado.'));
    for (const ad of r.dados) tb.append(el('tr', {}, el('td', {}, el('strong', {}, ad.empresa_nome || '—')),
        el('td', {}, el('div', { style: 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title: ad.tema }, ad.tema)),
        el('td', {}, ad.localExibicao), el('td', {}, badge(ad.status)),
        el('td', {}, pode('ads:avaliar') ? btn('Avaliar', 'abrirAvaliacaoAdAdmin', { id: ad.id }, 'btn btn-info') : '')));
}
function abrirAvaliacaoAdAdmin(d) {
    const ad = _pedidos.find(x => x.id === d.id); if (!ad) return;
    document.getElementById('aval-ad-id').value = ad.id; document.getElementById('aval-ad-tema').value = ad.tema;
    document.getElementById('aval-ad-obs').value = ad.observacaoAdmin || ''; document.getElementById('aval-ad-valor').value = ad.valorOrcamento > 0 ? ad.valorOrcamento : '';
    document.getElementById('aval-ad-inicio').value = (ad.dataInicio || '').slice(0, 10); document.getElementById('aval-ad-fim').value = (ad.dataFim || '').slice(0, 10);
    document.getElementById('aval-ad-local').value = ad.localExibicao || 'CABECALHO';
    const l = urlSegura(ad.link_destino), sp = document.getElementById('aval-ad-link'); limpar(sp);
    sp.append(l ? el('a', { href: l, target: '_blank', rel: 'noopener noreferrer' }, l) : '(link inválido)');
    const ban = document.getElementById('aval-ad-banner'); limpar(ban);
    ban.append(el('img', { src: `/api/banner?id=${encodeURIComponent(ad.id)}`, alt: 'Arte enviada pelo cliente', style: 'max-height:120px;max-width:100%', onerror() { this.remove(); } }));
    document.getElementById('aval-ad-estado').textContent = `Status atual: ${ad.status}. Para "Ativar", informe a data fim; para "Orçamento", um valor maior que zero.`;
    abrirModal('modalAvaliarAdAdmin');
}
async function salvarAvaliacaoAd(status) {
    const valor = parseFloat(val('aval-ad-valor')) || 0;
    if (status === 'ORCADO' && valor <= 0) return avisar('Informe um valor maior que zero para enviar o orçamento.', 'erro');
    if (status === 'ATIVO' && !val('aval-ad-fim')) return avisar('Informe a data fim para ativar o anúncio.', 'erro');
    if (['CANCELADO', 'REJEITADO'].includes(status) && !confirm(`Confirma "${status}" para este pedido? Não poderá ser reaberto.`)) return;
    const r = await api('/api/publicidade', { acao: 'avaliar', id: val('aval-ad-id'), status, observacaoAdmin: val('aval-ad-obs').trim(), valorOrcamento: valor,
        dataInicio: val('aval-ad-inicio') || null, dataFim: val('aval-ad-fim') || null, localExibicao: val('aval-ad-local') });
    if (r.ok) { avisar('Avaliação salva.', 'ok'); fecharModal('modalAvaliarAdAdmin'); pesquisarPedidosAdAdmin(); } else avisar(erroDe(r), 'erro');
}
