// js/modulos/admin.js
async function processarCargaTUSS() {
    // Lógica de upload do CSV
}

async function pesquisarDominiosTUSS() {
    // Lógica de consulta de domínios
}

// Feedback imediato assim que o utilizador escolhe o ficheiro (mesmo antes de clicar no botão)
function verificarArquivoSelecionado() {
    const fileInput = document.getElementById('arquivo-csv-tuss');
    const divResultado = document.getElementById('resultado-carga');
    
    if (fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        const fileSize = (fileInput.files[0].size / 1024).toFixed(1); // Tamanho em KB
        divResultado.innerHTML = `<span style="color: #17a2b8;">📁 Arquivo preparado: <strong>${fileName}</strong> (${fileSize} KB). Pronto para upload.</span>`;
    } else {
        divResultado.innerHTML = "";
    }
}

async function processarCargaTUSS() {
    const tabela = document.getElementById('tabela-tuss-select').value;
    const fileInput = document.getElementById('arquivo-csv-tuss');
    const divResultado = document.getElementById('resultado-carga');
    const btnUpload = document.getElementById('btn-upload-tuss');
    
    if (fileInput.files.length === 0) {
        divResultado.innerHTML = '<span style="color: red;">❌ Por favor, selecione um ficheiro CSV primeiro.</span>';
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    
    // Bloqueia o botão e mostra o Gauge/Spinner de carregamento
    btnUpload.disabled = true;
    btnUpload.style.opacity = "0.7";
    btnUpload.innerHTML = '<div class="gauge-loader"></div> <span>Processando...</span>';
    divResultado.innerHTML = '<div class="gauge-loader"></div> <span style="color: #0056b3;">Lendo arquivo e enviando para a base de dados. Este processo pode demorar alguns segundos...</span>';

    // O FileReader é assíncrono, não vai travar a interface visual
    reader.onload = async function(e) {
        const conteudoCSV = e.target.result;
        
        try {
            const response = await fetch('/api/carga_tuss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabela: tabela, csv_data: conteudoCSV })
            });
            const data = await response.json();
            
            if (response.ok && data.sucesso) {
                divResultado.innerHTML = `<span style="color: green;">✅ Sucesso! ${data.mensagem}</span>`;
                fileInput.value = ""; // Limpa o campo
            } else {
                divResultado.innerHTML = `<span style="color: red;">❌ Erro na importação: ${data.erro}</span>`;
            }
        } catch (error) {
            divResultado.innerHTML = `<span style="color: red;">❌ Erro de comunicação com o servidor. A API demorou muito a responder ou falhou.</span>`;
        } finally {
            // Devolve o botão ao estado original
            btnUpload.disabled = false;
            btnUpload.style.opacity = "1";
            btnUpload.innerHTML = '<span>Fazer Upload</span>';
        }
    };
    
    // Inicia a leitura do arquivo em background
    reader.readAsText(file, 'UTF-8');
}

// --- FUNÇÕES DE ADMINISTRAÇÃO E REGRAS ---
let filaAnuncios = []; 
let anuncioAtual = 0;
async function iniciarRotacaoPublicidade() {
    const bannersCabecalho = document.querySelectorAll('.ad-banner-animated');
    const bannersRodape = document.querySelectorAll('.ad-banner-animated-rodape');
    if (bannersCabecalho.length === 0 && bannersRodape.length === 0) return;
    try { 
        const response = await fetch('/api/campanhas'); 
        if (response.ok) { filaAnuncios = await response.json(); } 
    } catch (e) { console.log("A carregar anúncios locais."); }
    if (filaAnuncios.length === 0) { 
        filaAnuncios = [ { titulo: "🚀 Software Médico", texto: "Anuncie no portal", link: "modal", cor: "linear-gradient(-45deg, #ee7752, #e73c7e)", local: "TODOS" } ]; 
    }
    setInterval(() => {
        if(filaAnuncios.length === 0) return;
        anuncioAtual = (anuncioAtual + 1) % filaAnuncios.length; 
        const ad = filaAnuncios[anuncioAtual];
        const htmlConteudo = `<h3 style="margin: 0; color: white;">${ad.titulo}</h3><span class="pulse-text" style="color: #333; margin-top: 5px;">${ad.texto}</span>`;
        const acaoClique = () => { ad.link === "modal" ? abrirModal('modalPublicidade') : window.open(ad.link, '_blank'); };
        if (ad.local === "CABECALHO" || ad.local === "TODOS") { bannersCabecalho.forEach(b => { b.style.background = ad.cor; b.innerHTML = htmlConteudo; b.onclick = acaoClique; }); }
        if (ad.local === "RODAPE" || ad.local === "TODOS") { bannersRodape.forEach(b => { b.style.background = ad.cor; b.innerHTML = htmlConteudo; b.onclick = acaoClique; }); }
    }, 6000); 
}


// --- CORREÇÃO DA GESTÃO IAM ---
function abrirModalGestaoAcessos() {
    abrirModal('modalGestaoAcessos');
    if (typeof carregarListaUsuarios === "function") {
        carregarListaUsuarios(); 
    }
}

