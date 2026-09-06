// ===================================================================
// Rotas do PAINEL SUPER-ADMIN
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const painelController = require('../controllers/painelController');
const comunicacaoController = require('../controllers/comunicacaoController');
const suporteController = require('../controllers/suporteController');
const blogController = require('../controllers/blogController');
const upload = require('../middlewares/upload');

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { erro: 'Muitas requisicoes. Aguarde alguns minutos e tente novamente.' }
});

router.get('/estabelecimentos', limitador, painelController.listarEstabelecimentos);
router.get('/estabelecimentos/:id', limitador, painelController.buscarEstabelecimentoDetalhe);
router.put('/estabelecimentos/:id', limitador, painelController.atualizarEstabelecimentoDetalhe);
router.put('/estabelecimentos/:id/status', limitador, painelController.alternarStatusEstabelecimento);
router.post('/estabelecimentos/:id/links', limitador, painelController.gerarLinkAutoatendimento);
router.delete('/estabelecimentos/:id', limitador, painelController.excluirEstabelecimento);
router.put('/convites/:id/cancelar', limitador, painelController.cancelarConvite);

router.get('/contatos', limitador, comunicacaoController.listarContatos);
router.post('/contatos/email', limitador, comunicacaoController.enviarEmail);

router.get('/suporte/tickets', limitador, suporteController.listarTicketsAdmin);
router.get('/suporte/tickets/:id', limitador, suporteController.buscarTicketAdmin);
router.post('/suporte/tickets/:id/mensagens', limitador, suporteController.responderTicketAdmin);

// Blog publico -- so o super admin publica/edita/exclui posts e responde
// comentarios (mesma chaveMestra usada no resto do painel).
router.get('/blog/posts', limitador, blogController.listarTodosAdmin);
router.post('/blog/posts', limitador, upload.single('imagem'), blogController.criarAdmin);
router.put('/blog/posts/:id', limitador, upload.single('imagem'), blogController.atualizarAdmin);
router.delete('/blog/posts/:id', limitador, blogController.excluirAdmin);
router.get('/blog/posts/:postId/comentarios', limitador, blogController.listarComentariosAdmin);
router.put('/blog/comentarios/:id/resposta', limitador, blogController.responderComentarioAdmin);
router.delete('/blog/comentarios/:id', limitador, blogController.excluirComentarioAdmin);

module.exports = router;
