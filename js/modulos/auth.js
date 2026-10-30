// js/modulos/auth.js – login/registro/logout e barra superior (requer core.js e ui.js)
'use strict';

function alternarFormAuth(tipo) {
    document.getElementById('form-login').style.display = tipo === 'login' ? 'block' : 'none';
    document.getElementById('form-registro').style.display = tipo === 'registro' ? 'block' : 'none';
    const alvo = document.getElementById(tipo === 'login' ? 'login-email' : 'reg-nome'); if (alvo) alvo.focus();
}
function fecharModalAuth() { fecharModal('modalAuth'); }

function atualizarTopoSite() {
    const s = document.getElementById('user-status'), b = document.getElementById('btn-login-top');
    if (!s || !b) return;
    const u = Sessao.usuario;
    if (!u) {
        s.textContent = 'Visitante (não autenticado)'; s.style.color = '';
        b.textContent = '🔒 Acesso Cliente'; b.setAttribute('data-onclick', "abrirModal('modalAuth')"); return;
    }
    if (u.tipo === 'INTERNO') {
        s.textContent = `👤 ${u.nome} | Perfil: ${u.perfil}`; s.style.color = '#b02a37';
        b.textContent = '⚙️ Área Master'; b.setAttribute('data-onclick', "irPara('admin.html')");
    } else {
        s.textContent = `👤 ${u.nome} | Saldo: ${u.tokensRestantes} IA`; s.style.color = '#0056b3';
        b.textContent = '📊 Meu Painel'; b.setAttribute('data-onclick', "irPara('dashboard_cliente.html')");
    }
}
Sessao.ouvintes.push(atualizarTopoSite);

async function efetuarLogout() {
    await api('/api/auth', { acao: 'logout' });   // invalida o cookie no servidor
    definirUsuario(null);
    irPara('index.html');
}

async function efetuarLogin() {
    const email = document.getElementById('login-email').value.trim(), senha = document.getElementById('login-senha').value;
    if (!email || !senha) return avisar('Informe e-mail e senha.', 'erro');
    await comCarga('btn-login-submit', 'Entrando…', async () => {
        const r = await api('/api/auth', { acao: 'login', email, senha });
        if (!r.ok) return avisar(erroDe(r), 'erro');
        document.getElementById('login-senha').value = '';
        definirUsuario(r.dados.usuario); fecharModalAuth();
        if (r.dados.usuario.mustChangePassword) abrirTrocaSenha();
        if (typeof carregarPainelCliente === 'function') carregarPainelCliente();
    });
}

async function efetuarLoginAdmin() {
    const email = document.getElementById('admin-email').value.trim(), senha = document.getElementById('admin-senha').value;
    if (!email || !senha) return avisar('Informe as credenciais.', 'erro');
    await comCarga('btn-admin-submit', 'Entrando…', async () => {
        const r = await api('/api/auth', { acao: 'login_admin', email, senha });
        if (!r.ok) return avisar(erroDe(r), 'erro');
        definirUsuario(r.dados.usuario); irPara('admin.html');
    });
}

async function solicitarConta() {
    const nome = document.getElementById('reg-nome').value.trim(), email = document.getElementById('reg-email').value.trim();
    const senha = document.getElementById('reg-senha').value, aceite = document.getElementById('reg-aceite').checked;
    if (!nome || !email) return avisar('Preencha nome e e-mail.', 'erro');
    if (senha.length < 10) return avisar('A senha deve ter ao menos 10 caracteres.', 'erro');
    if (!aceite) return avisar('É necessário aceitar os Termos de Uso e a Política de Privacidade.', 'erro');
    await comCarga('btn-registro-submit', 'Enviando…', async () => {
        const r = await api('/api/auth', { acao: 'registro', nome, email, senha, aceite_termos: true });
        if (r.ok) { avisar(r.dados.mensagem, 'ok'); document.getElementById('reg-senha').value = ''; alternarFormAuth('login'); }
        else avisar(erroDe(r), 'erro');
    });
}

Pronto.then(u => {
    atualizarTopoSite();
    carregarPublicidadesAtivas();
    if (u && u.mustChangePassword) abrirTrocaSenha();
});

function abrirModalTermos() {
    abrirModal('modalTermos');
    document.getElementById('btn-aceitar-termos').disabled = true;
    document.getElementById('aviso-scroll-termos').style.display = 'block';
    
    // Fallback caso a tela seja muito grande e não gere scroll
    const caixa = document.getElementById('texto-termos-scroll');
    if (caixa.scrollHeight <= caixa.clientHeight + 2) verificarScrollTermos(caixa);
}

function verificarScrollTermos(el) {
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 10) {
        document.getElementById('btn-aceitar-termos').disabled = false;
        document.getElementById('aviso-scroll-termos').style.display = 'none';
    }
}

function aceitarTermosUso() {
    document.getElementById('reg-aceite').checked = true;
    fecharModal('modalTermos');
}

// Substitua a função solicitarConta() existente por esta:
async function solicitarConta() {
    const nome = document.getElementById('reg-nome').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const cpfCnpj = document.getElementById('reg-cpf').value.replace(/\D/g, ''); // Limpa a formatação
    const senha = document.getElementById('reg-senha').value;
    const aceite = document.getElementById('reg-aceite').checked;
    
    if (!nome || !email || !cpfCnpj) return avisar('Preencha nome, CPF/CNPJ e e-mail.', 'erro');
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) return avisar('CPF ou CNPJ inválido.', 'erro');
    if (senha.length < 10) return avisar('A senha deve ter ao menos 10 caracteres.', 'erro');
    if (!aceite) return avisar('Você deve ler e aceitar os Termos de Uso (clique na caixa azul).', 'erro');
    
    await comCarga('btn-registro-submit', 'Registrando…', async () => {
        const r = await api('/api/auth', { acao: 'registro', nome, email, cpfCnpj, senha, aceite_termos: true });
        if (r.ok) { 
            avisar(r.dados.mensagem, 'ok'); 
            document.getElementById('reg-senha').value = ''; 
            document.getElementById('reg-cpf').value = ''; 
            document.getElementById('reg-aceite').checked = false;
            alternarFormAuth('login'); 
        } else avisar(erroDe(r), 'erro');
    });
}

// Exponha as novas funções
window.abrirModalTermos = abrirModalTermos;
window.verificarScrollTermos = verificarScrollTermos;
window.aceitarTermosUso = aceitarTermosUso;