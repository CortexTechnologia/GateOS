const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth'); // <-- AQUI! Importando o middleware

// Rotas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/super-login', authController.superLogin);

// Rotas protegidas (exigem o token)
router.post('/change-password', authenticate, authController.changeInitialPassword);

module.exports = router;