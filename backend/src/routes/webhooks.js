// ===================================================================
// Rotas de webhooks - chamadas automaticamente por servicos externos
// ===================================================================
const express = require('express');
const router = express.Router();

const pedidoController = require('../controllers/pedidoController');

router.post('/mercadopago', pedidoController.webhookMercadoPago);

module.exports = router;