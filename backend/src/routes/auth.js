// ===================================================================
// Rotas de autenticacao
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');
const { uploadDocumentos } = require('../middlewares/upload');

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' }
});

const camposCadastro = uploadDocumentos.fields([
  { name: 'documento_identidade', maxCount: 1 },
  { name: 'comprovante_residencia', maxCount: 1 }
]);

router.post('/login', limitadorLogin, authController.login);
router.put('/trocar-senha', autenticar, authController.trocarSenha);
router.post('/cadastrar', limitadorLogin, camposCadastro, authController.cadastrar);
router.post('/esqueci-senha', limitadorLogin, authController.esqueciSenha);
router.post('/redefinir-senha', limitadorLogin, authController.redefinirSenha);

module.exports = router;
