const mqtt = require('mqtt');
const prisma = require('./prisma'); // <-- Importando o Prisma no lugar da pasta models!

// Configuração de conexão lendo do seu .env
const mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`, {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    clientId: `gateos_server_${Math.random().toString(16).slice(3)}`
});

const initMqtt = () => {
    mqttClient.on('connect', () => {
        console.log('📡 Conectado ao Broker MQTT (HiveMQ)');
        mqttClient.subscribe('gate/+/status'); // Escuta o status de qualquer placa ESP32
    });

    mqttClient.on('message', async (topic, message) => {
        const topicParts = topic.split('/');
        
        // Exemplo de tópico: gate/SN12345/status
        if (topicParts.length === 3 && topicParts[2] === 'status') {
            const serialNumber = topicParts[1];
            const status = message.toString();

            try {
                // A atualização de status agora usando a sintaxe do Prisma ORM
                await prisma.device.update({
                    where: { serialNumber: serialNumber },
                    data: { statusUltimo: status }
                });
            } catch (err) {
                // Se o dispositivo ainda não foi cadastrado no painel, apenas ignoramos
            }
        }
    });
};

module.exports = { mqttClient, initMqtt };