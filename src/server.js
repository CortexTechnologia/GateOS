require('dotenv').config();
const app = require('./app');
const { initMqtt } = require('./config/mqtt');

const PORT = process.env.PORT || 3000;

// Inicia a escuta do MQTT
initMqtt();

app.listen(PORT, () => console.log(`🚀 GateOS rodando na porta ${PORT} com Prisma ORM!`));