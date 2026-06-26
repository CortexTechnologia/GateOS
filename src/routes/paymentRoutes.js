const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { authenticate, isAdmin } = require('../middlewares/auth');
const asaasService = require('../services/asaasService');

router.post('/checkout', authenticate, isAdmin, async (req, res) => {
    try {
        const condominio = await prisma.condominio.findUnique({ where: { id: req.user.condominioId } });
        if (!condominio) return res.status(404).json({ error: 'Condomínio não encontrado.' });

        const VALOR_POR_UNIDADE = 5.00;

        // Se o cliente AINDA NÃO EXISTE no Asaas, nós o criamos agora!
        if (!condominio.asaasId) {
            // 1. Cria o cliente
            const clienteAsaas = await asaasService.criarCliente(condominio.nome, req.user.email, condominio.cnpj);
            
            // 2. Cria a assinatura baseada na quantidade de unidades
            const valorTotal = condominio.qtdUnidades * VALOR_POR_UNIDADE;
            
            // --> CORREÇÃO: Gerando a data de hoje no formato YYYY-MM-DD para o Asaas
            const hoje = new Date();
            const dataVencimento = hoje.toISOString().split('T')[0];

            // Passando os 3 parâmetros corretamente!
            const assinatura = await asaasService.criarAssinatura(clienteAsaas.id, valorTotal, dataVencimento);
            
            // 3. Salva o ID no nosso banco para as próximas vezes
            await prisma.condominio.update({ 
                where: { id: condominio.id },
                data: { asaasId: clienteAsaas.id }
            });

            return res.json({ linkPagamento: assinatura.invoiceUrl });
        }

        // Se ele JÁ EXISTE, apenas buscamos a fatura pendente
        const linkPagamento = await asaasService.obterFaturaPendente(condominio.asaasId);

        if (linkPagamento) {
            res.json({ linkPagamento });
        } else {
            res.status(404).json({ error: 'Você não tem faturas em aberto no momento!' });
        }
    } catch (err) {
        console.error("Erro no checkout:", err);
        res.status(500).json({ error: 'Erro ao conectar com a operadora financeira.' });
    }
});

router.post('/webhook', async (req, res) => {
    const webhookToken = req.headers['asaas-access-token'];
    
    if (webhookToken !== process.env.ASAAS_WEBHOOK_TOKEN) {
        return res.status(401).json({ error: 'Acesso negado.' });
    }

    const { event, payment } = req.body;
    if (!event || !payment || !payment.customer) return res.status(400).json({ error: 'Estrutura inválida.' });

    res.sendStatus(200);

    setImmediate(async () => {
        try {
            const condominio = await prisma.condominio.findFirst({ where: { asaasId: payment.customer } });
            if (!condominio) return;

            switch (event) {
                case 'PAYMENT_RECEIVED':
                case 'PAYMENT_CONFIRMED':
                    await prisma.condominio.update({ 
                        where: { id: condominio.id }, data: { statusPagamento: 'EM_DIA' } 
                    });
                    break;
                case 'PAYMENT_OVERDUE':
                    await prisma.condominio.update({ 
                        where: { id: condominio.id }, data: { statusPagamento: 'PENDENTE' } 
                    });
                    break;
            }
        } catch (err) {
            console.error('Erro webhook:', err);
        }
    });
});
// Rota para puxar as informações rápidas pro Dashboard
router.get('/resumo', authenticate, isAdmin, async (req, res) => {
    try {
        const condominio = await prisma.condominio.findUnique({ where: { id: req.user.condominioId } });
        
        if (!condominio) {
            return res.json({ statusPagamento: 'DESCONHECIDO', resumo: null });
        }

        let resumo = null;
        let statusOficial = condominio.statusPagamento;

        // Só busca no Asaas se o cliente já tiver um ID lá
        if (condominio.asaasId) {
            resumo = await asaasService.obterResumoFinanceiro(condominio.asaasId);

            // ==========================================
            // SISTEMA DE AUTO-HEALING (Sincronia Forçada)
            // ==========================================
            if (resumo && resumo.dueDate) {
                // Pega a data de vencimento que veio do Asaas (Ex: 2026-07-26) e compara com hoje
                const dataVencimento = new Date(resumo.dueDate + 'T23:59:59'); 
                const hoje = new Date();

                // Se a fatura vence no futuro e o banco está travado em PENDENTE ou TRIAL, o sistema se conserta!
                if (dataVencimento > hoje && statusOficial !== 'EM_DIA') {
                    await prisma.condominio.update({
                        where: { id: condominio.id },
                        data: { statusPagamento: 'EM_DIA' }
                    });
                    statusOficial = 'EM_DIA';
                    console.log(`[GateOS] Status do condomínio ${condominio.nome} auto-corrigido para EM_DIA`);
                }
            }
        }

        // Retorna o status oficial sincronizado + os dados do Asaas
        res.json({ 
            statusPagamento: statusOficial, 
            resumo,
            trialEndsAt: condominio.trialEndsAt
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar resumo financeiro.' });
    }
});
module.exports = router;