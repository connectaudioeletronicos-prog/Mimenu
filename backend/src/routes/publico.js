// ===================================================================
// Rotas PUBLICAS - acessadas pelos clientes finais (sem necessidade de login)
// ===================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const estabelecimentoController = require('../controllers/estabelecimentoController');
const pedidoController = require('../controllers/pedidoController');

const limitadorPedidos = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { erro: 'Muitas tentativas de pedido. Aguarde alguns minutos e tente novamente.' }
});

router.get('/:slug', estabelecimentoController.buscarPorSlug);
router.post('/:slug/pedidos', limitadorPedidos, pedidoController.criarPedido);
router.get('/:slug/pedidos/:id/status', pedidoController.consultarStatusPedido);
router.get('/:slug/pedidos/cliente/:telefone', pedidoController.listarPedidosCliente);

module.exports = router;
