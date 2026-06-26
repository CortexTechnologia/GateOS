const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit');
const xss = require('xss'); 

const applyHelmet = helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
});

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "Muitas tentativas. Tente novamente em 15 minutos." }
});

const sanitizeInput = (req, res, next) => {
    if (req.body) {
        for (let key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = xss(req.body[key]);
            }
        }
    }
    next();
};

const paymentLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Hora
    max: 10, // Máximo de 10 tentativas de gerar fatura por hora por IP
    message: { error: "Muitas requisições de pagamento. Tente mais tarde." }
});

module.exports = { applyHelmet, limiter, sanitizeInput, paymentLimiter };