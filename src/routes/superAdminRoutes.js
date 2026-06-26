const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); 
const prisma = require('../config/prisma');
const { authenticate, isSuperAdmin } = require('../middlewares/auth');
const asaasService = require('../services/asaasService');
const crypto = require('crypto');

router.use(authenticate, isSuperAdmin);

router.get('/condominios', async (req, res) => {
    try {
        const condominios = await prisma.condominio.findMany({
            include: {
                users: {
                    where: { role: 'admin' },
                    select: { nome: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        // Formata para o FrontEnd antigo não quebrar
        const formatados = condominios.map(c => ({
            ...c, Users: c.users 
        }));
        res.json(formatados);
    } catch (e) {
        console.error('Erro ao listar condomínios:', e);
        res.status(500).json({ error: 'Erro interno ao buscar clientes.' });
    }
});

router.post('/condominios', async (req, res) => {
    const { nome, cnpj, qtdUnidades, nomeSindico, emailSindico, senhaProvisoria } = req.body;
    const VALOR_POR_UNIDADE = 5.00;
    const qtdParsed = parseInt(qtdUnidades, 10) || 0;
    const valorTotalMensalidade = qtdParsed * VALOR_POR_UNIDADE;

    try {
        const userExists = await prisma.user.findUnique({ where: { email: emailSindico } });
        if (userExists) return res.status(400).json({ error: 'Este e-mail já está em uso.' });

        const clienteAsaas = await asaasService.criarCliente(nome, emailSindico, cnpj);
        
        const dataFimTrial = new Date();
        dataFimTrial.setDate(dataFimTrial.getDate() + 7);
        const dataFormatadaAsaas = dataFimTrial.toISOString().split('T')[0];

        await asaasService.criarAssinatura(clienteAsaas.id, valorTotalMensalidade, dataFormatadaAsaas);

        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        
        const novoCondominio = await prisma.condominio.create({ 
            data: {
                nome, 
                accessCode: code,
                cnpj: cnpj, 
                qtdUnidades: qtdParsed,
                asaasId: clienteAsaas.id, 
                trialEndsAt: dataFimTrial,
                statusPagamento: 'TRIAL'
            }
        });

        const hash = await bcrypt.hash(senhaProvisoria, 10);

        await prisma.user.create({
            data: {
                nome: nomeSindico,
                email: emailSindico,
                password: hash,
                role: 'admin',
                condominioId: novoCondominio.id,
                mustChangePassword: true
            }
        });
        
        res.status(201).json({ message: 'Cliente provisionado!', accessCode: code });
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: e.message || 'Erro ao provisionar cliente.' });
    }
});

router.put('/condominios/:id', async (req, res) => {
    const { nome, qtdUnidades } = req.body;
    try {
        const condominio = await prisma.condominio.findUnique({ where: { id: req.params.id } });
        if (!condominio) return res.status(404).json({ error: 'Condomínio não encontrado.' });

        await prisma.condominio.update({ 
            where: { id: req.params.id },
            data: { 
                nome: nome || condominio.nome, 
                qtdUnidades: parseInt(qtdUnidades, 10) || condominio.qtdUnidades 
            }
        });
        res.json({ message: 'Dados atualizados com sucesso!' });
    } catch (e) {
        console.error('Erro ao atualizar condomínio:', e);
        res.status(500).json({ error: 'Erro interno ao salvar edição.' });
    }
});

module.exports = router;