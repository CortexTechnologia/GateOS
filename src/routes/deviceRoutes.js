const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { authenticate, isAdmin, checkSubscription } = require('../middlewares/auth');

router.post('/home/ativar', deviceController.ativarLicencaHome);

router.use(authenticate);

router.get('/', deviceController.listarDispositivos);
router.post('/', isAdmin, deviceController.cadastrarDispositivo);

// AQUI ESTÁ A TRAVA FINANCEIRA 🔒
router.post('/:sn/open', checkSubscription, deviceController.abrirPortao);

router.get('/:sn/logs', isAdmin, deviceController.verLogs);

module.exports = router;