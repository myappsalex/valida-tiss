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

window.aceitarTermosUso = function() {
    const checkbox = document.getElementById('reg-aceite');
    if (checkbox) {
        checkbox.checked = true;
    }
    fecharModal('modalTermos');
    
    // Devolve o foco visual para o botão principal
    const btnReg = document.getElementById('btn-registro-submit');
    if (btnReg) btnReg.focus();
};


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
        const corpo = { acao: 'registro', nome, email, cpfCnpj, senha, aceite_termos: true };
        const r = await api('/api/auth', corpo);
        
        if (r.ok) {
            avisar('Conta criada com sucesso! Redirecionando...', 'sucesso');
            // Força o login automático com as credenciais recém criadas
            document.getElementById('login-email').value = email;
            document.getElementById('login-senha').value = senha;
            
            // Limpa o formulário de registro
            document.getElementById('reg-senha').value = ''; 
            document.getElementById('reg-cpf').value = ''; 
            document.getElementById('reg-aceite').checked = false;

            await efetuarLogin();
            
            // Após o login, abre o modal de planos para o novo usuário
            fecharModais();
            abrirModal('modalEscolherPlano');
        } else {
            avisar(erroDe(r), 'erro');
        }
    });
}

// Função para popular a tela do cliente
// Cache global para a tabela de preços
window._precosVigentes = {};

// Carrega o valor inicial quando o modal abre ou o admin troca o Select
async function adminCarregarPrecoPlano() {
    if (Object.keys(window._precosVigentes || {}).length === 0) {
        const r = await api('/api/gestao_usuarios', { acao: 'listar_planos_vigentes' });
        // CORREÇÃO: Captura a sub-camada 'dados' do JSON
        if (r.ok) window._precosVigentes = r.dados.dados || r.dados;
    }
    const nome = document.getElementById('admin-plano-select').value;
    const inputValor = document.getElementById('admin-plano-valor');
    
    // Seta o valor (agora o window._precosVigentes tem os valores reais)
    const valorAtual = (window._precosVigentes && window._precosVigentes[nome]) ? window._precosVigentes[nome] : 0;
    inputValor.value = valorAtual.toFixed(2);
    inputValor.setAttribute('data-original', inputValor.value);
    
    // Oculta vigência por padrão
    document.getElementById('bloco-vigencia').style.display = 'none';
    document.getElementById('admin-plano-vigencia').value = '';
}

// Vincula o carregamento dos preços à abertura do modal de Planos
const openModalAntigo = window.abrirModal;
window.abrirModal = function(id) {
    if (openModalAntigo) openModalAntigo(id);
    if (id === 'modalEscolherPlano') {
        carregarPrecosPlanos();
    }
};

// Exponha as novas funções
window.abrirModalTermos = abrirModalTermos;
window.verificarScrollTermos = verificarScrollTermos;
window.aceitarTermosUso = aceitarTermosUso;