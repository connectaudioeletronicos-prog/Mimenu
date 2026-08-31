// ===================================================================
// Rotas de CONVITES DE CADASTRO (link unico de uso unico para lojista)
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const conviteController = require('../controllers/conviteController');
const linkAutoatendimentoController = require('../controllers/linkAutoatendimentoController');
const { uploadDocumentos } = require('../middlewares/upload');

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

// --- Links de autoatendimento (completar KYC / editar contato) -------
// Usam o mesmo token/tabela dos convites acima, diferenciados por
// "tipo". Veja backend/src/controllers/linkAutoatendimentoController.js
router.post('/:token/completar-kyc', limitador, uploadDocumentos.fields([
  { name: 'documento_identidade_frente', maxCount: 1 },
  { name: 'documento_identidade_verso', maxCount: 1 },
  { name: 'comprovante_residencia', maxCount: 1 }
]), linkAutoatendimentoController.completarKyc);

router.put('/:token/editar-contato', limitador, linkAutoatendimentoController.editarContato);

module.exports = router;

