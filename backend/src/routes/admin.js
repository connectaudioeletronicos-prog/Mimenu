// ===================================================================
// Rotas ADMINISTRATIVAS - todas protegidas por autenticacao JWT
// Cada estabelecimento so acessa/edita os PROPRIOS dados, garantido
// pelo middleware "autenticar" (que extrai o ID do token, nao da URL)
// ===================================================================
const express = require('express');
const router = express.Router();

const { autenticar, exigirPermissao, exigirCargoAdministrativo, exigirAdministradorOuGerente } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const estabelecimentoController = require('../controllers/estabelecimentoController');
const categoriaController = require('../controllers/categoriaController');
const produtoController = require('../controllers/produtoController');
const promocaoController = require('../controllers/promocaoController');
const carrosselController = require('../controllers/carrosselController');
const vitrineController = require('../controllers/vitrineController');
const caixaTextoController = require('../controllers/caixaTextoController');
const pedidoController = require('../controllers/pedidoController');
const comandaController = require('../controllers/comandaController');
const reservaController = require('../controllers/reservaController');
const estoqueController = require('../controllers/estoqueController');
const fornecedorController = require('../controllers/fornecedorController');
const relatorioVendasController = require('../controllers/relatorioVendasController');
const inteligenciaController = require('../controllers/inteligenciaController');
const suporteController = require('../controllers/suporteController');

router.use(autenticar);

// O entregador nao usa mais o painel administrativo -- ele tem o proprio
// app, mais simples (login -> checkin por QR -> aceitar/recusar/encerrar
// entrega), nas rotas /funcionarios/entregas/*.
router.use((req, res, next) => {
  if (req.cargo === 'entregador') {
    return res.status(403).json({ erro: 'Entregadores usam o app proprio de entregas, nao o painel administrativo.' });
  }
  next();
});

// Configuracoes da conta (dados, pagamento, paginas legais)
router.get('/estabelecimento', exigirPermissao('gerenciar_conta'), estabelecimentoController.buscarMeuEstabelecimento);
router.get('/estabelecimento/dados-legais', exigirPermissao('gerenciar_conta'), estabelecimentoController.buscarMeusDadosLegais);
router.post('/estabelecimento/dados-legais/verificar-senha', exigirPermissao('gerenciar_conta'), estabelecimentoController.verificarSenhaDadosLegais);
router.put('/estabelecimento', exigirPermissao('gerenciar_conta'), estabelecimentoController.atualizarConfiguracoes);
router.post('/estabelecimento/logo', exigirPermissao('gerenciar_conta'), upload.single('imagem'), estabelecimentoController.uploadLogo);
router.post('/estabelecimento/logo-apps', exigirPermissao('gerenciar_conta'), upload.single('imagem'), estabelecimentoController.uploadLogoApps);
router.post('/estabelecimento/banner', exigirPermissao('gerenciar_conta'), upload.single('imagem'), estabelecimentoController.uploadBanner);
router.put('/pagamento/config/senha', exigirPermissao('gerenciar_conta'), estabelecimentoController.alternarProtecaoSenhaPagamento);
router.post('/pagamento/verificar-senha', exigirPermissao('gerenciar_conta'), estabelecimentoController.verificarSenhaPagamento);

// Configuracoes / Reserva de mesa (opcional, liga/desliga por loja)
router.put('/configuracoes/reserva-mesa', exigirPermissao('gerenciar_conta'), reservaController.alternarReservaAtiva);
router.get('/reservas', exigirPermissao('gerenciar_conta'), reservaController.listar);
router.put('/reservas/:id/status', exigirPermissao('gerenciar_conta'), reservaController.atualizarStatus);

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

// Caixas de texto (titulo + corpo livre, posicionavel)
router.get('/caixas-texto', caixaTextoController.listar);
router.post('/caixas-texto', exigirPermissao('gerenciar_cardapio'), caixaTextoController.criar);
router.put('/caixas-texto/:id', exigirPermissao('gerenciar_cardapio'), caixaTextoController.atualizar);
router.delete('/caixas-texto/:id', exigirPermissao('gerenciar_cardapio'), caixaTextoController.excluir);

// Pedidos - qualquer funcionario logado pode ver a lista (valores de pedidos
// concluidos/cancelados sao filtrados dentro do controller conforme permissao).
router.get('/pedidos', pedidoController.listarPedidosAdmin);
router.get('/pedidos/contagem', pedidoController.contarPedidosAdmin);
// Pedido lancado manualmente pelo garcom/atendimento (balcao/mesa) --
// ja entra direto em preparo, sem precisar do aceite do administrador.
router.post('/pedidos', exigirPermissao('criar_pedidos'), pedidoController.criarPedidoManual);

