// Lista pedidos públicos do cliente por telefone (somente deste estabelecimento)
async function listarPedidosCliente(req, res) {
  try {
    const { slug, telefone } = req.params;

    // Busca estabelecimento pelo slug
    const estRes = await query('SELECT id, ativo FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    const estabelecimentoId = estRes.rows[0].id;
    if (!estRes.rows[0].ativo) return res.status(403).json({ erro: 'Este estabelecimento esta indisponivel.' });

    const telefoneLimpo = (telefone || '').replace(/\D/g, '');

    const sql = `
      SELECT id, cliente_nome, cliente_telefone, status_pedido, status_pagamento, total, criado_em
      FROM pedidos
      WHERE estabelecimento_id = $1
        AND regexp_replace(cliente_telefone, '\\\\D', '', 'g') LIKE $2
      ORDER BY criado_em DESC
      LIMIT 100
    `;
    const params = [estabelecimentoId, `%${telefoneLimpo}%`];
    const resultado = await query(sql, params);

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
