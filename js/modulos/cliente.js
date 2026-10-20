
async function carregarRegrasCliente() {
    if (!usuarioLogado) return; 
    const tbody = document.getElementById('lista-regras-body'); if(!tbody) return;
    try {
        const response = await fetch(`/api/regras?clienteId=${usuarioLogado.id}`); const data = await response.json();
        if (response.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) { tbody.innerHTML = '<tr><td colspan="5">Nenhuma regra.</td></tr>'; return; }
            data.forEach(r => {
                const argsEdit = `'${r.id}', '${r.nomeRegra.replace(/'/g,"")}', '${r.tipoGuia}', '${r.campoValidado}', '${r.condicao}', '${r.valorEsperado}', '${r.acao}', '${r.mensagemErro.replace(/'/g,"")}'`;
                tbody.innerHTML += `<tr><td><strong>${r.nomeRegra}</strong></td><td>${r.tipoGuia}</td><td>${r.condicao} <strong>${r.valorEsperado}</strong></td><td>${r.acao}</td><td><button onclick="abrirModalEdicao(${argsEdit})">Editar</button> <button onclick="excluirRegra('${r.id}')">Excluir</button></td></tr>`;
            });
        }
    } catch (e) { console.error(e); }
}

async function salvarRegra() {
    const dados = { 
        id: document.getElementById('regra-id').value, 
        acao_req: document.getElementById('regra-id').value ? 'editar' : 'criar', 
        clienteId: usuarioLogado.id, 
        nomeRegra: document.getElementById('regra-nome').value, 
        tipoGuia: document.getElementById('regra-tipo').value, 
        campoValidado: document.getElementById('regra-campo').value, 
        condicao: document.getElementById('regra-condicao').value, 
        valorEsperado: document.getElementById('regra-valor').value, 
        acao: document.getElementById('regra-acao').value, 
        mensagemErro: document.getElementById('regra-mensagem').value 
    };
    if(!dados.nomeRegra || !dados.valorEsperado) return;
    try { 
        const response = await fetch('/api/regras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) }); 
        if(response.ok) { fecharModal('modalNovaRegra'); carregarRegrasCliente(); } 
    } catch(e){}
}

async function excluirRegra(idRegra) {
    if(!confirm("Tem a certeza?")) return;
    try { 
        const response = await fetch('/api/regras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao_req: 'excluir', id: idRegra }) }); 
        if(response.ok) carregarRegrasCliente(); 
    } catch(e){}
}

window.addEventListener('DOMContentLoaded', () => { 
    const sessao = JSON.parse(sessionStorage.getItem('sessaoTISS')); 
    if (sessao) { usuarioLogado = sessao; carregarRegrasCliente(); } 
});

document.addEventListener('DOMContentLoaded', () => {
    const s = JSON.parse(sessionStorage.getItem('sessaoTISS'));
    if(s) {
        const elNome = document.getElementById('nome-empresa-painel');
        if(elNome) elNome.innerText = s.nome;
        
        // Os IDs devem existir no HTML para receberem os dados
        const elDashTokens = document.getElementById('dash-tokens');
        if(elDashTokens) elDashTokens.innerText = s.tokensRestantes || 0;
		carregarMinhasCampanhas();
        
        const elPlano = document.getElementById('dash-plano');
        if(elPlano) elPlano.innerText = s.plano || 'FREEMIUM';
        
        const statusEl = document.getElementById('dash-status');
        if(statusEl) {
            const statusPgto = s.statusPagamento || 'ATIVO';
            statusEl.innerText = statusPgto;
            if (statusPgto === 'ATIVO') {
                statusEl.style.backgroundColor = '#d4edda'; statusEl.style.color = '#155724';
            } else {
                statusEl.style.backgroundColor = '#f8d7da'; statusEl.style.color = '#721c24';
            }
        }
    }
});

// --- GESTÃO DE CAMPANHAS DO LADO DO CLIENTE ---
async function carregarMinhasCampanhas() {
    const sessao = JSON.parse(sessionStorage.getItem('sessaoTISS'));
    if (!sessao) return;

    const tbody = document.getElementById('lista-minhas-campanhas');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;"><div class="gauge-loader"></div> Buscando suas campanhas...</td></tr>';
    
    try {
        const response = await fetch(`/api/publicidade?acao=listar_minhas&clienteId=${sessao.id}`);
        const data = await response.json();
        
        tbody.innerHTML = '';
        if (!response.ok || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">Você ainda não solicitou nenhuma campanha de publicidade.</td></tr>';
            return;
        }

        data.forEach(ad => {
            let corStatus = '#6c757d'; 
            if (ad.status === 'ATIVO') corStatus = '#28a745';
            else if (ad.status === 'AGUARDANDO_PAGAMENTO') corStatus = '#f39c12';
            else if (ad.status === 'CANCELADO') corStatus = '#dc3545';

            let textoValor = ad.valorOrcamento > 0 ? `R$ ${ad.valorOrcamento.toFixed(2)}` : 'Em análise';
            let btnAcao = '';

            // Parâmetros para o modal de detalhes do cliente
            const params = `'${ad.id}', '${ad.tema.replace(/'/g, "\\'")}', '${(ad.observacaoAdmin || "").replace(/'/g, "\\'")}', ${ad.valorOrcamento || 0}, '${ad.status}'`;

            if (ad.status === 'AGUARDANDO_PAGAMENTO') {
                btnAcao = `<button class="btn btn-success" style="padding: 5px; font-size:11px;" onclick="abrirAcompanhamentoCliente(${params})">Ver Orçamento</button>`;
            } else {
                btnAcao = `<button class="btn" style="background:#17a2b8; color:white; padding: 5px; font-size:11px;" onclick="abrirAcompanhamentoCliente(${params})">Detalhes</button>`;
            }

            tbody.innerHTML += `
                <tr>
                    <td><strong>${ad.tema}</strong></td>
                    <td><span class="badge" style="background:${corStatus};">${ad.status}</span></td>
                    <td><span style="font-size: 12px; color: #666;">${textoValor}</span></td>
                    <td>${btnAcao}</td>
                </tr>
            `;
        });
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro ao consultar suas campanhas.</td></tr>';
    }
}

function abrirAcompanhamentoCliente(id, tema, obsAdmin, valor, status) {
    document.getElementById('acom-cli-tema').value = tema;
    document.getElementById('acom-cli-obs').innerText = obsAdmin || "O administrador ainda não enviou observações.";
    document.getElementById('acom-cli-valor').value = valor > 0 ? `R$ ${valor.toFixed(2)}` : "Aguardando definição";
    
    // Esconde botões de ação se não for status de orçamento aguardando
    const btnAprovar = document.getElementById('btn-aprovar-orc');
    const btnCancelar = document.getElementById('btn-cancelar-orc'); // Garanta que seu botão cancelar no HTML tem esse ID
    
    if (status === 'AGUARDANDO_PAGAMENTO') {
        btnAprovar.style.display = 'inline-block';
        if(btnCancelar) btnCancelar.style.display = 'inline-block';
        
        // Configura o botão para acionar o PIX
        btnAprovar.onclick = function() {
            responderOrcamentoCliente(id, 'APROVADO_PIX', valor);
        };
    } else {
        btnAprovar.style.display = 'none';
        if(btnCancelar) btnCancelar.style.display = 'none';
    }
    
    abrirModal('modalAcompanharAdCliente');
}

async function responderOrcamentoCliente(id, decisao, valor) {
    // Atualiza status no banco
    try {
        const payload = { acao: 'resposta_cliente', id: id, status: decisao === 'APROVADO_PIX' ? 'AGUARDANDO_PAGAMENTO' : 'CANCELADO' };
        await fetch('/api/publicidade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        
        fecharModal('modalAcompanharAdCliente');
        
        if (decisao === 'APROVADO_PIX') {
            abrirPagamentoPIX(id, valor); // Chama a tela do QRCode
        } else {
            alert("Pedido cancelado com sucesso.");
            carregarMinhasCampanhas();
        }
    } catch(e) { alert("Erro de conexão."); }
}