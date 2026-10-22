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
    // Pega o ID oculto (preenchido pelo sistema quando logado ou quando o Admin clica no Grid)
    const clienteId = document.getElementById('pub-cliente-id').value;
    const empresa = document.getElementById('pub-empresa').value;
    const email = document.getElementById('pub-email').value;
    const link = document.getElementById('pub-link').value;
    const tema = document.getElementById('pub-tema').value;
    const arquivoInput = document.getElementById('pub-arquivo');
	const localExibicao = document.getElementById('aval-ad-local').value;

    if(!empresa || !email || !link || !tema) {
        alert("Preencha todos os campos obrigatórios (Empresa, E-mail, Link e Tema).");
        return;
    }

    const btn = document.getElementById('btn-pub-submit');
    btn.disabled = true; 
    btn.innerHTML = `<div class="gauge-loader" style="width: 14px; height: 14px; border-width: 2px; border-top-color: white; vertical-align: middle; margin-right: 8px;"></div> Enviando...`;

    const processarEnvio = async (base64String) => {
        try {
            // Chamada REAL para a API Python gravar no Prisma (Tabela CampanhaAds)
            const response = await fetch('/api/publicidade', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    acao: 'criar',
                    usuarioId: clienteId, // Vincula o pedido ao cliente correto
                    empresa_nome: empresa, 
                    email_contato: email, 
                    link_destino: link, 
                    tema: tema, 
					localExibicao: localExibicao,
                    arquivo_base64: base64String 
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.sucesso) {
                alert(`Pedido registrado com sucesso!\nA equipe comercial avaliará a campanha e enviará um orçamento em breve.`);
                fecharModais();
                // Se o admin fez o pedido, atualiza a grid por trás
                if (typeof pesquisarContratos === "function") pesquisarContratos(); 
            } else {
                alert(`Erro ao gravar pedido: ${data.erro}`);
            }
        } catch (error) {
            alert("Erro de conexão com o servidor. O pedido não foi salvo.");
        } finally {
            btn.disabled = false; 
            btn.innerText = "Solicitar Orçamento";
        }
    };

    if (arquivoInput && arquivoInput.files.length > 0) {
        const file = arquivoInput.files[0];
        const reader = new FileReader();
        reader.onloadend = function() {
            processarEnvio(reader.result); 
        };
        reader.readAsDataURL(file);
    } else {
        processarEnvio(null); 
    }
}

// --- FLUXO DE PEDIDO DE PUBLICIDADE ---
function abrirPedidoPublicidade() {
    const sessao = JSON.parse(sessionStorage.getItem('sessaoTISS'));
    
    // 1. SE NÃO ESTIVER LOGADO -> Pede para logar/cadastrar
    if (!sessao) {
        abrirModal('modalBoasVindasPub');
        return;
    }
    
    // 2. SE ESTIVER LOGADO MAS ESTIVER NO INDEX -> Redireciona
    if (!window.location.href.includes('dashboard_cliente.html')) {
        // Envia uma variável na URL para o dashboard saber que deve abrir o modal
        window.location.href = 'dashboard_cliente.html?abrirPub=true';
        return;
    }

    // 3. SE ESTIVER LOGADO E JÁ NO DASHBOARD -> Preenche e Abre
    const elClienteId = document.getElementById('pub-cliente-id');
    const elEmpresa = document.getElementById('pub-empresa');
    const elEmail = document.getElementById('pub-email');
	const elocalExibicao = document.getElementById('aval-ad-local').value;
    
    if (elClienteId && elEmpresa && elEmail) {
        elClienteId.value = sessao.id;
        elEmpresa.value = sessao.nome;
        elEmail.value = sessao.email;
		elocalExibicao = sessao.localExibicao,
		
    }
    
    abrirModal('modalPublicidade');
}

// Interceptador global para abrir o modal automaticamente ao chegar do Index
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('abrirPub') === 'true') {
        // Pequeno delay para garantir que o HTML do dashboard carregou
        setTimeout(() => abrirPedidoPublicidade(), 500);
    }
});

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

async function carregarPublicidadesAtivas() {
    try {
        const response = await fetch('/api/campanhas');
        if (!response.ok) return;
        
        const anuncios = await response.json();
        
        // Filtra os anúncios por local
        const adCabecalho = anuncios.find(a => a.local === 'CABECALHO');
        const adLateral = anuncios.find(a => a.local === 'LATERAL');
        
        // Renderiza no Cabeçalho se houver campanha ativa
        if (adCabecalho) {
            const divCabecalho = document.getElementById('ads_cabecalho');
            divCabecalho.innerHTML = `
                <h3 style="margin: 0;">🚀 ${adCabecalho.titulo}</h3>
                <span class="pulse-text">${adCabecalho.texto}</span>
            `;
            // Se tiver link, altera o evento de clique (se for 'modal', mantém o original)
            if (adCabecalho.link && adCabecalho.link !== 'modal') {
                divCabecalho.onclick = () => window.open(adCabecalho.link, '_blank');
            }
        }

        // Renderiza na Lateral se houver campanha ativa
        if (adLateral) {
            const divLateral = document.getElementById('ads_lateral');
            divLateral.innerHTML = `
                <h4>${adLateral.titulo}</h4>
                <p>${adLateral.texto}</p>
                <div class="pulse-text" style="background: none; color: #ffc107; padding: 0; margin-bottom: 10px; font-size: 30px;">📢</div>
                <span class="btn-ad">Acessar</span>
            `;
            if (adLateral.link && adLateral.link !== 'modal') {
                divLateral.onclick = () => window.open(adLateral.link, '_blank');
            }
        }
    } catch (error) {
        console.error("Erro ao carregar publicidades:", error);
    }
}

// Executa a busca assim que a página terminar de carregar
document.addEventListener('DOMContentLoaded', carregarPublicidadesAtivas);