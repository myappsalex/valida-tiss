// js/modulos/ui.js
	
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

function abrirPedidoPublicidade(modo = 'LOGADO') {
    const sessao = JSON.parse(sessionStorage.getItem('sessaoTISS'));
    
    // Elementos do formulário
    const elClienteId = document.getElementById('pub-cliente-id');
    const elEmpresa = document.getElementById('pub-empresa');
    const elEmail = document.getElementById('pub-email');
    const elLocalExibicao = document.getElementById('aval-ad-local');
    
    // Limpa os campos por padrão
    if(elEmpresa) { elEmpresa.value = ''; elEmpresa.readOnly = false; elEmpresa.style.background = '#fff'; }
    if(elEmail) { elEmail.value = ''; elEmail.readOnly = false; elEmail.style.background = '#fff'; }
    if(elClienteId) elClienteId.value = 'GUEST'; // Flag para Anunciante Avulso

    // 1. SE NÃO ESTIVER LOGADO E NÃO ESCOLHEU O MODO -> Mostra o menu de opções
    if (!sessao && modo === 'LOGADO') {
        abrirModal('modalBoasVindasPub');
        return;
    }
    
    // 2. SE ESTIVER LOGADO MAS ESTIVER NO INDEX -> Redireciona para o Painel
    if (sessao && !window.location.href.includes('dashboard_cliente.html')) {
        window.location.href = 'dashboard_cliente.html?abrirPub=true';
        return;
    }

    // 3. PREENCHIMENTO DE DADOS (Logado vs Visitante)
    if (sessao && modo === 'LOGADO') {
        if (elClienteId && elEmpresa && elEmail) {
            elClienteId.value = sessao.id;
            elEmpresa.value = sessao.nome;
            elEmpresa.readOnly = true; 
            elEmpresa.style.background = '#f4f7f6';
            
            elEmail.value = sessao.email;
            elEmail.readOnly = true;
            elEmail.style.background = '#f4f7f6';
            
            if (elLocalExibicao && sessao.localExibicao) {
                elLocalExibicao.value = sessao.localExibicao;
            }
        }
    }
    
    // Fecha o modal de boas vindas e abre o formulário
    fecharModal('modalBoasVindasPub');
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

// --- SISTEMA DE ROTAÇÃO DE PUBLICIDADE (CARROSSEL HÍBRIDO) ---

// 1. Definimos o "Anúncio Padrão" que chama o Modal como o primeiro item da fila
let adsCabecalho = [
    {
        titulo: "🚀 O seu software médico visto por milhares de faturistas!",
        texto: "Clique aqui e anuncie no portal",
        link: "modal",
        isDefault: true
    }
];

let adsLateral = [
    {
        titulo: "Anuncie Aqui",
        texto: "O seu software visto por quem decide.",
        link: "modal",
        isDefault: true
    }
];

let idxCabecalho = 0;
let idxLateral = 0;

async function iniciarRotacaoPublicidade() {
    // 2. Busca as campanhas ativas no banco de dados
    try {
        const response = await fetch('/api/campanhas');
        if (response.ok) {
            const anunciosAtivos = await response.json();
            
            // Adiciona os anúncios pagos à fila
            anunciosAtivos.forEach(ad => {
                if (ad.local === 'CABECALHO' || ad.local === 'TODOS') adsCabecalho.push(ad);
                if (ad.local === 'LATERAL' || ad.local === 'TODOS') adsLateral.push(ad);
            });
        }
    } catch (error) {
        console.error("Erro ao buscar campanhas pagas. Mantendo apenas anúncios padrão.");
    }

    // 3. Motor de Renderização do Cabeçalho
    const renderCabecalho = () => {
        const div = document.getElementById('ads_cabecalho');
        if (!div) return;
        const ad = adsCabecalho[idxCabecalho];
        
        div.style.transition = "opacity 0.5s ease-in-out";
        div.innerHTML = `
            <h3 style="margin: 0;">${ad.titulo}</h3>
            <span class="pulse-text">${ad.texto}</span>
        `;
        
        // Se for anúncio pago, aplica o gradiente. Se for padrão, remove para usar o CSS original
        div.style.background = ad.cor ? ad.cor : ""; 

        div.onclick = () => {
            if (ad.link === 'modal') abrirPedidoPublicidade('VISITANTE');
            else window.open(ad.link.startsWith('http') ? ad.link : `https://${ad.link}`, '_blank');
        };
        
        idxCabecalho = (idxCabecalho + 1) % adsCabecalho.length;
    };

    // 4. Motor de Renderização da Lateral
    const renderLateral = () => {
        const div = document.getElementById('ads_lateral');
        if (!div) return;
        const ad = adsLateral[idxLateral];

        div.style.transition = "opacity 0.5s ease-in-out";
        div.innerHTML = `
            <h4>${ad.titulo}</h4>
            <p>${ad.texto}</p>
            <div class="pulse-text" style="background: none; color: #ffc107; padding: 0; margin-bottom: 10px; font-size: 30px;">📢</div>
            <span class="btn-ad">${ad.isDefault ? 'Ver Formatos' : 'Acessar'}</span>
        `;

        div.style.background = ad.cor ? ad.cor : ""; 

        div.onclick = () => {
            if (ad.link === 'modal') abrirPedidoPublicidade('VISITANTE');
            else window.open(ad.link.startsWith('http') ? ad.link : `https://${ad.link}`, '_blank');
        };

        idxLateral = (idxLateral + 1) % adsLateral.length;
    };

    // 5. Arranque Imediato
    renderCabecalho();
    renderLateral();

    // 6. Rotação (Apenas se houver anúncios pagos além do padrão. A cada 6 segundos)
    if (adsCabecalho.length > 1) setInterval(renderCabecalho, 6000);
    if (adsLateral.length > 1) setInterval(renderLateral, 6000);
}

// Inicia a rotação assim que a página terminar de carregar
document.addEventListener('DOMContentLoaded', iniciarRotacaoPublicidade);

// --- ATALHO GLOBAL DO TECLADO (ENTER PARA LOGIN) ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const focoAtual = document.activeElement.id;
        // Se o foco estiver nos campos do modal de cliente
        if (focoAtual === 'login-senha' || focoAtual === 'login-email') {
            if (typeof efetuarLogin === 'function') efetuarLogin();
        } 
        // Se o foco estiver nos campos do modal de admin
        else if (focoAtual === 'admin-senha' || focoAtual === 'admin-email') {
            if (typeof efetuarLoginAdmin === 'function') efetuarLoginAdmin();
        }
    }
});


