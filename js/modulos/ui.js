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

function mostrarGlosaModal(textoCodificado) {
    document.getElementById('texto-glosa-item').innerHTML = decodeURIComponent(textoCodificado);
    abrirModal('modalGlosaItem');
}

async function enviarPedidoPub() {
    const empresa = document.getElementById('pub-empresa').value;
    const email = document.getElementById('pub-email').value;
    const link = document.getElementById('pub-link').value;
    const arquivoInput = document.getElementById('pub-arquivo');

    if(!empresa || !email || !link || arquivoInput.files.length === 0) {
        alert("Preencha todos os campos e anexe o ficheiro do banner.");
        return;
    }

    const btn = document.getElementById('btn-pub-submit');
    btn.disabled = true; 
    btn.innerHTML = `<div class="gauge-loader" style="width: 14px; height: 14px; border-width: 2px; border-top-color: white; vertical-align: middle; margin-right: 8px;"></div> A enviar...`;

    // No futuro, aqui faremos um formData.append('arquivo', arquivoInput.files[0]) para enviar ao Python
    setTimeout(() => {
        alert(`Pedido registado com sucesso!\nA nossa equipa comercial entrará em contacto com ${empresa} através do e-mail ${email} com o orçamento e PIX de ativação.`);
        fecharModais();
        btn.disabled = false; 
        btn.innerText = "Submeter Pedido de Avaliação";
    }, 1200);
}