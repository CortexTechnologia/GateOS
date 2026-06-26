/* ARQUIVO: app.js */
const API_URL = '';
let currentMode = 'login';
let registerType = 'entrar_condominio';
let token = localStorage.getItem('gateos_token');
let userData = {};

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // NOVA LÓGICA DE UX: Captura de Retorno do Pagamento
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('pagamento') === 'sucesso') {
        showToast('Pagamento confirmado com sucesso!', 'success');

        // Atualiza o status local para liberar as funções do painel na hora
        if (token) {
            userData.statusPagamento = 'EM_DIA';
            localStorage.setItem('gateos_status', 'EM_DIA');
        }

        // Limpa a URL (tira o ?pagamento=sucesso) para a mensagem não repetir se ele der F5
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // ==========================================
    // LÓGICA DE INICIALIZAÇÃO PADRÃO
    // ==========================================
    if (token) {
        userData = {
            role: localStorage.getItem('gateos_role'),
            condoName: localStorage.getItem('gateos_condo'),
            accessCode: localStorage.getItem('gateos_code'),
            statusPagamento: localStorage.getItem('gateos_status') // Puxando o status salvo
        };
        mostrarApp();
    } else {
        mostrarAuth();
    }
});

function switchTab(mode) {
    currentMode = mode;

    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(b => b.classList.remove('active'));

    if (mode === 'login') {
        tabs[0].classList.add('active');
    } else {
        tabs[1].classList.add('active');
    }

    const regFields = document.getElementById('register-fields');
    const btn = document.getElementById('btn-auth');

    if (mode === 'login') {
        regFields.style.display = 'none';
        btn.innerText = 'ACESSAR SISTEMA';
    } else {
        regFields.style.display = 'block';
        btn.innerText = 'CADASTRAR';
    }
}

