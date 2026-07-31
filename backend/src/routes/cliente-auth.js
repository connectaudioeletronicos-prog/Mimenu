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
router.post('/google', limitadorLogin, contaClienteController.loginGoogle);
router.post('/google/finalizar', limitadorLogin, contaClienteController.finalizarCadastroGoogle);
router.post('/esqueci-senha', limitadorLogin, contaClienteController.esqueciSenha);

router.get('/me', contaClienteController.autenticarCliente, contaClienteController.obterMeusDados);
router.put('/me', contaClienteController.autenticarCliente, contaClienteController.atualizarMeusDados);

module.exports = router;
