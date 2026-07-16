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
const carrosselController = require('../controllers/carrosselController');
const vitrineController = require('../controllers/vitrineController');
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

// Carrosseis extras (banners adicionais, fotos ilimitadas, posicionaveis)
router.get('/carrosseis', carrosselController.listar);
router.post('/carrosseis', exigirPermissao('gerenciar_cardapio'), carrosselController.criar);
router.put('/carrosseis/:id', exigirPermissao('gerenciar_cardapio'), carrosselController.atualizar);
router.delete('/carrosseis/:id', exigirPermissao('gerenciar_cardapio'), carrosselController.excluir);
router.post('/carrosseis/:id/imagens', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), carrosselController.adicionarImagem);
router.put('/carrosseis/imagens/:imagemId', exigirPermissao('gerenciar_cardapio'), carrosselController.atualizarImagem);
router.delete('/carrosseis/imagens/:imagemId', exigirPermissao('gerenciar_cardapio'), carrosselController.removerImagem);

// Vitrines (imagem grande + texto, posicionavel)
router.get('/vitrines', vitrineController.listar);
router.post('/vitrines', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), vitrineController.criar);
router.put('/vitrines/:id', exigirPermissao('gerenciar_cardapio'), upload.single('imagem'), vitrineController.atualizar);
router.delete('/vitrines/:id', exigirPermissao('gerenciar_cardapio'), vitrineController.excluir);

// Pedidos - qualquer funcionario logado pode ver a lista (valores de pedidos
// concluidos/cancelados sao filtrados dentro do controller conforme permissao).
router.get('/pedidos', pedidoController.listarPedidosAdmin);

// Caixa geral - resumo dos valores das entregas concluidas. So gerente e
// administrador (ou quem tiver a permissao marcada) tem acesso.
router.get('/caixa-geral', exigirPermissao('ver_caixa_geral'), pedidoController.obterCaixaGeral);
router.put('/pedidos/:id/status', pedidoController.atualizarStatusPedido);
router.put('/pedidos/:id/valores', exigirPermissao('corrigir_valores_concluidos'), pedidoController.corrigirValoresPedido);

module.exports = router;