function setType(type) {
    registerType = type;

    const btnMembro = document.getElementById('btn-membro');
    const btnAdmin = document.getElementById('btn-admin');

    if (btnMembro && btnAdmin) {
        btnMembro.classList.toggle('active-type', type === 'entrar_condominio');
        btnAdmin.classList.toggle('active-type', type === 'novo_condominio');

        btnMembro.style.background = type === 'entrar_condominio' ? 'var(--primary)' : 'transparent';
        btnMembro.style.color = type === 'entrar_condominio' ? 'white' : 'var(--primary)';

        btnAdmin.style.background = type === 'novo_condominio' ? 'var(--primary)' : 'transparent';
        btnAdmin.style.color = type === 'novo_condominio' ? 'white' : 'var(--primary)';
    }

    const fieldCodigo = document.getElementById('field-codigo');
    const fieldNovo = document.getElementById('field-novo');

    if (type === 'novo_condominio') {
        if (fieldCodigo) fieldCodigo.style.display = 'none';
        if (fieldNovo) fieldNovo.style.display = 'block';
    } else {
        if (fieldCodigo) fieldCodigo.style.display = 'block';
        if (fieldNovo) fieldNovo.style.display = 'none';
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Referências da nova caixa de alerta
    const alertBox = document.getElementById('auth-alert');
    const alertText = document.getElementById('auth-alert-text');
    const alertHelp = document.getElementById('auth-alert-help');

    // Oculta o alerta antes de nova tentativa
    if (alertBox) alertBox.style.display = 'none';

    let body = { email, password };

    if (currentMode === 'register') {
        body.tipo = registerType;
        if (registerType === 'entrar_condominio') {
            body.codigoAcesso = document.getElementById('accessCode').value;
            body.unitType = document.querySelector('input[name="unitType"]:checked').value;
            body.unitNumber = document.getElementById('unitNumber').value;
            body.unitBlock = document.getElementById('unitBlock').value;
            if (!body.unitNumber) return showToast('Informe o número da unidade!', 'error');
        } else {
            const condoNameEl = document.getElementById('condoName');
            if (condoNameEl) body.nomeCondominio = condoNameEl.value;
        }
    }

    try {
        const endpoint = currentMode === 'login' ? '/auth/login' : '/auth/register';
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (res.ok) {
            if (currentMode === 'register') {
                showToast('Cadastro sucesso! Faça login.', 'success');
                switchTab('login');
            } else {
                token = data.token;
                userData = {
                    role: data.role,
                    condoName: data.condominioNome,
                    accessCode: data.accessCode,
                    statusPagamento: data.statusPagamento
                };

                localStorage.setItem('gateos_token', token);
                localStorage.setItem('gateos_role', data.role);
                localStorage.setItem('gateos_condo', data.condominioNome);
                localStorage.setItem('gateos_status', data.statusPagamento);
                if (data.accessCode) localStorage.setItem('gateos_code', data.accessCode);

                mostrarApp();

                if (data.mustChangePassword) {
                    document.getElementById('modal-force-pass').classList.add('active');
                }
            }
        } else {
            // LÓGICA DE TRATAMENTO DE ERROS VISUAIS
            if (alertBox) {
                alertBox.style.display = 'block';
                alertText.innerText = data.error || 'Erro na autenticação. Verifique seus dados.';

                // Textos de ajuda baseados no tipo de erro
                if (data.error && data.error.includes('Limite atingido')) {
                    alertHelp.style.display = 'block';
                    alertHelp.innerText = "O plano contratado pelo seu condomínio não possui mais vagas para novos moradores. Solicite ao seu Síndico que acesse o painel e realize o upgrade de unidades.";
                } else if (data.error && data.error.includes('expirou')) {
                    alertHelp.style.display = 'block';
                    alertHelp.innerText = "Por segurança, os convites duram apenas 15 minutos. Peça para o síndico gerar um novo código no painel de administração.";
                } else {
                    alertHelp.style.display = 'none';
                }
            } else {
                showToast(data.error || 'Erro na autenticação', 'error');
            }
        }
    } catch (err) {
        console.error("Erro disparado no Fetch:", err);
        showToast('Erro de conexão com o servidor.', 'error');
    }
}

function mostrarApp() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    document.getElementById('condo-name-display').innerHTML = escapeHTML(userData.condoName) || 'Condomínio';

    const btnEngrenagem = document.getElementById('btn-engrenagem');

    if (userData.role === 'admin') {
        if (btnEngrenagem) btnEngrenagem.style.display = 'block';

        carregarMoradores();

        // Proteções para caso você já tenha deletado esses painéis antigos
        const financePanel = document.getElementById('finance-panel');
        if (financePanel) financePanel.style.display = 'block';

        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) adminPanel.style.display = 'block';

        const shareCode = document.getElementById('share-code');
        if (shareCode) shareCode.innerText = userData.accessCode || '---';

        const statusSpan = document.getElementById('payment-status');
        if (statusSpan) {
            statusSpan.innerText = userData.statusPagamento || 'DESCONHECIDO';

            if (userData.statusPagamento === 'EM_DIA') {
                statusSpan.style.color = '#10b981';
            } else if (userData.statusPagamento === 'TRIAL') {
                statusSpan.style.color = '#facc15';
            } else {
                statusSpan.style.color = '#ef4444';
            }

            // Atualiza os dados financeiros em tempo real
            fetch(`${API_URL}/financeiro/resumo`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.statusPagamento) {
                        userData.statusPagamento = data.statusPagamento;
                        localStorage.setItem('gateos_status', data.statusPagamento);

                        statusSpan.innerText = data.statusPagamento;

                        if (data.statusPagamento === 'EM_DIA') {
                            statusSpan.style.color = '#10b981'; // Verde
                        } else if (data.statusPagamento === 'TRIAL') {
                            statusSpan.style.color = '#3b82f6'; // Azul
                        } else {
                            statusSpan.style.color = '#ef4444'; // Vermelho
                        }
                    }

                    // Captura a data do Asaas (dueDate) OU a data de expiração do banco (trialEndsAt)
                    const dataBase = (data.resumo && data.resumo.dueDate) ? data.resumo.dueDate : data.trialEndsAt;

                    if (dataBase) {
                        // Formata a data garantindo que não sofra alteração de fuso horário local
                        const dataObj = new Date(dataBase);
                        // Como a data pode vir como YYYY-MM-DD, extraímos direto
                        const dataFormatada = dataBase.includes('T') ? dataObj.toLocaleDateString('pt-BR') : dataBase.split('-').reverse().join('/');

                        const textoPrefixo = data.statusPagamento === 'TRIAL' ? 'Expira em' : 'Vence em';
                        statusSpan.innerHTML += `<br><span style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">${textoPrefixo}: ${dataFormatada}</span>`;
                    }
                }).catch(err => console.error(err));
        }

    } else {
        // Lógica se for Morador
        if (btnEngrenagem) btnEngrenagem.style.display = 'none';

        const addBar = document.getElementById('add-device-bar');
        if (addBar) addBar.style.display = 'none';

        const financePanel = document.getElementById('finance-panel');
        if (financePanel) financePanel.style.display = 'none';

        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) adminPanel.style.display = 'none';
    }

    carregarDevices();
}

