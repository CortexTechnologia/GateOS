// ==========================================
// CORTEX TECHNOLOGIA - SGBD MASTER SCRIPT
// ==========================================

// Proteção contra XSS
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let masterToken = localStorage.getItem('cortex_master_token') || '';

// Valida a sessão ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    if (masterToken) {
        document.getElementById('login-area').style.display = 'none';
        document.getElementById('dashboard-area').style.display = 'block';
        carregarClientes();
    }
});

async function logarMaster() {
    const email = document.getElementById('master-email').value;
    const password = document.getElementById('master-pass').value;

    try {
        const res = await fetch('/auth/super-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (res.ok) {
            masterToken = data.token;
            localStorage.setItem('cortex_master_token', masterToken);

            document.getElementById('login-area').style.display = 'none';
            document.getElementById('dashboard-area').style.display = 'block';
            carregarClientes();
        } else {
            alert(data.error || 'Acesso Negado. Credenciais inválidas.');
        }
    } catch (err) {
        alert('Erro de conexão com o servidor Cortex.');
    }
}

function sairMaster() {
    localStorage.removeItem('cortex_master_token');
    masterToken = '';
    document.getElementById('login-area').style.display = 'block';
    document.getElementById('dashboard-area').style.display = 'none';
}

async function carregarClientes() {
    const tbody = document.getElementById('tabela-clientes');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-secondary"><div class="spinner-border spinner-border-sm me-2" role="status"></div> Atualizando telemetria...</td></tr>';

    try {
        const res = await fetch('/cortex-api/condominios', {
            headers: { 'Authorization': `Bearer ${masterToken}` }
        });

        if (!res.ok) {
            if (res.status === 401) sairMaster(); // Token expirado
            throw new Error('Falha ao buscar dados');
        }

        const data = await res.json();
        tbody.innerHTML = '';

        // Variaveis de Telemetria para os Cards
        let mrrEstimado = 0;
        let totalPortoes = 0;
        let clientesInadimplentes = 0;
        const clientesAtivos = data.length;

        if (clientesAtivos === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-secondary">Nenhuma instalação localizada no banco de dados.</td></tr>';
            atualizarCards(0, 0, 0, 0);
            return;
        }

        data.forEach(condo => {
            // 1. Lógica de Contagem para os Cards
            const qtdPortoes = condo.devices ? condo.devices.length : 0;
            totalPortoes += qtdPortoes;

            let statusVisual = condo.statusPagamento || 'PENDENTE';
            let badgeClass = 'bg-secondary'; 

            if (statusVisual === 'EM_DIA') {
                badgeClass = 'bg-success';
                // Simulando um ticket médio hipotético. Podemos integrar com o Asaas futuramente.
                mrrEstimado += 150.00; 
            } else if (statusVisual === 'TRIAL') {
                badgeClass = 'bg-warning text-dark';
            } else {
                badgeClass = 'bg-danger';
                clientesInadimplentes++;
            }

            // 2. Tratamento de Dados (Prevenindo erros se não houver usuário)
            const nomeSindicoStr = condo.Users && condo.Users.length > 0 && condo.Users[0].nome
                ? condo.Users[0].nome
                : 'Pendente';

            const emailSindicoStr = condo.Users && condo.Users.length > 0
                ? condo.Users[0].email
                : '<span class="text-danger small fw-bold">Sem Síndico Vinculado</span>';

            // 3. Renderização da Linha (Bootstrap 5)
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold text-white py-3 px-4">
                    ${escapeHTML(condo.nome)}<br>
                    <small class="text-secondary fw-normal">CNPJ: ${escapeHTML(condo.cnpj || 'Não informado')}</small>
                </td>
                <td class="py-3">
                    ${escapeHTML(nomeSindicoStr)}<br>
                    <small class="text-secondary">${emailSindicoStr}</small>
                </td>
                <td class="py-3 text-center fw-bold text-light">${condo.qtdUnidades || '--'}</td>
                <td class="py-3"><span class="badge ${badgeClass} px-2 py-1">${statusVisual}</span></td>
                <td class="py-3 text-end px-4">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="alert('Edição de planos em desenvolvimento!')" title="Editar Instalação"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="alert('Integração de Suspensão com Asaas pendente!')" title="Suspender Acesso"><i class="bi bi-pause-circle"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 4. Dispara a atualização visual dos Cards
        atualizarCards(mrrEstimado, clientesAtivos, totalPortoes, clientesInadimplentes);

    } catch (err) {
        console.error("Erro na telemetria:", err);
        document.getElementById('tabela-clientes').innerHTML = '<tr><td colspan="5" class="text-danger fw-bold text-center py-4">Erro Crítico: Falha na comunicação com os servidores PostgreSQL.</td></tr>';
    }
}

// Função auxiliar para injetar os números no HTML
function atualizarCards(mrr, clientes, portoes, inadimplentes) {
    document.getElementById('metric-mrr').innerText = `R$ ${mrr.toFixed(2).replace('.', ',')}`;
    document.getElementById('metric-clientes').innerText = clientes;
    document.getElementById('metric-portoes').innerText = portoes;
    document.getElementById('metric-inadimplentes').innerText = inadimplentes;
}