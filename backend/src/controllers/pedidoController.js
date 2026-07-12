const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');

async function criarPedido(req, res) {
  try {
    const { slug } = req.params;
    const { cliente_nome, cliente_telefone, cliente_endereco, observacoes, forma_pagamento, taxa_entrega, itens } = req.body;

    if (!cliente_nome || !cliente_telefone || !itens || itens.length === 0) {
      return res.status(400).json({ erro: 'Dados incompletos para criar pedido.' });
    }

    const estRes = await query('SELECT id, ativo, mp_access_token FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    if (!estRes.rows[0].ativo) return res.status(403).json({ erro: 'Estabelecimento indisponivel.' });
    const estabelecimentoId = estRes.rows[0].id;

    let total = 0;
    const itensValidados = [];
    for (const item of itens) {
      const prodRes = await query('SELECT id, nome, preco, preco_promocional, disponivel FROM produtos WHERE id = $1 AND estabelecimento_id = $2', [item.produto_id, estabelecimentoId]);
      if (prodRes.rows.length === 0) return res.status(400).json({ erro: `Produto nao encontrado: ${item.produto_id}` });
      const produto = prodRes.rows[0];
      if (!produto.disponivel) return res.status(400).json({ erro: `Produto indisponivel: ${produto.nome}` });
      const preco = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco)
        ? parseFloat(produto.preco_promocional) : parseFloat(produto.preco);
      total += preco * item.quantidade;
      itensValidados.push({ produto_id: produto.id, nome: produto.nome, quantidade: item.quantidade, preco_unitario: preco, observacao: item.observacao || '' });
    }

    total += parseFloat(taxa_entrega || 0);

    const pedidoRes = await query(
      `INSERT INTO pedidos (estabelecimento_id, cliente_nome, cliente_telefone, cliente_endereco, observacoes, forma_pagamento, taxa_entrega, total, status_pedido, status_pagamento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'novo','pendente') RETURNING *`,
      [estabelecimentoId, cliente_nome, cliente_telefone, cliente_endereco || '', observacoes || '', forma_pagamento, parseFloat(taxa_entrega || 0), total]
    );
    const pedido = pedidoRes.rows[0];

    for (const item of itensValidados) {
      await query(
        `INSERT INTO itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario, observacao)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [pedido.id, item.produto_id, item.nome, item.quantidade, item.preco_unitario, item.observacao]
      );
    }

    // Tenta salvar cliente automaticamente
    try {
      await query(
        `INSERT INTO clientes (estabelecimento_id, nome, telefone, endereco)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (estabelecimento_id, telefone)
         DO UPDATE SET nome = EXCLUDED.nome,
                       endereco = COALESCE(EXCLUDED.endereco, clientes.endereco),
                       atualizado_em = NOW()`,
        [estabelecimentoId, cliente_nome, cliente_telefone, cliente_endereco || null]
      );
    } catch (e) {
      console.warn('Aviso: nao foi possivel salvar cliente automaticamente:', e.message);
    }

    res.status(201).json({ pedido, pagamento: null });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ erro: 'Erro interno ao criar pedido.' });
  }
}

async function consultarStatusPedido(req, res) {
  try {
    const { slug, id } = req.params;
    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const resultado = await query(
      'SELECT id, status_pedido, status_pagamento FROM pedidos WHERE id = $1 AND estabelecimento_id = $2',
      [id, estRes.rows[0].id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido nao encontrado.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao consultar status.' });
  }
}

async function webhookMercadoPago(req, res) {
  res.sendStatus(200);
}

async function listarPedidosAdmin(req, res) {
  try {
    const { status } = req.query;
    let sql = `
      SELECT p.*, json_agg(json_build_object(
        'id', ip.id, 'nome', ip.nome_produto, 'quantidade', ip.quantidade,
        'preco_unitario', ip.preco_unitario, 'observacao', ip.observacao
      )) as itens
      FROM pedidos p
      LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
      WHERE p.estabelecimento_id = $1
    `;
    const params = [req.estabelecimentoId];
    if (status) { sql += ` AND p.status_pedido = $2`; params.push(status); }
    sql += ` GROUP BY p.id ORDER BY p.criado_em DESC LIMIT 100`;
    const resultado = await query(sql, params);
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar pedidos.' });
  }
}

async function atualizarStatusPedido(req, res) {
  try {
    const { id } = req.params;
    const { status_pedido } = req.body;

    const statusValidos = ['novo', 'preparando', 'saiu_entrega', 'entregue', 'cancelado'];
    if (!statusValidos.includes(status_pedido)) return res.status(400).json({ erro: 'Status invalido.' });

    const pedidoAtual = await query('SELECT status_pedido FROM pedidos WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (pedidoAtual.rows.length === 0) return res.status(404).json({ erro: 'Pedido nao encontrado.' });

    const statusFinal = ['entregue', 'cancelado'];
    if (statusFinal.includes(pedidoAtual.rows[0].status_pedido)) {
      return res.status(400).json({ erro: 'Pedidos finalizados ou cancelados nao podem ser alterados.' });
    }

    const resultado = await query(
      'UPDATE pedidos SET status_pedido = $1 WHERE id = $2 AND estabelecimento_id = $3 RETURNING *',
      [status_pedido, id, req.estabelecimentoId]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao atualizar status.' });
  }
}

async function listarPedidosCliente(req, res) {
  try {
    const { slug, telefone } = req.params;
    const estRes = await query('SELECT id, ativo FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    const estabelecimentoId = estRes.rows[0].id;
    if (!estRes.rows[0].ativo) return res.status(403).json({ erro: 'Este estabelecimento esta indisponivel.' });

    const telefoneLimpo = (telefone || '').replace(/\D/g, '');
    const sql = `
      SELECT id, cliente_nome, cliente_telefone, status_pedido, status_pagamento, total, criado_em
      FROM pedidos
      WHERE estabelecimento_id = $1
        AND regexp_replace(cliente_telefone, '\\D', '', 'g') LIKE $2
      ORDER BY criado_em DESC
      LIMIT 100
    `;
    const resultado = await query(sql, [estabelecimentoId, `%${telefoneLimpo}%`]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar pedidos por telefone:', error);
    res.status(500).json({ erro: 'Erro interno ao listar pedidos do cliente.' });
  }
}

module.exports = {
  criarPedido,
  consultarStatusPedido,
  webhookMercadoPago,
  listarPedidosAdmin,
  atualizarStatusPedido,
  listarPedidosCliente
};
