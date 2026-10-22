// js/modulos/admin.js

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
    const tabela = document.getElementById('tabela-importacao').value; 
    const fileInput = document.getElementById('arquivo-csv-tuss');
    const divResultado = document.getElementById('resultado-carga');
    const btnUpload = document.getElementById('btn-upload-tuss');
    
    if (fileInput.files.length === 0) {
        divResultado.innerHTML = '<span style="color: red;">❌ Por favor, selecione um ficheiro CSV primeiro.</span>';
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    
    btnUpload.disabled = true;
    btnUpload.style.opacity = "0.7";
    btnUpload.innerHTML = '<div class="gauge-loader"></div> <span>Processando...</span>';
    divResultado.innerHTML = '<div class="gauge-loader"></div> <span style="color: #0056b3;">Dividindo arquivo e enviando para a base de dados...</span>';

    reader.onload = async function(e) {
        const conteudoCSV = e.target.result;
        
        // Quebra o CSV gigante em linhas
        const linhas = conteudoCSV.split(/\r?\n/);
        const cabecalho = linhas[0];
        const tamanhoLote = 3000; // Envia 3 mil linhas por vez para não estourar os 4.5MB da Vercel
        let lotesEnviados = 0;
        let temErro = false;

        try {
            for (let i = 1; i < linhas.length; i += tamanhoLote) {
                const lote = linhas.slice(i, i + tamanhoLote);
                // Ignora linhas vazias no final do ficheiro
                if (lote.length === 0 || (lote.length === 1 && lote[0].trim() === '')) continue;
                
                // Reconstrói o CSV pequeno (Cabeçalho + Lote de linhas)
                const chunkCSV = cabecalho + '\n' + lote.join('\n');
                
                divResultado.innerHTML = `<div class="gauge-loader"></div> <span style="color: #0056b3;">A enviar pacote ${lotesEnviados + 1}...</span>`;

                const response = await fetch('/api/carga_tuss', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tabela: tabela, csv_data: chunkCSV })
                });
                
                const data = await response.json();
                if (!response.ok || !data.sucesso) {
                    divResultado.innerHTML = `<span style="color: red;">❌ Erro no pacote ${lotesEnviados + 1}: ${data.erro}</span>`;
                    temErro = true;
                    break; // Interrompe se o backend rejeitar
                }
                lotesEnviados++;
            }
            
            if (!temErro) {
                divResultado.innerHTML = `<span style="color: green;">✅ Sucesso! Arquivo processado e enviado em ${lotesEnviados} pacote(s).</span>`;
                fileInput.value = ""; 
            }
        } catch (error) {
            divResultado.innerHTML = `<span style="color: red;">❌ Erro de comunicação com o servidor durante o envio dos pacotes.</span>`;
        } finally {
            btnUpload.disabled = false;
            btnUpload.style.opacity = "1";
            btnUpload.innerHTML = '<span>Fazer Upload</span>';
        }
    };
    
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

