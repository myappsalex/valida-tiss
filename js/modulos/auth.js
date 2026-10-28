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


function atualizarTopoSite() {
    if(!usuarioLogado) return;
    const elStatus = document.getElementById('user-status');
    const btnTop = document.getElementById('btn-login-top');
    
    if (elStatus && btnTop) {
        if (usuarioLogado.tipo === "INTERNO") {
            elStatus.innerText = `👤 ${usuarioLogado.nome} | Perfil: ${usuarioLogado.perfil}`;
            elStatus.style.color = "#dc3545"; 
            btnTop.innerText = "⚙️ Área Master";
            btnTop.onclick = () => { window.location.href = "admin.html"; };
        } else {
            elStatus.innerText = `👤 ${usuarioLogado.nome} | Saldo: ${usuarioLogado.tokensRestantes} IA`;
            elStatus.style.color = "#0056b3"; 
            btnTop.innerText = "📊 Meu Painel";	
            btnTop.onclick = () => { 
                // Proteção extra: garante que não abre admin.html acidentalmente
                if (usuarioLogado.tipo !== "INTERNO") {
                    window.location.href = "dashboard_cliente.html"; 
                }
            };
        }
    }
}

function efetuarLogout() { 
    sessionStorage.removeItem('sessaoTISS'); 
    window.location.href = "index.html"; 
}
// --- FUNÇÃO AUXILIAR DE FEEDBACK VISUAL (GAUGE) ---
function toggleLoadingButton(btnId, isLoading, originalText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        // Insere o Gauge adaptado para dentro do botão
        btn.innerHTML = `<div class="gauge-loader" style="width: 14px; height: 14px; border-width: 2px; border-top-color: white; vertical-align: middle; margin-right: 8px;"></div> Em processamento ...`;
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.innerHTML = originalText;
    }
}

async function efetuarLogin() {
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-senha').value;
    if (!email || !senha) { alert("Preencha todos os campos."); return; }

    toggleLoadingButton('btn-login-submit', true, 'Entrar no Sistema');

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
            // Se for cliente e estiver no dashboard, carrega as regras
            if (typeof carregarRegrasCliente === 'function') carregarRegrasCliente();
        } else {
            alert(`Falha no login: ${data.erro}`);
        }
    } catch (error) { 
        alert("Erro ao comunicar com o servidor."); 
    } finally {
        toggleLoadingButton('btn-login-submit', false, 'Entrar no Sistema');
    }
}

async function efetuarLoginAdmin() {
    const email = document.getElementById('admin-email').value; 
    const senha = document.getElementById('admin-senha').value;
    if (!email || !senha) { alert("Preencha as credenciais."); return; }
    
    toggleLoadingButton('btn-admin-submit', true, 'Entrar no Backoffice');

    try {
        const response = await fetch('/api/auth', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ acao: 'login_admin', email: email, senha: senha }) 
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) { 
            sessionStorage.setItem('sessaoTISS', JSON.stringify(data.usuario)); 
            window.location.href = "admin.html"; 
        } else { 
            alert(`Falha: ${data.erro}`); 
        }
    } catch (error) { 
        alert("Erro de conexão."); 
    } finally {
        toggleLoadingButton('btn-admin-submit', false, 'Entrar no Backoffice');
    }
}

async function solicitarConta() {
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const senha = document.getElementById('reg-senha').value;
    
    if (!/(?=.*[!@#$%^&*]).{8,}/.test(senha)) { alert("A senha deve ter pelo menos 8 caracteres e um caractere especial (!@#$...)."); return; }
    if (!nome || !email) { alert("Preencha todos os campos obrigatórios."); return; }

    toggleLoadingButton('btn-registro-submit', true, 'Solicitar Conta e Tokens');

    try {
        const response = await fetch('/api/auth', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'registro', nome: nome, email: email, senha: senha })
        });
        const data = await response.json();
        
        if (response.ok && data.sucesso) { 
            alert(data.mensagem); 
            alternarFormAuth('login'); 
        } else { 
            alert(`Erro no registo: ${data.erro}`); 
        }
    } catch (error) { 
        alert("Erro ao enviar o pedido de registo."); 
    } finally {
        toggleLoadingButton('btn-registro-submit', false, 'Solicitar Conta e Tokens');
    }
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

// Inicialização
        window.onload = () => {
            console.log("ValidaTISS 2.0.0 Inicializado");
			document.addEventListener('DOMContentLoaded', () => {
			// Tecla Enter no Login de Cliente
			const inputSenhaLogin = document.getElementById('login-senha');
			if (inputSenhaLogin) {
				inputSenhaLogin.addEventListener('keypress', (e) => {
					if (e.key === 'Enter') efetuarLogin();
				});
			}

			// Tecla Enter no Login Admin
			const inputSenhaAdmin = document.getElementById('admin-senha');
			if (inputSenhaAdmin) {
				inputSenhaAdmin.addEventListener('keypress', (e) => {
					if (e.key === 'Enter') efetuarLoginAdmin();
				});
			}
		});
   };