// Comandas (mesa/cliente do app do garcom): abre, recebe rodadas de itens
// (vao pra cozinha na hora) e so fecha/cobra no final. O historico de
// comandas fechadas e permanente -- so proprietario/administrador exclui.
router.post('/comandas', exigirPermissao('criar_pedidos'), comandaController.abrir);
router.get('/comandas', exigirPermissao('criar_pedidos'), comandaController.listar);
router.get('/comandas/:id', exigirPermissao('criar_pedidos'), comandaController.detalhe);
router.post('/comandas/:id/itens', exigirPermissao('criar_pedidos'), comandaController.adicionarItens);
router.post('/comandas/:id/fechar', exigirPermissao('criar_pedidos'), comandaController.fechar);
router.post('/comandas/:id/confirmar-manual', exigirPermissao('criar_pedidos'), comandaController.confirmarPagamentoManual);
router.delete('/comandas/:id', exigirCargoAdministrativo, comandaController.excluir);
router.put('/comandas/:id/corrigir', exigirAdministradorOuGerente, comandaController.corrigirValores);

// Resumo do dia de um funcionario (tela "Resumo do [Cargo]" na aba Equipe).
router.get('/funcionarios/:id/resumo', exigirAdministradorOuGerente, comandaController.resumoFuncionario);

// Caixa geral - resumo dos valores das entregas concluidas. So gerente e
// administrador (ou quem tiver a permissao marcada) tem acesso.
router.get('/caixa-geral', exigirPermissao('ver_caixa_geral'), pedidoController.obterCaixaGeral);
router.put('/pedidos/:id/status', pedidoController.atualizarStatusPedido);
router.put('/pedidos/:id/valores', exigirPermissao('corrigir_valores_concluidos'), pedidoController.corrigirValoresPedido);

// ===================================================================
// Controle de Estoque (modulo opcional, ativado por preferencia do
// lojista dentro de Configuracoes). Tudo protegido pela permissao
// 'gerenciar_estoque' -- proprietario e administrador sempre tem acesso.
// ===================================================================
router.get('/estoque/config', exigirPermissao('gerenciar_estoque'), estoqueController.obterConfiguracao);
router.put('/estoque/config/modulo', exigirPermissao('gerenciar_estoque'), estoqueController.alternarModulo);
router.put('/estoque/config/senha', exigirPermissao('gerenciar_estoque'), estoqueController.alternarProtecaoSenha);
router.put('/estoque/config/alertas', exigirPermissao('gerenciar_estoque'), estoqueController.atualizarAlertas);
router.post('/estoque/verificar-senha', exigirPermissao('gerenciar_estoque'), estoqueController.verificarSenha);

router.get('/estoque/produtos', exigirPermissao('gerenciar_estoque'), estoqueController.listarProdutosEstoque);
router.get('/estoque/indicadores', exigirPermissao('gerenciar_estoque'), estoqueController.obterIndicadores);
router.post('/estoque/compra', exigirPermissao('gerenciar_estoque'), estoqueController.registrarCompra);
router.put('/estoque/ajuste', exigirPermissao('gerenciar_estoque'), estoqueController.ajustarManual);
router.get('/estoque/movimentacoes', exigirPermissao('gerenciar_estoque'), estoqueController.listarMovimentacoes);
router.get('/estoque/notificacoes', exigirPermissao('gerenciar_estoque'), estoqueController.listarNotificacoes);

router.get('/fornecedores', exigirPermissao('gerenciar_estoque'), fornecedorController.listar);
router.post('/fornecedores', exigirPermissao('gerenciar_estoque'), fornecedorController.criar);
router.put('/fornecedores/:id', exigirPermissao('gerenciar_estoque'), fornecedorController.atualizar);
router.delete('/fornecedores/:id', exigirPermissao('gerenciar_estoque'), fornecedorController.excluir);

// ---------- Vendas & Inteligencia (parte 2 da tela de Estoque) ----------
router.get('/estoque/vendas/periodo', exigirPermissao('gerenciar_estoque'), relatorioVendasController.vendasPorPeriodo);
router.get('/estoque/vendas/canal', exigirPermissao('gerenciar_estoque'), relatorioVendasController.vendasPorCanal);
router.get('/estoque/vendas/produtos', exigirPermissao('gerenciar_estoque'), relatorioVendasController.vendasPorProduto);
router.get('/estoque/vendas/lucro-produtos', exigirPermissao('gerenciar_estoque'), relatorioVendasController.lucroPorProduto);

router.get('/estoque/inteligencia', exigirPermissao('gerenciar_estoque'), inteligenciaController.obterInteligencia);

// ---------- Suporte (chamados do lojista com o admin supremo) ----------
router.get('/suporte/tickets', exigirPermissao('gerenciar_conta'), suporteController.listarTicketsLoja);
router.get('/suporte/tickets/:id', exigirPermissao('gerenciar_conta'), suporteController.buscarTicketLoja);
router.post('/suporte/tickets', exigirPermissao('gerenciar_conta'), upload.single('anexo'), suporteController.criarTicketLoja);
router.post('/suporte/tickets/:id/mensagens', exigirPermissao('gerenciar_conta'), upload.single('anexo'), suporteController.responderTicketLoja);

module.exports = router;
