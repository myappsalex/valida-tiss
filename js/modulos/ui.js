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
    const tema = document.getElementById('pub-tema').value;
    const arquivoInput = document.getElementById('pub-arquivo');

    if(!empresa || !email || !link || !tema) {
        alert("Preencha todos os campos obrigatórios (Empresa, E-mail, Link e Tema).");
        return;
    }

    const btn = document.getElementById('btn-pub-submit');
    btn.disabled = true; 
    btn.innerHTML = `<div class="gauge-loader" style="width: 14px; height: 14px; border-width: 2px; border-top-color: white; vertical-align: middle; margin-right: 8px;"></div> A enviar...`;

    const processarEnvio = async (base64String) => {
        try {
            // Futura chamada para /api/publicidade
            /*
            const response = await fetch('/api/publicidade', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empresa, email, link, tema, arquivo_base64: base64String })
            });
            */
            setTimeout(() => {
                alert(`Pedido registado com sucesso!\nA nossa equipa comercial avaliará o seu pedido e enviará um orçamento.`);
                fecharModais();
                btn.disabled = false; 
                btn.innerText = "Solicitar Orçamento";
            }, 1200);
        } catch (error) {
            alert("Erro ao enviar pedido.");
            btn.disabled = false; btn.innerText = "Solicitar Orçamento";
        }
    };

    if (arquivoInput.files.length > 0) {
        const file = arquivoInput.files[0];
        const reader = new FileReader();
        reader.onloadend = function() {
            processarEnvio(reader.result); // Passa a string Base64
        };
        reader.readAsDataURL(file);
    } else {
        processarEnvio(null); // Cliente não enviou arte
    }
}

// Substitua as chamadas onclick="abrirModal('modalPublicidade')" nos banners por onclick="abrirPedidoPublicidade()"
function abrirPedidoPublicidade() {
    if (!usuarioLogado) {
        alert("Para solicitar um orçamento e acompanhar o pedido, precisa de ter uma conta.");
        abrirModal('modalAuth');
        return;
    }
    
    // Preenche automaticamente com os dados do cliente
    document.getElementById('pub-cliente-id').value = usuarioLogado.id;
    document.getElementById('pub-empresa').value = usuarioLogado.nome;
    document.getElementById('pub-email').value = usuarioLogado.email;
    
    abrirModal('modalPublicidade');
}

// --- FUNÇÕES DE PAGAMENTO PIX ---
function abrirPagamentoPIX(campanhaId, valor) {
    const display = document.getElementById('pix-valor-display');
    if (display) display.innerText = `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
    
    // No futuro: chamada fetch('/api/gerar_pix') aqui
    abrirModal('modalPagarAds');
}

function copiarPix() {
    const copyText = document.getElementById("pix-copia-cola");
    if (!copyText) return;
    copyText.select();
    document.execCommand("copy");
    alert("Código PIX copiado com sucesso!");
}