
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