// js/modulos/ui.js

 //       function abrirModal(id) { document.getElementById(id).style.display = 'flex'; }
 //       function fecharModal(id) { document.getElementById(id).style.display = 'none'; }
 //       function efetuarLogout() { sessionStorage.removeItem('sessaoTISS'); window.location.href = "index.html"; }
		
// --- GESTÃO DE MODAIS ---
function abrirModal(idModal) { 
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'flex'; 
}

function fecharModais() { 
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none'); 
}

function fecharModal(idModal) { 
    const alvo = idModal || 'modalPremium'; 
    const modal = document.getElementById(alvo); 
    if (modal) modal.style.display = 'none'; 
}

// --- NAVEGAÇÃO DO WIZARD (Movido do validador.js) ---
function alterarPasso(passo) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    const step = document.getElementById(`step-${passo}`);
    if (step) step.classList.add('active');
}

function reiniciarWizard() {
    document.getElementById('xmlInput').value = '';
    document.getElementById('resultado').innerHTML = '';
    document.getElementById('btnExportar').style.display = 'none';
    if (typeof xmlDocAtual !== 'undefined') xmlDocAtual = null; // Limpa a variável global do validador
    alterarPasso(1);
}

// --- UX / ALERTAS VISUAIS ---
function solicitarCompra(tipo, pacote) { 
    alert(`Redirecionando para o Gateway de Pagamento...\nItem: ${pacote}`); 
    fecharModais(); 
}

function redirecionarCheckout() { 
    alert("Redirecionando para página de pagamento..."); 
}