// ===================================================================
// Controller de pedidos + integracao com Mercado Pago
//
// REGRA DE SEGURANCA CRITICA:
// O preco de cada item NUNCA e confiado vindo do frontend.
// Sempre buscamos o preco real no banco de dados no momento da
// criacao do pedido, recalculando o total no servidor.
// ===================================================================
const { query } = require('../config/database');
const { MercadoPagoConfig, Payment } = require('mercadopago');

async function validarItensCarrinho(estabelecimentoId, itensRecebidos) {
  if (!Array.isArray(itensRecebidos) || itensRecebidos.length === 0) {
    throw new Error('O carrinho esta vazio.');
  }

  const idsProdutos = itensRecebidos.map(item => item.produto_id);

  const resultado = await query(
    `SELECT id, nome, preco, preco_promocional, disponivel
     FROM produtos
     WHERE id = ANY($1::uuid[]) AND estabelecimento_id = $2`,
    [idsProdutos, estabelecimentoId]
  );

  const produtosNoBanco = new Map(resultado.rows.map(p => [p.id, p]));
  const itensValidados = [];
  let subtotal = 0;

  for (const itemRecebido of itensRecebidos) {
    const produto = produtosNoBanco.get(itemRecebido.produto_id);

    if (!produto) {
      throw new Error(`Produto nao encontrado ou nao pertence a este estabelecimento.`);
    }
    if (!produto.disponivel) {
      throw new Error(`O produto "${produto.nome}" nao esta disponivel no momento.`);
    }

    const quantidade = parseInt(itemRecebido.quantidade, 10);
    if (!quantidade || quantidade <= 0 || quantidade > 50) {
      throw new Error(`Quantidade invalida para o produto "${produto.nome}".`);
    }

    const precoUnitario = produto.preco_promocional ?? produto.preco;
    const precoTotalItem = parseFloat((precoUnitario * quantidade).toFixed(2));
    subtotal += precoTotalItem;

    itensValidados.push({
      produto_id: produto.id,
      nome: produto.nome,
      preco_unitario: precoUnitario,
      quantidade,
      observacao: (itemRecebido.observacao || '').substring(0, 300),
      total_item: precoTotalItem
    });
  }

  return { itensValidados, subtotal: parseFloat(subtotal.toFixed(2)) };
}

async function criarPedido(req, res) {
  try {
    const { slug } = req.params;
    const {
      cliente_nome, cliente_telefone, cliente_endereco,
      itens, forma_pagamento, observacoes, taxa_entrega
    } = req.body;

    if (!cliente_nome || !cliente_telefone) {
      return res.status(400).json({ erro: 'Nome e telefone sao obrigatorios.' });
    }
    if (!['pix', 'cartao', 'dinheiro'].includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Forma de pagamento invalida.' });
    }

    const estabelecimentoResult = await query(
      'SELECT id, mp_access_token, ativo FROM estabelecimentos WHERE slug = $1',
      [slug]
    );
    if (estabelecimentoResult.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }
    const estabelecimento = estabelecimentoResult.rows[0];
    if (!estabelecimento.ativo) {
      return res.status(403).json({ erro: 'Este estabelecimento esta indisponivel.' });
    }

    const { itensValidados, subtotal } = await validarItensCarrinho(estabelecimento.id, itens);
    const taxaEntregaSegura = Math.max(0, parseFloat(taxa_entrega) || 0);
    const total = parseFloat((subtotal + taxaEntregaSegura).toFixed(2));

    const pedidoResult = await query(
      `INSERT INTO pedidos
        (estabelecimento_id, cliente_nome, cliente_telefone, cliente_endereco,
         itens, subtotal, taxa_entrega, total, forma_pagamento, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        estabelecimento.id, cliente_nome.trim(), cliente_telefone.trim(),
        cliente_endereco || null, JSON.stringify(itensValidados), subtotal,
        taxaEntregaSegura, total, forma_pagamento, observacoes || null
      ]
    );
    const pedido = pedidoResult.rows[0];

    if (forma_pagamento === 'dinheiro') {
      return res.status(201).json({ pedido, pagamento: null });
    }

    const accessToken = estabelecimento.mp_access_token || process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
      return res.status(400).json({
        erro: 'Este estabelecimento ainda nao configurou pagamento online. Escolha "dinheiro" ou entre em contato.'
      });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const paymentClient = new Payment(client);

    const dadosPagamento = {
      transaction_amount: total,
      description: `Pedido #${pedido.id.substring(0, 8)} - ${cliente_nome}`,
      payment_method_id: forma_pagamento === 'pix' ? 'pix' : undefined,
      payer: {
        email: `cliente-${pedido.id.substring(0, 8)}@meumenu.app`,
        first_name: cliente_nome.trim()
      },
      external_reference: pedido.id,
      notification_url: `${process.env.BACKEND_URL}/api/webhooks/mercadopago`
    };

    const pagamentoMP = await paymentClient.create({ body: dadosPagamento });

    await query(
      'UPDATE pedidos SET mp_payment_id = $1 WHERE id = $2',
      [pagamentoMP.id, pedido.id]
    );

    res.status(201).json({
      pedido,
      pagamento: {
        id: pagamentoMP.id,
        status: pagamentoMP.status,
        qr_code: pagamentoMP.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: pagamentoMP.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: pagamentoMP.point_of_interaction?.transaction_data?.ticket_url
      }
    });

  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(400).json({ erro: error.message || 'Erro ao processar pedido.' });
  }
}

