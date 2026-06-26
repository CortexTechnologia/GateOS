const prisma = require('../config/prisma');
const { mqttClient } = require('../config/mqtt');

exports.listarDispositivos = async (req, res) => {
    try {
        const devices = await prisma.device.findMany({ where: { condominioId: req.user.condominioId } });
        res.json(devices);
    } catch (e) { 
        res.status(500).json({error: 'Erro ao buscar dispositivos'}); 
    }
};

exports.cadastrarDispositivo = async (req, res) => {
    const { nomeAmigavel, serialNumber, securityCode } = req.body;
    if (!serialNumber || !nomeAmigavel) return res.status(400).json({error: "Dados incompletos"});

    try {
        const existingDevice = await prisma.device.findUnique({ where: { serialNumber } });
        
        if (existingDevice && existingDevice.condominioId !== null && existingDevice.condominioId !== req.user.condominioId) {
            return res.status(403).json({ error: 'Este dispositivo já está vinculado a outro condomínio.' });
        }

        await prisma.device.upsert({
            where: { serialNumber },
            update: {
                nomeAmigavel, 
                securityCode: securityCode || '1234',
                condominioId: req.user.condominioId
            },
            create: {
                serialNumber,
                nomeAmigavel, 
                securityCode: securityCode || '1234',
                condominioId: req.user.condominioId
            }
        });
        
        res.sendStatus(201);
    } catch (e) { 
        console.error(e);
        res.status(400).json({ error: 'Erro ao cadastrar' }); 
    }
};

exports.abrirPortao = async (req, res) => {
    const { sn } = req.params;
    try {
        const device = await prisma.device.findFirst({ where: { serialNumber: sn, condominioId: req.user.condominioId } });
        if (!device) return res.status(403).json({ error: 'Sem permissão' });

        const payload = `${device.securityCode}:ABRIR_PORTAO_AGORA`;
        mqttClient.publish(`gate/${sn}/cmd`, payload);

        await prisma.log.create({ 
            data: { userId: req.user.id, deviceSerialNumber: sn, acao: 'ACIONOU_ABERTURA' } 
        });
        res.sendStatus(200);
    } catch(e) { 
        res.status(500).json({error: 'Erro no comando'}); 
    }
};

exports.verLogs = async (req, res) => {
    const { sn } = req.params;
    try {
        const device = await prisma.device.findFirst({ where: { serialNumber: sn, condominioId: req.user.condominioId } });
        if (!device) return res.status(403).json({ error: 'Sem permissão' });

        const logs = await prisma.log.findMany({
            where: { deviceSerialNumber: sn },
            include: {
                user: {
                    select: { email: true, unitType: true, unitNumber: true, unitBlock: true }
                }
            }, 
            orderBy: { dataHora: 'desc' },
            take: 50
        });
        res.json(logs);
    } catch(e) { 
        res.status(500).json({error: 'Erro ao buscar logs'}); 
    }
};

exports.ativarLicencaHome = async (req, res) => {
    const { email, mac, sinricId } = req.body;

    if (!email || !mac) {
        return res.status(400).json({ error: "Dados incompletos" });
    }

    try {
        // Usa o 'upsert' do Prisma para criar ou atualizar o registo
        await prisma.device.upsert({
            where: { serialNumber: mac }, // Usamos o MAC Address como S/N
            update: {
                nomeAmigavel: `GateOS Home - ${email}`,
                // Pode guardar o e-mail num campo de observação se não quiser misturar as tabelas
                statusUltimo: `ONLINE - Proprietário: ${email}` 
            },
            create: {
                serialNumber: mac,
                nomeAmigavel: `GateOS Home - ${email}`,
                statusUltimo: `ONLINE - Proprietário: ${email}`,
                securityCode: sinricId // Guardamos o ID do Sinric para referência
                // Nota: condominioId fica 'null' porque é uma casa individual
            }
        });

        console.log(`[CORTEX] Novo GateOS Home ativado! Cliente: ${email} | MAC: ${mac}`);
        res.status(200).json({ message: "Ativação recebida com sucesso" });
    } catch (e) {
        console.error("Erro ao ativar GateOS Home:", e);
        res.status(500).json({ error: "Erro interno" });
    }
};