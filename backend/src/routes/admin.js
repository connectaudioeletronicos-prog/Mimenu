// ===================================================================
// Rotas ADMINISTRATIVAS - todas protegidas por autenticacao JWT
// Cada estabelecimento so acessa/edita os PROPRIOS dados, garantido
// pelo middleware "autenticar" (que extrai o ID do token, nao da URL)
// ===================================================================
const express = require('express');
const router = express.Router();

const { autenticar } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const estabelecimentoController = require('../controllers/estabelecimentoController');
const categoriaController = require('../controllers/categoriaController');
const produtoController = require('../controllers/produtoController');
const promocaoController = require('../controllers/promocaoController');
const pedidoController = require('../controllers/pedidoController');

router.use(autenticar);

router.get('/estabelecimento', estabelecimentoController.buscarMeuEstabelecimento);
router.put('/estabelecimento', estabelecimentoController.atualizarConfiguracoes);
router.post('/estabelecimento/logo', upload.single('imagem'), estabelecimentoController.uploadLogo);
router.post('/estabelecimento/banner', upload.single('imagem'), estabelecimentoController.uploadBanner);

router.get('/categorias', categoriaController.listar);
router.post('/categorias', upload.single('imagem'), categoriaController.criar);
router.put('/categorias/:id', upload.single('imagem'), categoriaController.atualizar);
router.delete('/categorias/:id', categoriaController.excluir);

router.get('/produtos', produtoController.listar);
router.post('/produtos', upload.single('imagem'), produtoController.criar);
router.put('/produtos/:id', upload.single('imagem'), produtoController.atualizar);
router.delete('/produtos/:id', produtoController.excluir);

router.get('/promocoes', promocaoController.listar);
router.post('/promocoes', upload.single('imagem'), promocaoController.criar);
router.put('/promocoes/:id', upload.single('imagem'), promocaoController.atualizar);
router.delete('/promocoes/:id', promocaoController.excluir);

router.get('/pedidos', pedidoController.listarPedidosAdmin);
router.put('/pedidos/:id/status', pedidoController.atualizarStatusPedido);

module.exports = router;