// js/modulos/auth.js

// Variável Global Única para o utilizador
let usuarioLogado = null;

function alternarFormAuth(tipo) {
    document.getElementById('form-login').style.display = tipo === 'login' ? 'block' : 'none';
    document.getElementById('form-registro').style.display = tipo === 'registro' ? 'block' : 'none';
}

function fecharModalAuth() { 
    const modal = document.getElementById('modalAuth');
    if (modal) modal.style.display = 'none'; 
}

async function efetuarLogin() {
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-senha').value;
    if (!email || !senha) { alert("Preencha todos os campos."); return; }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'login', email: email, senha: senha })
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) {
            usuarioLogado = data.usuario; 
            sessionStorage.setItem('sessaoTISS', JSON.stringify(usuarioLogado));
            fecharModalAuth();
            atualizarTopoSite();
            alert(`Bem-vindo, ${usuarioLogado.nome}!`);
            
            // Se for cliente e estiver no dashboard, carrega as regras
            if (typeof carregarRegrasCliente === 'function') carregarRegrasCliente();
        } else {
            alert(`Falha no login: ${data.erro}`);
        }
    } catch (error) { alert("Erro ao comunicar com o servidor."); }
}

async function efetuarLoginAdmin() {
    const email = document.getElementById('admin-email').value; 
    const senha = document.getElementById('admin-senha').value;
    if (!email || !senha) { alert("Preencha as credenciais."); return; }
    
    try {
        const response = await fetch('/api/auth', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ acao: 'login_admin', email: email, senha: senha }) 
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) { 
            sessionStorage.setItem('sessaoTISS', JSON.stringify(data.usuario)); 
            window.location.href = "admin.html"; 
        } else { alert(`Falha: ${data.erro}`); }
    } catch (error) { alert("Erro de conexão."); }
}

function atualizarTopoSite() {
    if(!usuarioLogado) return;
    const elStatus = document.getElementById('user-status');
    const btnTop = document.getElementById('btn-login-top');
    
    if (elStatus && btnTop) {
        if (usuarioLogado.tipo === "INTERNO") {
            elStatus.innerText = `👤 ${usuarioLogado.nome} | Perfil: ${usuarioLogado.perfil}`;
            elStatus.style.color = "#dc3545"; 
        } else {
            elStatus.innerText = `👤 ${usuarioLogado.nome} | Saldo: ${usuarioLogado.tokensRestantes} IA`;
            elStatus.style.color = "#0056b3"; 
        }
        btnTop.innerText = usuarioLogado.tipo === "INTERNO" ? "⚙️ Área Master" : "📊 Meu Painel";	
        btnTop.onclick = () => { window.location.href = usuarioLogado.tipo === "INTERNO" ? "admin.html" : "dashboard_cliente.html"; };
    }
}

function efetuarLogout() { 
    sessionStorage.removeItem('sessaoTISS'); 
    window.location.href = "index.html"; 
}

async function solicitarConta() {
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const senha = document.getElementById('reg-senha').value;
    
    if (!/(?=.*[!@#$%^&*]).{8,}/.test(senha)) { alert("A palavra-passe deve ter pelo menos 8 caracteres e um caractere especial (!@#$...)."); return; }
    if (!nome || !email) { alert("Preencha todos os campos obrigatórios."); return; }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'registro', nome: nome, email: email, senha: senha })
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) { alert(data.mensagem); alternarFormAuth('login'); } 
        else { alert(`Erro no registo: ${data.erro}`); }
    } catch (error) { alert("Erro ao enviar o pedido de registo."); }
}

// --- INICIALIZAÇÃO GLOBAL ---
window.addEventListener('DOMContentLoaded', () => {
    const sessaoSalva = sessionStorage.getItem('sessaoTISS');
    if (sessaoSalva) { 
        usuarioLogado = JSON.parse(sessaoSalva); 
        atualizarTopoSite(); 
    }
    if(typeof iniciarRotacaoPublicidade === 'function') iniciarRotacaoPublicidade();
});