// --- GESTÃO DE ACESSOS (IAM) ---
async function carregarListaUsuarios() {
    const tipo = document.getElementById('filtro-tipo-usuario').value;
    const tbody = document.getElementById('lista-usuarios-body');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">⏳ A pesquisar na base de dados...</td></tr>';
    
    try {
        const response = await fetch(`/api/gestao_usuarios?tipo=${tipo}`);
        const data = await response.json();
        
        if (response.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum registo encontrado.</td></tr>';
                return;
            }
            data.forEach(user => {
                const perfilStatus = tipo === 'INTERNO' ? user.perfil : user.statusConta;
                const corBadge = (perfilStatus === 'ATIVO' || perfilStatus === 'ADMIN') ? '#28a745' : (perfilStatus === 'BLOQUEADO' ? '#dc3545' : '#f39c12');
                
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${user.nome}</strong></td>
                        <td>${user.email}</td>
                        <td><span style="background: ${corBadge}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">${perfilStatus}</span></td>
                        <td>
                            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="editarAcesso('${user.id}', '${tipo}', '${perfilStatus}')">✏️ Editar</button>
                            <button class="btn btn-warning" style="padding: 4px 8px; font-size: 11px; color: #333;" onclick="resetarSenha('${user.id}', '${tipo}', '${user.email}')">🔑 Reset Senha</button>
                            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="bloquearAcesso('${user.id}', '${tipo}')">🚫 Bloquear</button>
                        </td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Erro: ${data.erro}</td></tr>`;
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro de comunicação com o servidor.</td></tr>';
    }
}

async function executarAcaoIAM(acao, id, tipo, novoDado = null) {
    try {
        const response = await fetch('/api/gestao_usuarios', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: acao, id: id, tipo: tipo, novo_dado: novoDado })
        });
        const data = await response.json();
        if (response.ok && data.sucesso) {
            alert(data.mensagem); carregarListaUsuarios(); 
        } else { alert(`Erro do Servidor: ${data.erro}`); }
    } catch(e) { alert("Erro de comunicação."); }
}

function resetarSenha(id, tipo, email) {
    if(confirm(`Confirma a redefinição de senha para ${email}?\nA nova senha provisória será: Mudar@123`)) { executarAcaoIAM('resetar', id, tipo); }
}

function bloquearAcesso(id, tipo) {
    if(confirm("Deseja realmente bloquear este utilizador?")) { executarAcaoIAM('bloquear', id, tipo); }
}

function editarAcesso(id, tipo, statusAtual) {
    const instrucao = tipo === 'INTERNO' ? "Novo PERFIL (ADMIN, OPERACAO, PUBLICIDADE, GESTAO):" : "Novo STATUS (ATIVO, PENDENTE, BLOQUEADO):";
    const novoValor = prompt(instrucao, statusAtual);
    if (novoValor && novoValor.trim() !== "" && novoValor.toUpperCase() !== statusAtual) { executarAcaoIAM('editar', id, tipo, novoValor); }
}

async function cadastrarUsuarioInterno() {
    const nome = document.getElementById('cad-nome-interno').value;
    const perfil = document.getElementById('cad-perfil-interno').value;
    const email = document.getElementById('cad-email-interno').value;
    const senha = document.getElementById('cad-senha-interno').value;

    if (!nome || !email || !senha) { alert("Preencha todos os campos."); return; }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'registro_admin', nome: nome, email: email, senha: senha, perfil: perfil })
        });
        const data = await response.json();
        if (response.ok && data.sucesso) { alert(data.mensagem); fecharModais(); } 
        else { alert(`Erro: ${data.erro}`); }
    } catch (error) { alert("Erro ao cadastrar usuário."); }
}

// --- CORREÇÃO DA GESTÃO IAM ---
function abrirModalGestaoAcessos() {
    abrirModal('modalGestaoAcessos');
    if (typeof carregarListaUsuarios === "function") {
        carregarListaUsuarios(); 
    }
}

function prepararEdicaoDominio(id, tabela, codigo, termo, anvisa, fabricante, modelo, risco) {
    document.getElementById('edit-tuss-id').value = id;
    document.getElementById('edit-tuss-tabela').value = tabela;
    document.getElementById('edit-tuss-codigo').value = codigo;
    document.getElementById('edit-tuss-termo').value = termo;
    document.getElementById('edit-tuss-anvisa').value = anvisa || '';
    document.getElementById('edit-tuss-fabricante').value = fabricante || '';
    document.getElementById('edit-tuss-modelo').value = modelo || '';
    document.getElementById('edit-tuss-risco').value = risco || '';
    abrirModal('modalEditarTUSS');
}

async function salvarEdicaoDominio() {
    const dados = {
        acao: 'editar',
		id: document.getElementById('edit-tuss-id').value,
		codigoTabela: document.getElementById('edit-tuss-tabela').value,
		codigoTermo: document.getElementById('edit-tuss-codigo').value,
		termo: document.getElementById('edit-tuss-termo').value,
		registroAnvisa: document.getElementById('edit-tuss-anvisa').value,
		fabricante: document.getElementById('edit-tuss-fabricante').value,
		apresentacaoModelo: document.getElementById('edit-tuss-modelo').value,
		classeRisco: document.getElementById('edit-tuss-risco').value
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

// --- GESTÃO DE ASSINATURAS SAAS ---
let clientesAssinaturaCache = [];

async function abrirModalAssinaturas(preSelectedId = null) {
    abrirModal('modalAssinaturas');
    document.getElementById('area-edicao-assinatura').style.display = 'none';
    const select = document.getElementById('select-cliente-assinatura');
    select.innerHTML = '<option value="">⏳ Carregando clientes...</option>';
    
    try {
        const response = await fetch(`/api/gestao_usuarios?tipo=CLIENTE`);
        clientesAssinaturaCache = await response.json();
        
        if (response.ok && clientesAssinaturaCache.length > 0) {
            select.innerHTML = '<option value="">-- Selecione um Cliente --</option>';
            clientesAssinaturaCache.forEach(c => { 
                select.innerHTML += `<option value="${c.id}">${c.nome} (${c.plano || 'FREEMIUM'})</option>`; 
            });
            
            // Se foi clicado no grid, já seleciona o cliente no select e mostra os dados
            if (preSelectedId) {
                select.value = preSelectedId;
                carregarDadosAssinaturaCliente(preSelectedId);
            }
        } else {
            select.innerHTML = '<option value="">Nenhum cliente encontrado.</option>';
        }
    } catch(e) { select.innerHTML = '<option value="">Erro de conexão.</option>'; }
}

// --- GESTÃO DE TOKENS IA ---
let clientesTokenCache = [];

async function abrirModalTokens(preSelectedId = null) {
    abrirModal('modalTokens');
    document.getElementById('area-edicao-token').style.display = 'none';
    const select = document.getElementById('select-cliente-token');
    select.innerHTML = '<option value="">⏳ Carregando clientes...</option>';
    
    try {
        const response = await fetch(`/api/gestao_usuarios?tipo=CLIENTE`);
        clientesTokenCache = await response.json();
        
        if (response.ok && clientesTokenCache.length > 0) {
            select.innerHTML = '<option value="">-- Selecione um Cliente --</option>';
            clientesTokenCache.forEach(c => { 
                select.innerHTML += `<option value="${c.id}">${c.nome}</option>`; 
            });
            
            if (preSelectedId) {
                select.value = preSelectedId;
                carregarDadosTokenCliente(preSelectedId);
            }
        } else {
            select.innerHTML = '<option value="">Nenhum cliente encontrado.</option>';
        }
    } catch(e) { select.innerHTML = '<option value="">Erro de conexão.</option>'; }
}

function carregarDadosTokenCliente(clienteId) {
    document.getElementById('token-qtd-add').value = ''; // Limpa o input
    if (!clienteId) {
        document.getElementById('area-edicao-token').style.display = 'none';
        return;
    }
    const cliente = clientesTokenCache.find(c => c.id === clienteId);
    if (cliente) {
        document.getElementById('area-edicao-token').style.display = 'block';
        document.getElementById('token-saldo-atual').innerText = cliente.tokensRestantes || 0;
    }
}

async function salvarTokensCliente() {
    const clienteId = document.getElementById('select-cliente-token').value;
    const qtdAdd = parseInt(document.getElementById('token-qtd-add').value) || 0;
    
    if (!clienteId) return;
    if (qtdAdd === 0) {
        alert("Informe uma quantidade válida para adicionar ou remover.");
        return;
    }

    try {
        // Envia para o backend processar a adição/subtração
        const response = await fetch('/api/gestao_usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                acao: 'atualizar_tokens', 
                id: clienteId, 
                quantidade: qtdAdd 
            })
        });
        
        const data = await response.json();
        if (response.ok && data.sucesso) {
            alert("Saldo de tokens atualizado com sucesso!");
            fecharModal('modalTokens');
            pesquisarContratos(); // Recarrega a Grid para mostrar o novo saldo
        } else {
            alert(`Erro ao atualizar: ${data.erro}`);
        }
    } catch(e) { 
        alert("Erro de comunicação com o servidor."); 
    }
}

function carregarDadosAssinaturaCliente(clienteId) {
    if (!clienteId) {
        document.getElementById('area-edicao-assinatura').style.display = 'none';
        return;
    }
    const cliente = clientesAssinaturaCache.find(c => c.id === clienteId);
    if (cliente) {
        document.getElementById('area-edicao-assinatura').style.display = 'block';
        document.getElementById('edit-plano-cliente').value = cliente.plano || 'FREEMIUM';
        document.getElementById('edit-status-pagamento').value = cliente.statusPagamento || 'ATIVO';
    }
}

async function salvarAssinaturaCliente() {
    const clienteId = document.getElementById('select-cliente-assinatura').value;
    const novoPlano = document.getElementById('edit-plano-cliente').value;
    const novoStatus = document.getElementById('edit-status-pagamento').value;
    
    if (!clienteId) return;

    try {
        const response = await fetch('/api/assinatura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: clienteId, plano: novoPlano, statusPagamento: novoStatus })
        });
        const data = await response.json();
        if (response.ok && data.sucesso) {
            alert("Assinatura atualizada com sucesso!");
            fecharModal('modalAssinaturas');
        } else {
            alert(`Erro ao atualizar: ${data.erro}`);
        }
    } catch(e) { alert("Erro de comunicação com o servidor."); }
}

// --- PESQUISA DE CLIENTES (GRID PRINCIPAL) ---
async function pesquisarContratos() {
    const nome = document.getElementById('filtro-cli-nome').value;
    const email = document.getElementById('filtro-cli-email').value;
    const status = document.getElementById('filtro-cli-status').value;
    const tbody = document.getElementById('tbody-contratos');

    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><div class="gauge-loader"></div> Consultando clientes no banco...</td></tr>';
    
    try {
        let url = `/api/gestao_usuarios?tipo=CLIENTE`;
        if (nome) url += `&nome=${encodeURIComponent(nome)}`;
        if (email) url += `&email=${encodeURIComponent(email)}`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url);
        const data = await response.json();
        
        if (response.ok) {
            tbody.innerHTML = '';
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum contrato encontrado com esses filtros.</td></tr>';
                return;
            }

            data.forEach(c => {
                // Mapeamento dos campos do banco de dados (Prisma) para exibição
                let statusExibicao = c.statusConta === 'CANCELADO' ? 'CANCELADO' : (c.statusPagamento || 'ATIVO');
                let corStatus = statusExibicao === 'ATIVO' ? '#28a745' : '#dc3545';
                const badgeStatus = `<span class="badge" style="background:${corStatus};">${statusExibicao}</span>`;
                
                const plano = c.plano || 'FREEMIUM';
                const tokens = c.tokensRestantes || 0;
                
                // Variáveis formatadas para evitar quebra de aspas no HTML
                const argsDados = `'${c.id}', '${c.nome.replace(/'/g, "\\'")}', '${c.email}', '${c.statusConta || 'ATIVO'}'`;
                const argsAds = `'${c.id}', '${c.nome.replace(/'/g, "\\'")}', '${c.email}'`;

                tbody.innerHTML += `
                    <tr>
                        <td><strong>${c.nome}</strong></td>
                        <td>${c.email}</td>
                        <td>${badgeStatus}</td>
                        <td><strong>${plano}</strong></td>
                        <td><span style="color:#0056b3; font-weight:bold; font-size: 16px;">${tokens}</span></td>
                        <td>
                            <button class="btn" style="background:#17a2b8; color:white; font-size:11px; padding:6px;" onclick="abrirDadosCliente(${argsDados})" title="Editar Dados e Cancelamento">✏️ Dados</button>
                            <button class="btn" style="background:#28a745; color:white; font-size:11px; padding:6px;" onclick="abrirModalTokens('${c.id}')" title="Adicionar Tokens">💰 Tokens</button>
<button class="btn" style="background:#6f42c1; color:white; font-size:11px; padding:6px;" onclick="abrirModalAssinaturas('${c.id}')" title="Situação Financeira">💲 Assinatura</button><button class="btn" style="background:#f39c12; color:white; font-size:11px; padding:6px;" onclick="abrirNovaCampanhaAdmin(${argsAds})" title="Novo Pedido de Ads para o Cliente">📢 Ads</button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Erro de comunicação com a API.</td></tr>';
    }
}

// --- FUNÇÕES DE AÇÃO RÁPIDA (BOTÕES DO GRID) ---

// Chama o formulário de publicidade, mas em nome do cliente
function abrirNovaCampanhaAdmin(id, nome, email) {
    document.getElementById('pub-cliente-id').value = id;
    document.getElementById('pub-empresa').value = nome;
    document.getElementById('pub-email').value = email;
    
    // Limpa campos que poderiam estar sujos de outra edição
    document.getElementById('pub-tema').value = "";
    document.getElementById('pub-link').value = "";
    
    abrirModal('modalPublicidade');
}

// Abre edição de Dados e Controle de Cancelamento
function abrirDadosCliente(id, nome, email, statusConta) {
    document.getElementById('dados-cli-id').value = id;
    document.getElementById('dados-cli-nome').value = nome;
    document.getElementById('dados-cli-email').value = email;
    
    const chkCancelar = document.getElementById('chk-cancelar-conta');
    const divData = document.getElementById('div-data-cancelamento');
    const inputData = document.getElementById('dados-cli-data-cancelamento');
    
    if (statusConta === 'CANCELADO') {
        chkCancelar.checked = true;
        divData.style.display = 'block';
    } else {
        chkCancelar.checked = false;
        divData.style.display = 'none';
        inputData.value = '';
    }
    
    abrirModal('modalDadosCliente');
}

function toggleDataCancelamento() {
    const chk = document.getElementById('chk-cancelar-conta').checked;
    document.getElementById('div-data-cancelamento').style.display = chk ? 'block' : 'none';
}

async function salvarDadosCliente() {
    const id = document.getElementById('dados-cli-id').value;
    const nome = document.getElementById('dados-cli-nome').value;
    const cancelar = document.getElementById('chk-cancelar-conta').checked;
    const dataCancelamento = document.getElementById('dados-cli-data-cancelamento').value;
    
    let statusConta = cancelar ? 'CANCELADO' : 'ATIVO';

    if (cancelar && !dataCancelamento) {
        alert("Para cancelar a conta, você precisa informar a Data Efetiva do Cancelamento.");
        return;
    }

    try {
        const response = await fetch('/api/gestao_usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'editar_dados',
                id: id,
                nome: nome,
                statusConta: statusConta,
                dataCancelamento: dataCancelamento
            })
        });
        const data = await response.json();
        
        if(response.ok && data.sucesso) {
            alert("Dados do cliente atualizados com sucesso!");
            fecharModal('modalDadosCliente');
            pesquisarContratos(); // Atualiza a Grid para refletir o status
        } else {
            alert(`Erro do banco de dados: ${data.erro}`);
        }
    } catch(e) {
        alert("Erro ao comunicar com o servidor.");
    }
}

// O botão "Ads" na grelha deve ser: onclick="abrirGestaoAdsAdmin('${c.id}', '${c.nome}')"
function abrirGestaoAdsAdmin(clienteId, clienteNome) {
    document.getElementById('ads-admin-cliente-nome').innerText = `Listando campanhas de: ${clienteNome}`;
    const tbody = document.getElementById('tbody-ads-admin');
    
    // Simulação de Dados (A ser substituído por fetch API)
    const mockAds = [
        { id: 1, tema: "Lançamento ERP Novo", status: "PENDENTE", valor: 0 },
        { id: 2, tema: "Pós Graduação", status: "PAGO", valor: 800 }
    ];
    
    tbody.innerHTML = '';
    if(mockAds.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma campanha registada.</td></tr>';
    } else {
        mockAds.forEach(ad => {
            let corStatus = ad.status === 'ATIVO' ? '#28a745' : (ad.status === 'PAGO' ? '#17a2b8' : '#f39c12');
            tbody.innerHTML += `
                <tr>
                    <td><strong>${ad.tema}</strong></td>
                    <td><span class="badge" style="background:${corStatus};">${ad.status}</span></td>
                    <td>R$ ${ad.valor.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-primary" style="padding: 4px; font-size:11px;" onclick="prepararOrcamentoAd(${ad.id})">Orçar</button>
                        <button class="btn btn-success" style="padding: 4px; font-size:11px;" onclick="alterarStatusAd(${ad.id}, 'ATIVO')">Aprovar Exibição</button>
                        <button class="btn btn-danger" style="padding: 4px; font-size:11px;" onclick="alterarStatusAd(${ad.id}, 'CANCELADO')">Cancelar</button>
                    </td>
                </tr>
            `;
        });
    }
    abrirModal('modalGestaoAdsAdmin');
}

function prepararOrcamentoAd(id) {
    document.getElementById('orc-ad-id').value = id;
    abrirModal('modalEnviarOrcamento');
}

function salvarOrcamentoAd() {
    // Integração API para gravar orçamento
    alert("Orçamento enviado ao cliente!");
    fecharModal('modalEnviarOrcamento');
}

function alterarStatusAd(id, novoStatus) {
    if(confirm(`Deseja alterar esta campanha para ${novoStatus}?`)) {
        // Integração API para mudar status
        alert(`Campanha alterada para ${novoStatus}.`);
    }
}

function abrirPagamentoPIX(campanhaId, valor) {
        document.getElementById('pix-valor-display').innerText = `R$ ${valor.toFixed(2)}`;
        // Aqui integraremos a API do gateway (Asaas/Stripe) para gerar o Copia-e-Cola real
        abrirModal('modalPagarAds');
    }
    
function copiarPix() {
        const copyText = document.getElementById("pix-copia-cola");
        copyText.select();
        document.execCommand("copy");
        alert("Código PIX copiado!");
    }

// ==========================================
// --- GESTÃO DE PUBLICIDADE (ADMIN) ---
// ==========================================

// Abre o modal principal e já carrega a lista
function abrirGestaoAdsAdminGeral() {
    abrirModal('modalGestaoAdsAdmin');
    pesquisarPedidosAdAdmin();
}

async function pesquisarPedidosAdAdmin() {
    const clienteFiltro = document.getElementById('filtro-ad-cliente').value;
    const statusFiltro = document.getElementById('filtro-ad-status').value;
    const tbody = document.getElementById('tbody-gestao-ads-admin');

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;"><div class="gauge-loader"></div> Buscando pedidos...</td></tr>';

    try {
        let url = `/api/publicidade?acao=listar`;
        if (clienteFiltro) url += `&cliente=${encodeURIComponent(clienteFiltro)}`;
        if (statusFiltro) url += `&status=${statusFiltro}`;

        const response = await fetch(url);
        const data = await response.json();

        tbody.innerHTML = '';
        if (!response.ok || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum pedido encontrado.</td></tr>';
            return;
        }

        data.forEach(ad => {
            let corStatus = '#6c757d'; 
            if (ad.status === 'ATIVO') corStatus = '#28a745';
            else if (ad.status === 'AGUARDANDO_PAGAMENTO') corStatus = '#f39c12';
            else if (ad.status === 'CANCELADO') corStatus = '#dc3545';
            else if (ad.status === 'PENDENTE') corStatus = '#0056b3';

            const temaTratado = (ad.tema || '').replace(/'/g, "\\'");
            const obsTratada = (ad.observacaoAdmin || '').replace(/'/g, "\\'");
            
            const argsAval = `'${ad.id}', '${temaTratado}', '${obsTratada}', ${ad.valorOrcamento || 0}, '${ad.dataInicio || ''}', '${ad.dataFim || ''}'`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${ad.empresa_nome || 'Desconhecido'}</strong></td>
                    <td><div style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ad.tema}</div></td>
                    <td><span class="badge" style="background:${corStatus};">${ad.status}</span></td>
                    <td>
                        <button class="btn" style="background:#17a2b8; color:white; padding: 5px; font-size:11px;" onclick="abrirAvaliacaoAdAdmin(${argsAval})">Avaliar / Editar</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro de comunicação.</td></tr>';
    }
}

function abrirAvaliacaoAdAdmin(id, tema, obs, valor, dataInicio, dataFim) {
    document.getElementById('aval-ad-id').value = id;
    document.getElementById('aval-ad-tema').value = tema;
    document.getElementById('aval-ad-obs').value = (obs && obs !== 'null') ? obs : "";
    document.getElementById('aval-ad-valor').value = valor > 0 ? valor : "";
    
    document.getElementById('aval-ad-inicio').value = dataInicio ? dataInicio.split('T')[0] : "";
    document.getElementById('aval-ad-fim').value = dataFim ? dataFim.split('T')[0] : "";
    
    abrirModal('modalAvaliarAdAdmin');
}

async function salvarAvaliacaoAd(novoStatus) {
    const id = document.getElementById('aval-ad-id').value;
    const obs = document.getElementById('aval-ad-obs').value;
    const valor = parseFloat(document.getElementById('aval-ad-valor').value) || 0;
    const dtInicio = document.getElementById('aval-ad-inicio').value;
    const dtFim = document.getElementById('aval-ad-fim').value;
	const localExibicao = document.getElementById('aval-ad-local').value;

    if (novoStatus === 'AGUARDANDO_PAGAMENTO' && valor <= 0) {
        alert("Para enviar o orçamento, informe um valor maior que zero.");
        return;
    }

    try {
        const payload = {
            acao: 'avaliar',
            id: id,
            status: novoStatus,
            observacaoAdmin: obs,
            valorOrcamento: valor,
            dataInicio: dtInicio ? new Date(dtInicio + 'T00:00:00Z').toISOString() : null,
            dataFim: dtFim ? new Date(dtFim + 'T23:59:59Z').toISOString() : null,
			localExibicao: localExibicao
        };

        const response = await fetch('/api/publicidade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (response.ok && data.sucesso) {
            alert("Avaliação salva com sucesso!");
            fecharModal('modalAvaliarAdAdmin');
            pesquisarPedidosAdAdmin(); 
        } else { alert(`Erro: ${data.erro}`); }
    } catch (e) { alert("Erro de comunicação com o servidor."); }
}

