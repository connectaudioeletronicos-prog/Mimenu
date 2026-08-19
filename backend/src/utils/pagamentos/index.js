// Ponto unico de entrada pra qualquer coisa relacionada a cobranca Pix.
// O resto do sistema (pedidoController.js) so fala com este arquivo --
// nunca importa mercadopago.js direto. Pra adicionar um banco novo no
// futuro: criar o arquivo (ex: stone.js) com criarCobrancaPix/consultarPagamento,
// importar aqui embaixo e adicionar o `case` correspondente.
const mercadopago = require('./mercadopago');
const { descriptografar } = require('../criptografia');

const PROVEDORES = {
  mercadopago
  // stone: require('./stone'),
  // pagseguro: require('./pagseguro'),
};

function obterProvedor(estabelecimento) {
  const nome = estabelecimento.provedor_pagamento || 'mercadopago';
  const provedor = PROVEDORES[nome];
  if (!provedor) throw new Error(`Provedor de pagamento "${nome}" nao suportado.`);
  return provedor;
}

// accessToken sempre vem do CADASTRO DA PROPRIA LOJA (estabelecimento.mp_access_token
// hoje, ou o campo equivalente de outro provedor no futuro) -- nunca de uma
// chave global do .env, pra o dinheiro cair na conta de quem e dono da loja.
async function criarCobrancaPix(estabelecimento, dados) {
  const provedor = obterProvedor(estabelecimento);
  if (!estabelecimento.mp_access_token) {
    throw new Error('Essa loja ainda nao configurou a chave de pagamento em Configurações > Pagamento.');
  }
  const accessToken = descriptografar(estabelecimento.mp_access_token);
  return provedor.criarCobrancaPix({ accessToken, ...dados });
}

async function criarCobrancaCartao(estabelecimento, dados) {
  const provedor = obterProvedor(estabelecimento);
  if (!estabelecimento.mp_access_token) {
    throw new Error('Essa loja ainda nao configurou a chave de pagamento em Configurações > Pagamento.');
  }
  const accessToken = descriptografar(estabelecimento.mp_access_token);
  return provedor.criarCobrancaCartao({ accessToken, ...dados });
}

async function consultarPagamento(estabelecimento, idPagamento) {
  const provedor = obterProvedor(estabelecimento);
  if (!estabelecimento.mp_access_token) {
    throw new Error('Essa loja ainda nao configurou a chave de pagamento em Configurações > Pagamento.');
  }
  const accessToken = descriptografar(estabelecimento.mp_access_token);
  return provedor.consultarPagamento({ accessToken, idPagamento });
}

module.exports = { criarCobrancaPix, criarCobrancaCartao, consultarPagamento };
