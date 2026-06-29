// ===================================================================
// Rotas de autenticacao
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' }
});

router.post('/login', limitadorLogin, authController.login);
router.put('/trocar-senha', autenticar, authController.trocarSenha);
router.post('/cadastrar', limitadorLogin, authController.cadastrar);

module.exports = router;