async function consultarStatusPedido(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      'SELECT id, status_pagamento, status_pedido, total FROM pedidos WHERE id = $1',
      [id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido nao encontrado.' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao consultar pedido:', error);
    res.status(500).json({ erro: 'Erro interno ao consultar pedido.' });
  }
}

async function webhookMercadoPago(req, res) {
  try {
    const { type, data } = req.body;

    res.sendStatus(200);

    if (type !== 'payment' || !data?.id) return;

    const pedidoExistente = await query(
      'SELECT p.id, p.estabelecimento_id, e.mp_access_token FROM pedidos p JOIN estabelecimentos e ON e.id = p.estabelecimento_id WHERE p.mp_payment_id = $1',
      [data.id]
    );
    if (pedidoExistente.rows.length === 0) return;

    const accessToken = pedidoExistente.rows[0].mp_access_token || process.env.MP_ACCESS_TOKEN;
    const client = new MercadoPagoConfig({ accessToken });
    const paymentClient = new Payment(client);

    const pagamento = await paymentClient.get({ id: data.id });

    const statusMapeado = {
      approved: 'aprovado',
      rejected: 'rejeitado',
      cancelled: 'cancelado',
      pending: 'pendente',
      in_process: 'pendente'
    }[pagamento.status] || 'pendente';

    await query(
      'UPDATE pedidos SET status_pagamento = $1 WHERE mp_payment_id = $2',
      [statusMapeado, data.id]
    );

  } catch (error) {
    console.error('Erro no webhook do Mercado Pago:', error);
  }
}

async function listarPedidosAdmin(req, res) {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM pedidos WHERE estabelecimento_id = $1';
    const params = [req.estabelecimentoId];

    if (status) {
      sql += ' AND status_pedido = $2';
      params.push(status);
    }
    sql += ' ORDER BY criado_em DESC LIMIT 100';

    const resultado = await query(sql, params);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({ erro: 'Erro interno ao listar pedidos.' });
  }
}

async function atualizarStatusPedido(req, res) {
  try {
    const { id } = req.params;
    const { status_pedido } = req.body;

    const statusValidos = ['novo', 'preparando', 'saiu_entrega', 'entregue', 'cancelado'];
    if (!statusValidos.includes(status_pedido)) {
      return res.status(400).json({ erro: 'Status de pedido invalido.' });
    }

    const resultado = await query(
      'UPDATE pedidos SET status_pedido = $1 WHERE id = $2 AND estabelecimento_id = $3 RETURNING *',
      [status_pedido, id, req.estabelecimentoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido nao encontrado.' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar pedido.' });
  }
}

module.exports = {
  criarPedido,
  consultarStatusPedido,
  webhookMercadoPago,
  listarPedidosAdmin,
  atualizarStatusPedido
};