function mostrarAuth() {
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
    setType('entrar_condominio');
}

function logout() {
    localStorage.clear();
    token = null;
    mostrarAuth();
}

async function carregarDevices() {
    try {
        const res = await fetch(`${API_URL}/devices`, { headers: { 'Authorization': `Bearer ${token}` } });
        const devices = await res.json();
        const grid = document.getElementById('devicesList');
        grid.innerHTML = '';

        if (devices.length === 0) {
            grid.innerHTML = '<p style="color:#64748b; width:100%;">Nenhum portão cadastrado.</p>';
            return;
        }

        devices.forEach(d => {
            const btnLogs = userData.role === 'admin'
                ? `<button onclick="verLogs('${d.serialNumber}')" style="background:none; border:none; color:#64748b; padding:5px; cursor:pointer;"><span class="material-icons-round">history</span></button>`
                : '';

            const div = document.createElement('div');
            div.className = 'device-card';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h3>${escapeHTML(d.nomeAmigavel)}</h3>
                    ${btnLogs}
                </div>
                <div class="status-badge ${getStatusClass(d.statusUltimo)}">${d.statusUltimo}</div>
                <button onclick="abrirPortao('${d.serialNumber}', this)" class="control-btn">
                    <span class="material-icons-round">power_settings_new</span> ACIONAR
                </button>
            `;
            grid.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

function getStatusClass(status) {
    if (!status) return 'offline';
    const s = status.toUpperCase();
    if (s.includes('ABERTO')) return 'aberto';
    if (s.includes('FECHADO')) return 'fechado';
    if (s.includes('ONLINE')) return 'online'; // <-- Adicionado suporte para ONLINE
    return 'offline';
}

async function adicionarDevice() {
    const nome = document.getElementById('devName').value;
    const serialNumber = document.getElementById('devSN').value;
    const securityCode = document.getElementById('devCode').value;

    const res = await fetch(`${API_URL}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ nomeAmigavel: nome, serialNumber, securityCode })
    });

    if (res.ok) {
        document.getElementById('devName').value = '';
        document.getElementById('devSN').value = '';
        carregarDevices();
        showToast('Portão Adicionado!');
    } else {
        const data = await res.json();
        showToast(data.error || 'Erro ao adicionar', 'error');
    }
}

