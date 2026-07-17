// ===================================================================
// Rotas do PAINEL SUPER-ADMIN
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const painelController = require('../controllers/painelController');

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { erro: 'Muitas requisicoes. Aguarde alguns minutos e tente novamente.' }
});

router.get('/estabelecimentos', limitador, painelController.listarEstabelecimentos);
router.put('/estabelecimentos/:id/status', limitador, painelController.alternarStatusEstabelecimento);
router.put('/convites/:id/cancelar', limitador, painelController.cancelarConvite);

module.exports = router;