// --- FUNÇÕES DE CONSULTA E EDIÇÃO DE DOMÍNIOS TUSS ---
async function pesquisarDominiosTUSS() {
    const cod = document.getElementById('filtro-codigo-tuss').value;
    const termo = document.getElementById('filtro-termo-tuss').value;
    const tbody = document.getElementById('tbody-dominios');
    
    if (!cod && termo.length < 3) {
        alert("Digite um código ou pelo menos 3 letras da descrição para pesquisar.");
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">⏳ A pesquisar...</td></tr>';
    try {
        const res = await fetch(`/api/dominio_tuss?codigo=${cod}&termo=${termo}`);
        const data = await res.json();
        
        if (res.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Sem resultados.</td></tr>'; return; }
            data.forEach(d => {
                const termoEscapado = d.termo.replace(/'/g, "");
                const anvisa = d.registroAnvisa || '';
                tbody.innerHTML += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td>${d.codigoTabela}</td><td><strong>${d.codigoTermo}</strong></td><td>${d.termo}</td><td>${anvisa}</td>
                        <td>
                            <button class="btn btn-warning" style="padding: 4px; font-size: 10px;" onclick="prepararEdicaoDominio('${d.id}', '${d.codigoTabela}', '${d.codigoTermo}', '${termoEscapado}', '${anvisa}')">✏️</button>
                            <button class="btn btn-danger" style="padding: 4px; font-size: 10px;" onclick="excluirDominioTUSS('${d.id}')">🗑️</button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Erro de rede.</td></tr>'; }
}

function prepararEdicaoDominio(id, tabela, cod, termo, anvisa) {
    document.getElementById('edit-tuss-id').value = id;
    document.getElementById('edit-tuss-tabela').value = tabela;
    document.getElementById('edit-tuss-codigo').value = cod;
    document.getElementById('edit-tuss-termo').value = termo;
    document.getElementById('edit-tuss-anvisa').value = anvisa;
    abrirModal('modalEdicaoDominio');
}

async function salvarEdicaoDominio() {
    const dados = {
        acao: 'editar', id: document.getElementById('edit-tuss-id').value,
        codigoTabela: document.getElementById('edit-tuss-tabela').value,
        codigoTermo: document.getElementById('edit-tuss-codigo').value,
        termo: document.getElementById('edit-tuss-termo').value,
        registroAnvisa: document.getElementById('edit-tuss-anvisa').value
    };
    try {
        const res = await fetch('/api/dominio_tuss', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dados) });
        if(res.ok) { alert("Atualizado!"); fecharModal('modalEdicaoDominio'); pesquisarDominiosTUSS(); }
    } catch(e) {}
}

async function excluirDominioTUSS(id) {
    if(!confirm("Atenção! Apagar este domínio pode afetar validações futuras. Confirma?")) return;
    try {
        const res = await fetch('/api/dominio_tuss', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({acao: 'excluir', id: id}) });
        if(res.ok) { pesquisarDominiosTUSS(); }
    } catch(e) {}
}

// --- FUNÇÕES: ADMIN VISUALIZA REGRAS DOS CLIENTES ---
async function abrirModalRegrasAdmin() {
    abrirModal('modalRegrasAdmin');
    const select = document.getElementById('select-clientes-regras');
    select.innerHTML = '<option value="">⏳ A carregar carteira de clientes...</option>';
    
    try {
        // Reutilizamos a API de utilizadores para listar os clientes
        const response = await fetch(`/api/gestao_usuarios?tipo=CLIENTE`);
        const clientes = await response.json();
        
        if (response.ok && clientes.length > 0) {
            select.innerHTML = '<option value="">-- Selecione um Cliente --</option>';
            clientes.forEach(c => { select.innerHTML += `<option value="${c.id}">${c.nome} (${c.email})</option>`; });
        } else {
            select.innerHTML = '<option value="">Nenhum cliente encontrado.</option>';
        }
    } catch(e) { select.innerHTML = '<option value="">Erro ao carregar.</option>'; }
}

async function carregarRegrasClienteAdmin(clienteId) {
    const tbody = document.getElementById('tbody-regras-admin');
    if (!clienteId) { tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Selecione um cliente.</td></tr>'; return; }
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">⏳ A carregar regras do cliente...</td></tr>';
    try {
        const response = await fetch(`/api/regras?clienteId=${clienteId}`);
        const regras = await response.json();
        
        if (response.ok) {
            tbody.innerHTML = '';
            if(regras.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Este cliente ainda não criou regras.</td></tr>'; return; }
            regras.forEach(r => {
                const corBadge = r.acao === 'BLOQUEIO' ? '#dc3545' : '#f39c12';
                tbody.innerHTML += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td><strong>${r.nomeRegra}</strong></td>
                        <td>${r.tipoGuia} <br><span style="color:#666; font-size:11px;">Campo: ${r.campoValidado}</span></td>
                        <td>${r.condicao} <strong>${r.valorEsperado}</strong></td>
                        <td><span style="background: ${corBadge}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px;">${r.acao}</span></td>
                    </tr>
                `;
            });
        }
    } catch (e) { tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro de conexão.</td></tr>'; }
}