// Abertura com Trava do Asaas
async function abrirPortao(sn, btnElement) {
    if (navigator.vibrate) navigator.vibrate(50);

    const originalContent = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = `<span class="material-icons-round spin">sync</span> ENVIANDO...`;

    try {
        const res = await fetch(`${API_URL}/devices/${sn}/open`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // BARRADO PELO FINANCEIRO
        if (res.status === 402) {
            throw new Error('BLOCKED');
        }

        if (!res.ok) throw new Error('GENERIC');

        setTimeout(() => {
            carregarDevices();
            showToast('Comando entregue!', 'success');
        }, 1500);

    } catch (e) {
        if (e.message === 'BLOCKED') {
            if (userData.role === 'admin') {
                showToast('Assinatura pendente ou Trial expirado. Efetue o pagamento!', 'error');
            } else {
                showToast('Sistema inoperante, contate seu síndico para averiguar a situação.', 'error');
            }
        } else {
            showToast('Erro ao comunicar com o portão', 'error');
        }
    } finally {
        btnElement.disabled = false;
        btnElement.innerHTML = originalContent;
    }
}

function toggleLogs(show) {
    const modal = document.getElementById('logs-modal');
    show ? modal.classList.add('active') : modal.classList.remove('active');
}

async function verLogs(sn) {
    toggleLogs(true);
    const container = document.getElementById('logs-list');
    container.innerHTML = '<p style="text-align:center;">Carregando...</p>';

    const res = await fetch(`${API_URL}/devices/${sn}/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const logs = await res.json();

    let html = '<table style="width:100%; text-align:left; font-size:0.8rem;">';
    logs.forEach(l => {
        const safeUser = escapeHTML(l.user ? l.user.email.split('@')[0] : 'User');
        const safeAction = escapeHTML(l.acao);
        let unidadeInfo = '';
        if (l.user && l.user.unitNumber) {
            const tipo = l.user.unitType === 'casa' ? 'Casa' : 'Apto';
            const bloco = l.user.unitBlock ? ` Bloco ${l.user.unitBlock}` : '';
            unidadeInfo = ` <span style="color:#64748b; font-size:0.75rem;">(${tipo} ${l.user.unitNumber}${bloco})</span>`;
        }

        html += `<tr>
            <td style="padding:5px; color:var(--primary);">${safeUser}${unidadeInfo}</td>
            <td>${safeAction}</td>
            <td style="color:#64748b;">${new Date(l.dataHora).toLocaleTimeString()}</td>
        </tr>`;
    });
    html += '</table>';
    container.innerHTML = html;
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function toggleUnitFields() {
    const isSingle = document.getElementById('isSingleHouse').checked;
    const detailsDiv = document.getElementById('unit-details');

    if (isSingle) {
        detailsDiv.style.opacity = '0.3';
        detailsDiv.style.pointerEvents = 'none';
        document.getElementById('unitNumber').value = '1';
        document.getElementById('unitBlock').value = 'Único';
    } else {
        detailsDiv.style.opacity = '1';
        detailsDiv.style.pointerEvents = 'auto';
        document.getElementById('unitNumber').value = '';
        document.getElementById('unitBlock').value = '';
    }
}

let countdownInterval;

async function gerarNovoConvite() {
    try {
        const res = await fetch(`${API_URL}/condominio/gerar-convite`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Falha ao gerar código');

        const data = await res.json();
        document.getElementById('share-code').innerText = data.code;

        iniciarCronometro(data.expiresAt);
        showToast('Código gerado com sucesso!', 'success');
    } catch (err) {
        showToast('Erro ao gerar novo código.', 'error');
    }
}

function iniciarCronometro(dataExpiracaoStr) {
    clearInterval(countdownInterval);
    const expireDate = new Date(dataExpiracaoStr).getTime();
    const timerDisplay = document.getElementById('code-timer');

    countdownInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = expireDate - now;

        if (distance <= 0) {
            clearInterval(countdownInterval);
            timerDisplay.innerText = "CÓDIGO EXPIRADO";
            timerDisplay.style.color = "#ef4444";
            document.getElementById('share-code').innerText = "------";
            return;
        }

        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        timerDisplay.innerText = `Expira em: ${minutes}m ${seconds}s`;
        timerDisplay.style.color = "#10b981";
    }, 1000);
}

async function salvarNovaSenha() {
    const newPassword = document.getElementById('new-safe-pass').value;

    if (newPassword.length < 6) {
        showToast('A senha deve ter pelo menos 6 caracteres.', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ newPassword })
        });

        if (res.ok) {
            document.getElementById('modal-force-pass').classList.remove('active');
            showToast('Senha atualizada! Bem-vindo ao GateOS.', 'success');
            mostrarApp();
        } else {
            showToast('Erro ao atualizar a senha.', 'error');
        }
    } catch (err) {
        showToast('Erro de conexão.', 'error');
    }
}

async function gerarPagamento() {
    const btn = document.querySelector('#finance-panel button');
    if (!btn) return;

    const textoOriginal = btn.innerHTML;
    btn.innerHTML = `<span class="material-icons-round spin">sync</span> PROCESSANDO...`;
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/financeiro/checkout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        if (res.ok && data.linkPagamento) {
            window.open(data.linkPagamento, '_blank');
        } else {
            showToast(data.error || 'Erro ao localizar fatura.', 'error');
        }
    } catch (err) {
        showToast('Erro de comunicação com o servidor.', 'error');
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

// ==========================================
// REGISTRO DO SERVICE WORKER (PWA)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registrado com sucesso:', registration.scope);
            })
            .catch(err => {
                console.log('Falha ao registrar o ServiceWorker:', err);
            });
    });
}

// ==========================================
// GESTÃO DE MORADORES E SENHAS (AIRBNB)
// ==========================================

// Para qualquer usuário mudar a PRÓPRIA senha
function abrirModalMinhaSenha() {
    document.getElementById('new-safe-pass').value = '';
    document.getElementById('modal-force-pass').classList.add('active');
}

// Carrega os moradores apenas se for o Síndico (chame dentro do mostrarApp())
async function carregarMoradores() {
    try {
        const res = await fetch(`${API_URL}/condominio/moradores`, { headers: { 'Authorization': `Bearer ${token}` } });
        const moradores = await res.json();
        const container = document.getElementById('moradores-list');
        container.innerHTML = '';

        if (moradores.length === 0) {
            container.innerHTML = '<p style="color:#64748b; font-size: 0.85rem;">Nenhum morador na base.</p>';
            return;
        }

        moradores.forEach(m => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding: 8px 0; font-size: 0.85rem;';
            const tipo = m.unitType === 'casa' ? 'Casa' : 'Apto';
            const bloco = m.unitBlock ? ` Bl. ${m.unitBlock}` : '';

            div.innerHTML = `
                <div style="color: #cbd5e1;">
                    <strong>${escapeHTML(m.email.split('@')[0])}</strong> <span style="color:#64748b">(${tipo} ${m.unitNumber}${bloco})</span>
                </div>
                <div>
                    <button onclick="abrirModalSenhaAdmin('${m.id}', '${m.email}')" style="background:none; border:none; color:var(--primary); cursor:pointer; margin-right: 10px;" title="Alterar Senha do Morador">
                        <span class="material-icons-round" style="font-size: 1.1rem;">password</span>
                    </button>
                    <button onclick="removerMorador('${m.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer;" title="Revogar Acesso (Excluir)">
                        <span class="material-icons-round" style="font-size: 1.1rem;">delete_forever</span>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

function abrirModalSenhaAdmin(id, email) {
    document.getElementById('morador-id-modal').value = id;
    document.getElementById('morador-nome-modal').innerText = `Definindo nova senha para: ${email}`;
    document.getElementById('nova-senha-morador').value = '';
    document.getElementById('modal-morador-senha').classList.add('active');
}

function fecharModalMorador() {
    document.getElementById('modal-morador-senha').classList.remove('active');
}

async function salvarSenhaMoradorAdmin() {
    const id = document.getElementById('morador-id-modal').value;
    const novaSenha = document.getElementById('nova-senha-morador').value;

    if (novaSenha.length < 6) return showToast('A senha deve ter no mínimo 6 caracteres.', 'error');

    try {
        const res = await fetch(`${API_URL}/condominio/moradores/${id}/senha`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ novaSenha })
        });
        if (res.ok) {
            showToast('Senha do morador alterada!', 'success');
            fecharModalMorador();
        } else {
            showToast('Erro ao alterar senha', 'error');
        }
    } catch (e) { showToast('Erro de conexão', 'error'); }
}

async function removerMorador(id) {
    if (!confirm('Deseja excluir permanentemente este morador? O acesso dele será cortado na hora.')) return;
    try {
        const res = await fetch(`${API_URL}/condominio/moradores/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('Morador expulso do sistema!', 'success');
            carregarMoradores();
        }
    } catch (e) { showToast('Erro ao excluir', 'error'); }
}

function abrirConfiguracoes() {
    document.getElementById('modal-configuracoes').classList.add('active');
    carregarMoradores(); // Carrega os inquilinos só quando abre a engrenagem
}
function fecharConfiguracoes() {
    document.getElementById('modal-configuracoes').classList.remove('active');
}