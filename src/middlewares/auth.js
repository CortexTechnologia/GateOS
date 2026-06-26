const jwt = require('jsonwebtoken');
require('dotenv').config();
const prisma = require('../config/prisma');

const SECRET_KEY = process.env.JWT_SECRET || 'gateos_super_secret_key_prod';

const authenticate = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.sendStatus(403);
        req.user = decoded;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas síndicos podem fazer isso.' });
    next();
};

const isSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acesso negado. Nível de permissão insuficiente.' });
    }
    next();
};

const checkSubscription = async (req, res, next) => {
    try {
        const condo = await prisma.condominio.findUnique({ where: { id: req.user.condominioId } });
        if (!condo) return res.status(403).json({ error: 'Condomínio inválido' });

        if (condo.statusPagamento === 'EM_DIA') {
            return next();
        }

        if (condo.statusPagamento === 'TRIAL') {
            if (condo.trialEndsAt && new Date() > new Date(condo.trialEndsAt)) {
                await prisma.condominio.update({ 
                    where: { id: condo.id }, 
                    data: { statusPagamento: 'PENDENTE' } 
                });
                return res.status(402).json({ error: 'Período de teste encerrado. Fatura pendente.' });
            }
            return next();
        }

        return res.status(402).json({ error: 'Acesso bloqueado. Assinatura pendente.' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao verificar status da assinatura.' });
    }
};

module.exports = { authenticate, isAdmin, isSuperAdmin, SECRET_KEY, checkSubscription };