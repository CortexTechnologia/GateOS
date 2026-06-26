const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { authenticate, isAdmin } = require('../middlewares/auth');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

router.use(authenticate, isAdmin);

router.post('/gerar-convite', async (req, res) => {
    try {
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await prisma.condominio.update({
            where: { id: req.user.condominioId },
            data: { accessCode: code, codeExpiresAt: expiresAt }
        });

        res.json({ code, expiresAt });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao gerar token temporário' });
    }
});

router.put('/atualizar-unidades', async (req, res) => {
    const { novaQuantidade } = req.body;

    if (!novaQuantidade || novaQuantidade < 1) {
        return res.status(400).json({ error: 'Quantidade inválida.' });
    }

    try {
        const condominio = await prisma.condominio.findUnique({ where: { id: req.user.condominioId } });
        
        // Impede que ele reduza para um número menor do que a quantidade de moradores já cadastrados
        const moradoresAtuais = await prisma.user.count({ where: { condominioId: condominio.id } });
        if (novaQuantidade < moradoresAtuais) {
            return res.status(400).json({ 
                error: `Você já tem ${moradoresAtuais} moradores cadastrados. Remova acessos antigos antes de reduzir o plano.` 
            });
        }

        // 1. Atualiza no nosso banco de dados
        await prisma.condominio.update({
            where: { id: req.user.condominioId },
            data: { qtdUnidades: novaQuantidade }
        });

        // 2. Se ele já tiver integração financeira, avisa o Asaas da mudança de valor!
        if (condominio.asaasId) {
            const VALOR_POR_UNIDADE = 5.00;
            const novoValorTotal = novaQuantidade * VALOR_POR_UNIDADE;
            
            // Aqui você chamaria uma função do seu asaasService para atualizar a assinatura
            // await asaasService.atualizarValorAssinatura(condominio.asaasId, novoValorTotal);
        }

        res.json({ message: 'Plano atualizado com sucesso!', unidades: novaQuantidade });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao atualizar dados do condomínio.' });
    }
});

// ==========================================
// GESTÃO DE MORADORES E INQUILINOS
// ==========================================

// 1. Listar todos os moradores
router.get('/moradores', async (req, res) => {
    try {
        const moradores = await prisma.user.findMany({
            where: { condominioId: req.user.condominioId, role: 'morador' },
            select: { id: true, email: true, unitType: true, unitNumber: true, unitBlock: true }
        });
        res.json(moradores);
    } catch (e) {
        res.status(500).json({ error: 'Erro ao buscar moradores' });
    }
});

// 2. Síndico altera a senha de um morador (Airbnb)
router.put('/moradores/:id/senha', async (req, res) => {
    const { novaSenha } = req.body;
    if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ error: 'Mínimo de 6 caracteres.' });

    try {
        const hash = await bcrypt.hash(novaSenha, 10);
        await prisma.user.updateMany({
            where: { id: req.params.id, condominioId: req.user.condominioId },
            data: { password: hash }
        });
        res.json({ message: 'Senha atualizada com sucesso!' });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao alterar senha do morador.' });
    }
});

// 3. Síndico exclui o inquilino (Fim do Airbnb)
router.delete('/moradores/:id', async (req, res) => {
    try {
        await prisma.user.deleteMany({
            where: { id: req.params.id, condominioId: req.user.condominioId }
        });
        res.json({ message: 'Acesso do morador revogado!' });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao remover morador.' });
    }
});

module.exports = router;