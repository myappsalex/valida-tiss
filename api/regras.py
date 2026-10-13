// --- DASHBOARD DO CLIENTE: REGRAS CUSTOMIZADAS ---
function abrirModalNovaRegra() {
    abrirModal('modalNovaRegra');
}

async function carregarRegrasCliente() {
    if (!usuarioLogado || usuarioLogado.tipo !== 'CLIENTE') return;
    
    const tbody = document.getElementById('lista-regras-body');
    if(!tbody) return; // Se não estiver na página dashboard, ignora
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">⏳ A carregar regras...</td></tr>';
    
    try {
        const response = await fetch(`/api/regras?clienteId=${usuarioLogado.id}`);
        const data = await response.json();
        
        if (response.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma regra configurada. Crie a sua primeira regra!</td></tr>';
                return;
            }
            
            data.forEach(r => {
                const corBadge = r.acao === 'BLOQUEIO' ? '#dc3545' : '#f39c12';
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${r.nomeRegra}</strong></td>
                        <td>${r.tipoGuia} <br><span style="font-size: 11px; color: #666;">Campo: ${r.campoValidado}</span></td>
                        <td>${r.condicao} <strong>${r.valorEsperado}</strong></td>
                        <td><span style="background: ${corBadge}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${r.acao}</span></td>
                    </tr>
                `;
            });
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar regras.</td></tr>';
    }
}

async function salvarNovaRegra() {
    const dados = {
        clienteId: usuarioLogado.id,
        nomeRegra: document.getElementById('regra-nome').value,
        tipoGuia: document.getElementById('regra-tipo').value,
        campoValidado: document.getElementById('regra-campo').value,
        condicao: document.getElementById('regra-condicao').value,
        valorEsperado: document.getElementById('regra-valor').value,
        acao: document.getElementById('regra-acao').value,
        mensagemErro: document.getElementById('regra-mensagem').value
    };

    if(!dados.nomeRegra || !dados.valorEsperado || !dados.mensagemErro) {
        alert("Preencha todos os campos obrigatórios!");
        return;
    }

    try {
        const response = await fetch('/api/regras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const resultado = await response.json();
        
        if (response.ok && resultado.sucesso) {
            alert("Regra criada com sucesso!");
            fecharModal('modalNovaRegra');
            carregarRegrasCliente(); // Recarrega a tabela visualmente
        } else {
            alert(`Erro: ${resultado.erro}`);
        }
    } catch (e) {
        alert("Erro de comunicação com o servidor.");
    }
}