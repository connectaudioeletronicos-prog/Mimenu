// ===================================================================
// Rotas de CONVITES DE CADASTRO (link unico de uso unico para lojista)
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const conviteController = require('../controllers/conviteController');

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});

// Gerar um novo convite (protegido pela chave mestra, so voce usa)
router.post('/gerar', limitador, conviteController.gerarConvite);

// Verificar se um convite ainda e valido (chamado pela tela de cadastro)
router.get('/:token/validar', limitador, conviteController.validarConvite);

// Listar convites gerados (protegido pela chave mestra)
router.get('/', conviteController.listarConvites);

module.exports = router;

