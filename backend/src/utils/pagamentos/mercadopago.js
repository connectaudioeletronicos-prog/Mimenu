// Implementacao especifica do Mercado Pago. Quem chama de fora (o
// dispatcher em index.js) nunca importa esse arquivo diretamente -- assim,
// pra adicionar outro banco no futuro, basta criar um arquivo irmao (ex:
// stone.js, pagseguro.js) com essas duas mesmas funcoes e adicionar um
// `case` novo no dispatcher.
const { MercadoPagoConfig, Payment } = require('mercadopago');

// Cria uma cobranca Pix. Retorna o QR Code (imagem + codigo "copia e cola")
// e o id do pagamento no Mercado Pago (pra salvar em pedidos.mp_payment_id
// e conseguir localizar o pedido quando o webhook avisar que foi pago).
async function criarCobrancaPix({ accessToken, valor, descricao, referenciaExterna, emailPagador, notificationUrl }) {
  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
  const payment = new Payment(client);

  const resultado = await payment.create({
    body: {
      transaction_amount: Number(valor.toFixed(2)),
      description: descricao,
      payment_method_id: 'pix',
      payer: { email: emailPagador },
      external_reference: referenciaExterna,
      notification_url: notificationUrl
    }
  });

  const dadosTransacao = resultado?.point_of_interaction?.transaction_data;
  if (!dadosTransacao?.qr_code) {
    throw new Error('Mercado Pago nao retornou o QR Code do Pix.');
  }

  return {
    idPagamento: String(resultado.id),
    status: mapearStatus(resultado.status),
    qrCode: dadosTransacao.qr_code,
    qrCodeBase64: dadosTransacao.qr_code_base64,
    expiraEm: resultado.date_of_expiration || null
  };
}

// Consulta o status atual de um pagamento direto na API do Mercado Pago --
// nunca confia so no conteudo que o webhook mandou (o webhook so avisa
// "algo mudou", quem confirma de verdade e essa consulta).
async function consultarPagamento({ accessToken, idPagamento }) {
  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
  const payment = new Payment(client);
  const resultado = await payment.get({ id: idPagamento });

  return {
    idPagamento: String(resultado.id),
    status: mapearStatus(resultado.status),
    referenciaExterna: resultado.external_reference
  };
}

// Traduz os status do Mercado Pago pro vocabulario que o resto do sistema
// ja usa em pedidos.status_pagamento ('pendente' / 'pago' / 'recusado').
function mapearStatus(statusMercadoPago) {
  if (statusMercadoPago === 'approved') return 'pago';
  if (['rejected', 'cancelled'].includes(statusMercadoPago)) return 'recusado';
  return 'pendente'; // pending, in_process, in_mediation etc.
}

module.exports = { criarCobrancaPix, consultarPagamento };
