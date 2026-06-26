const axios = require('axios');

// Alterna automaticamente entre Sandbox (Testes) e Produção
const ASAAS_URL = process.env.NODE_ENV === 'production' 
    ? 'https://api.asaas.com/v3' 
    : 'https://sandbox.asaas.com/api/v3';

const asaasApi = axios.create({
    baseURL: ASAAS_URL,
    headers: {
        'access_token': process.env.ASAAS_API_KEY,
        'Content-Type': 'application/json'
    }
});

exports.criarCliente = async (nome, email, cpfCnpj) => {
    try {
        const response = await asaasApi.post('/customers', {
            name: nome,
            email: email,
            cpfCnpj: cpfCnpj
        });
        return response.data; // Retorna os dados, incluindo o id (cus_...)
    } catch (error) {
        console.error('Erro ao criar cliente no Asaas:', error.response?.data || error.message);
        throw new Error('Falha na integração de cliente (Asaas)');
    }
};

exports.criarAssinatura = async (customerId, valorTotal, dataPrimeiroVencimento) => {
    try {
        const response = await asaasApi.post('/subscriptions', {
            customer: customerId,
            billingType: 'UNDEFINED', 
            value: valorTotal,
            nextDueDate: dataPrimeiroVencimento, 
            cycle: 'MONTHLY', 
            description: 'Licença de Uso - GateOS',
            // ==========================================
            // MÁGICA DO REDIRECIONAMENTO (UX)
            // ==========================================
            callback: {
                successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login.html?pagamento=sucesso`,
                autoRedirect: true
            }
        });
        return response.data; 
    } catch (error) {
        console.error('Erro ao criar assinatura no Asaas:', error.response?.data || error.message);
        throw new Error('Falha ao gerar cobrança recorrente (Asaas)');
    }
};

exports.obterFaturaPendente = async (customerId) => {
    try {
        // Busca faturas PENDENTES
        const responsePending = await asaasApi.get(`/payments?customer=${customerId}&status=PENDING`);
        if (responsePending.data.data && responsePending.data.data.length > 0) {
            return responsePending.data.data[0].invoiceUrl; // Retorna o link da fatura mais recente
        }
        
        // Se não achar pendente, busca se tem alguma ATRASADA
        const responseOverdue = await asaasApi.get(`/payments?customer=${customerId}&status=OVERDUE`);
        if (responseOverdue.data.data && responseOverdue.data.data.length > 0) {
            return responseOverdue.data.data[0].invoiceUrl;
        }

        return null; // Nenhuma fatura em aberto
    } catch (error) {
        console.error('Erro ao buscar fatura no Asaas:', error.response?.data || error.message);
        throw new Error('Falha ao consultar faturas.');
    }
};
exports.obterResumoFinanceiro = async (customerId) => {
    try {
        // 1. Busca a assinatura ATIVA do cliente para pegar a data do próximo ciclo (Daqui a 30 dias)
        const subRes = await asaasApi.get(`/subscriptions?customer=${customerId}&status=ACTIVE`);
        
        if (subRes.data.data && subRes.data.data.length > 0) {
            return {
                dueDate: subRes.data.data[0].nextDueDate, // Traz o vencimento do mês que vem!
                value: subRes.data.data[0].value
            };
        }

        // 2. Fallback de Segurança: Se por acaso ele não tiver assinatura, busca a fatura PENDENTE isolada
        const res = await asaasApi.get(`/payments?customer=${customerId}&status=PENDING&limit=1`);
        
        if (res.data.data && res.data.data.length > 0) {
            return {
                dueDate: res.data.data[0].dueDate, 
                value: res.data.data[0].value
            };
        }
        
        return null; // Se não achar nada, retorna null para o painel
    } catch (error) {
        console.error('Erro ao buscar resumo:', error.message);
        return null;
    }
};