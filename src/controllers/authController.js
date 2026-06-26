const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { SECRET_KEY } = require('../middlewares/auth');
const crypto = require('crypto');

exports.register = async (req, res) => {
    // Recebendo os dados, incluindo cnpj e qtdUnidades para o registro do plano
    const { email, password, tipo, nomeCondominio, cnpj, qtdUnidades, codigoAcesso, unitType, unitNumber, unitBlock } = req.body;

    try {
        const hash = await bcrypt.hash(password, 10);
        let condominio;

        if (tipo === 'novo_condominio') {
            // Criação de um novo condomínio (Síndico)
            const code = crypto.randomBytes(3).toString('hex').toUpperCase();
            
            // ---> ADICIONE ESTAS DUAS LINHAS PARA CALCULAR O TRIAL <---
            const dataTrial = new Date();
            dataTrial.setDate(dataTrial.getDate() + 7); // Dá 7 dias de graça

            condominio = await prisma.condominio.create({
                data: {
                    nome: nomeCondominio,
                    cnpj: cnpj,
                    qtdUnidades: parseInt(qtdUnidades),
                    accessCode: code,
                    trialEndsAt: dataTrial // ---> SALVA A DATA NO BANCO <---
                }
            });

            await prisma.user.create({
                data: {
                    email, 
                    password: hash, 
                    role: 'admin', 
                    condominioId: condominio.id,
                    unitType, 
                    unitNumber, 
                    unitBlock
                }
            });
        } else {
            // Tentativa de entrada de um morador usando convite
            condominio = await prisma.condominio.findFirst({ where: { accessCode: codigoAcesso } });

            if (!condominio) return res.status(404).json({ error: 'Código inválido.' });

            if (!condominio.codeExpiresAt || new Date() > condominio.codeExpiresAt) {
                return res.status(403).json({ error: 'Este código expirou. Peça ao síndico para gerar um novo.' });
            }

            // ==========================================
            // NOVA TRAVA DE NEGÓCIO: Limite de Contas
            // ==========================================
            const totalUsuariosAtuais = await prisma.user.count({
                where: { condominioId: condominio.id, role: 'morador' }
            });

            // Se o limite foi atingido, bloqueia o cadastro
            if (condominio.qtdUnidades && totalUsuariosAtuais >= condominio.qtdUnidades) {
                return res.status(403).json({
                    error: `Limite atingido. O plano atual suporta no máximo ${condominio.qtdUnidades} moradores.`
                });
            }

            // Se passou da trava, cadastra o usuário normalmente
            await prisma.user.create({
                data: {
                    email,
                    password: hash,
                    role: 'morador',
                    condominioId: condominio.id,
                    unitType,
                    unitNumber,
                    unitBlock
                }
            });
        }
        res.status(201).json({ message: 'Conta criada com sucesso!' });
    } catch (e) {
        console.error("Erro no registro:", e);
        res.status(400).json({ error: 'Erro ao criar conta. Verifique os dados.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Busca o usuário pelo e-mail
        const user = await prisma.user.findUnique({
            where: { email: email }
        });

        // 2. Validação unificada: não revela se o e-mail não existe ou a senha está errada
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(400).json({ error: 'E-mail ou senha incorretos.' });
        }

        // 3. Gera o token JWT
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            role: user.role,
            condominioId: user.condominioId
        }, SECRET_KEY);

        // 4. Busca dados do condomínio para o Frontend
        const condominio = await prisma.condominio.findUnique({
            where: { id: user.condominioId }
        });

        // 5. Retorna o sucesso com dados protegidos
        res.json({
            token,
            email: user.email,
            role: user.role,
            condominioNome: condominio ? condominio.nome : 'Sem Condomínio',
            accessCode: user.role === 'admin' && condominio ? condominio.accessCode : null,
            mustChangePassword: user.mustChangePassword,
            statusPagamento: condominio ? condominio.statusPagamento : 'TRIAL'
        });

    } catch (e) {
        // Log técnico apenas no servidor (para você monitorar no terminal)
        console.error("Erro crítico no login:", e);

        // Mensagem genérica e profissional para o usuário final
        res.status(500).json({
            error: 'Estamos com instabilidade no momento. Tente novamente em alguns minutos.'
        });
    }
};

exports.superLogin = (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.SUPER_ADMIN_EMAIL && password === process.env.SUPER_ADMIN_PASS) {
        const token = jwt.sign({
            id: 'cortex-master', email: email, role: 'superadmin'
        }, process.env.JWT_SECRET || 'gateos_super_secret_key_prod', { expiresIn: '8h' });
        return res.json({ token, role: 'superadmin', nome: 'Cortex Technologia' });
    }
    return res.status(401).json({ error: 'Credenciais master inválidas.' });
};

exports.changeInitialPassword = async (req, res) => {
    const { newPassword } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const hash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hash, mustChangePassword: false }
        });

        res.json({ message: 'Senha atualizada com sucesso!' });
    } catch (e) {
        console.error("Erro ao alterar senha:", e);
        res.status(500).json({ error: 'Erro ao atualizar senha' });
    }
};