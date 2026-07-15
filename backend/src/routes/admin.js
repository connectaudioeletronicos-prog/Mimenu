// ===================================================================
// Rotas ADMINISTRATIVAS - todas protegidas por autenticacao JWT
// Cada estabelecimento so acessa/edita os PROPRIOS dados, garantido
// pelo middleware "autenticar" (que extrai o ID do token, nao da URL)
// ===================================================================
const express = require('express');
const router = express.Router();

const { autenticar, exigirPermissao } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const estabelecimentoController = require('../controllers/estabelecimentoController');
const categoriaController = require('../controllers/categoriaController');
const produtoController = require('../controllers/produtoController');
const promocaoController = require('../controllers/promocaoController');
const pedidoController = require('../controllers/pedidoController');

router.use(autenticar);

// Configuracoes da conta (dados, pagamento, paginas legais)
router.get('/estabelecimento', exigirPermissao('gerenciar_conta'), estabelecimentoController.buscarMeuEstabelecimento);
router.put('/estabelecimento', exigirPermissao('gerenciar_conta'), estabelecimentoController.atualizarConfiguracoes);
router.post('/estabelecimento/logo', exigirPermissao('gerenciar_conta'), upload.single('imagem'), estabelecimentoController.uploadLogo);
router.post('/estabelecimento/banner', exigirPermissao('gerenciar_conta'), upload.single('imagem'), estabelecimentoController.uploadBanner);

// Cardapio (produtos, categorias, promocoes)
router.get('/categorias', categoriaController.listar);
router.post('/categorias', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), categoriaController.criar);
router.put('/categorias/:id', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), categoriaController.atualizar);
router.delete('/categorias/:id', exigirPermissao('gerenciar_cardapio'), categoriaController.excluir);

router.get('/produtos', produtoController.listar);
router.post('/produtos', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), produtoController.criar);
router.put('/produtos/:id', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), produtoController.atualizar);
router.delete('/produtos/:id', exigirPermissao('gerenciar_cardapio'), produtoController.excluir);

router.get('/promocoes', promocaoController.listar);
router.post('/promocoes', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), promocaoController.criar);
router.put('/promocoes/:id', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), promocaoController.atualizar);
router.delete('/promocoes/:id', exigirPermissao('gerenciar_cardapio'), promocaoController.excluir);

// Pedidos - qualquer funcionario logado pode ver a lista (valores de pedidos
// concluidos/cancelados sao filtrados dentro do controller conforme permissao).
router.get('/pedidos', pedidoController.listarPedidosAdmin);
router.put('/pedidos/:id/status', pedidoController.atualizarStatusPedido);
router.put('/pedidos/:id/valores', exigirPermissao('corrigir_valores_concluidos'), pedidoController.corrigirValoresPedido);

module.exports = router;
