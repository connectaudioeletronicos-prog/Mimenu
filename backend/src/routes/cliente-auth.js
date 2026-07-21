// ===================================================================
// Rotas de autenticacao - conta do cliente (aplicativo do cliente)
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const contaClienteController = require('../controllers/contaClienteController');

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});

router.post('/cadastrar', limitadorLogin, contaClienteController.cadastrar);
router.post('/login', limitadorLogin, contaClienteController.login);
router.post('/esqueci-senha', limitadorLogin, contaClienteController.esqueciSenha);

module.exports = router;