// --- PESQUISA TUSS COM PROTEÇÃO DE BOTÕES ---
async function pesquisarDominiosTUSS() {
    const cod = document.getElementById('filtro-codigo-tuss').value;
    const termo = document.getElementById('filtro-termo-tuss').value;
    const tbody = document.getElementById('tbody-dominios');
    
    if (!cod && termo.length < 3) {
        alert("Digite um código ou pelo menos 3 letras da descrição para pesquisar.");
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">⏳ A pesquisar...</td></tr>';
    
    // VERIFICAÇÃO DE SEGURANÇA: Lê a sessão para saber se é Admin
    const sessao = JSON.parse(sessionStorage.getItem('sessaoTISS'));
    const isInterno = sessao && sessao.tipo === "INTERNO";

    try {
        const res = await fetch(`/api/dominio_tuss?codigo=${cod}&termo=${termo}`);
        const data = await res.json();
        
        if (res.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) { 
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Sem resultados.</td></tr>'; 
                return; 
            }
            data.forEach(d => {
                const termoEscapado = d.termo.replace(/'/g, "");
                const anvisa = d.registroAnvisa || '-';
                const fabricante = d.fabricante || '-';
                const modelo = d.apresentacaoModelo || '-';
                const risco = d.classeRisco || '';

                // CONTROLE DE ACESSO VISUAL AOS BOTÕES
                let botoesAcao = '-';
                if (isInterno) {
                    botoesAcao = `
                        <button class="btn btn-warning" style="padding: 4px; font-size: 10px;" onclick="prepararEdicaoDominio('${d.id}', '${d.codigoTabela}', '${d.codigoTermo}', '${termoEscapado}', '${anvisa}', '${fabricante}', '${modelo}', '${risco}')">✏️</button>
                        <button class="btn btn-danger" style="padding: 4px; font-size: 10px;" onclick="excluirDominioTUSS('${d.id}')">🗑️</button>
                    `;
                }

                tbody.innerHTML += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td>${d.codigoTabela}</td>
                        <td><strong>${d.codigoTermo}</strong></td>
                        <td>${d.termo}</td>
                        <td>${modelo}</td>
                        <td>${fabricante}</td>
                        <td>${anvisa}</td>
                        <td>${botoesAcao}</td>
                    </tr>
                `;
            });		
        }
    } catch(e) { 
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Erro de rede.</td></tr>'; 
    }
}

// Executa a busca assim que a página terminar de carregar
document.addEventListener('DOMContentLoaded', carregarPublicidadesAtivas);