// ===================================================================
// Rotas PUBLICAS do blog -- leitura de posts e envio de comentario,
// sem login (qualquer visitante, inclusive vindo do Google). Separado
// de routes/publico.js porque aquele arquivo e por loja (prefixo
// /:slug de estabelecimento); o blog e global, sem loja associada.
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const blogController = require('../controllers/blogController');

// Limite de comentarios mais apertado que o global -- reduz spam/flood
// alem da moderacao automatica em si.
const limitadorComentarios = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { erro: 'Muitos comentarios em pouco tempo. Aguarde alguns minutos e tente novamente.' }
});

router.get('/posts', blogController.listarPublicados);
router.get('/posts/:slug', blogController.buscarPorSlug);
router.post('/posts/:slug/comentarios', limitadorComentarios, blogController.criarComentario);
router.get('/configuracoes', blogController.obterConfiguracoes);
router.get('/paginas/:tipo', blogController.obterPagina);
router.get('/sitemap.xml', blogController.gerarSitemap);

module.exports = router;
