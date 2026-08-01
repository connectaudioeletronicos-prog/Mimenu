// ===================================================================
// Centro de Inteligencia do Estoque
// Caminho no projeto: backend/src/controllers/inteligenciaController.js
// ===================================================================
// Responde automaticamente as perguntas mais uteis sobre o estoque e as
// vendas, pre-calculadas num unico endpoint (GET /estoque/inteligencia).
// Nao e um chat livre -- e um conjunto fixo de indicadores respondidos
// de forma direta, do jeito que o lojista realmente usaria no dia a dia.
// ===================================================================
const { query } = require('../config/database');

async function obterInteligencia(req, res) {
  const estabelecimentoId = req.estabelecimentoId;

  try {
    const [
      maisVendidoHoje,
      parados30Dias,
      acabando,
      lucro30Dias,
      valorInvestido,
      ultimasCompras,
      canalPorProduto
    ] = await Promise.all([
      obterMaisVendidoHoje(estabelecimentoId),
      obterProdutosParados(estabelecimentoId),
      obterProdutosAcabando(estabelecimentoId),
      obterLucro30Dias(estabelecimentoId),
      obterValorInvestido(estabelecimentoId),
      obterUltimasComprasPorFornecedor(estabelecimentoId),
      obterCanalTopPorProduto(estabelecimentoId)
    ]);

    // "Vende muito mas gera pouco lucro": dentro dos produtos vendidos nos
    // ultimos 30 dias, pega quem esta na metade de cima em quantidade
    // vendida e, dentre esses, o de menor lucro por unidade.
    const vendeMuitoLucraPouco = calcularVendeMuitoLucraPouco(lucro30Dias.produtos);
    const maiorLucro = lucro30Dias.produtos[0] || null;

    res.json({
      mais_vendido_hoje: maisVendidoHoje,
      produtos_parados: parados30Dias,
      produtos_acabando: acabando,
      maior_lucro_30_dias: maiorLucro,
      vende_muito_lucra_pouco: vendeMuitoLucraPouco,
      valor_investido_estoque: valorInvestido,
      ultimas_compras_por_fornecedor: ultimasCompras,
      canal_top_por_produto: canalPorProduto
    });
  } catch (error) {
    console.error('Erro ao montar Centro de Inteligencia do Estoque:', error);
    res.status(500).json({ erro: 'Erro interno ao montar o Centro de Inteligencia.' });
  }
}

async function obterMaisVendidoHoje(estabelecimentoId) {
  const resultado = await query(
    `SELECT item->>'nome' AS nome, SUM((item->>'quantidade')::int) AS quantidade
     FROM pedidos p, jsonb_array_elements(p.itens) AS item
     WHERE p.estabelecimento_id = $1 AND p.status_pedido != 'cancelado'
       AND p.criado_em >= CURRENT_DATE
     GROUP BY item->>'nome'
     ORDER BY quantidade DESC
     LIMIT 1`,
    [estabelecimentoId]
  );
  return resultado.rows[0] || null;
}

async function obterProdutosParados(estabelecimentoId) {
  const resultado = await query(
    `SELECT p.nome,
       COALESCE(
         (SELECT MAX(m.criado_em) FROM estoque_movimentacoes m WHERE m.produto_id = p.id AND m.motivo = 'venda'),
         p.criado_em
       ) AS referencia
     FROM produtos p
     WHERE p.estabelecimento_id = $1 AND p.controla_estoque = true`,
    [estabelecimentoId]
  );

  const agora = Date.now();
  return resultado.rows
    .map(p => ({ nome: p.nome, dias_parado: Math.floor((agora - new Date(p.referencia).getTime()) / 86400000) }))
    .filter(p => p.dias_parado >= 30)
    .sort((a, b) => b.dias_parado - a.dias_parado)
    .slice(0, 5);
}

async function obterProdutosAcabando(estabelecimentoId) {
  const resultado = await query(
    `SELECT nome, estoque, estoque_minimo
     FROM produtos
     WHERE estabelecimento_id = $1 AND controla_estoque = true AND estoque <= estoque_minimo
     ORDER BY estoque ASC
     LIMIT 5`,
    [estabelecimentoId]
  );
  return resultado.rows;
}

async function obterLucro30Dias(estabelecimentoId) {
  const vendidos = await query(
    `SELECT
       (item->>'produto_id') AS produto_id,
       item->>'nome' AS nome,
       SUM((item->>'quantidade')::int) AS quantidade_vendida
     FROM pedidos p, jsonb_array_elements(p.itens) AS item
     WHERE p.estabelecimento_id = $1 AND p.status_pedido != 'cancelado'
       AND p.criado_em >= NOW() - INTERVAL '30 days'
     GROUP BY produto_id, nome`,
    [estabelecimentoId]
  );

  if (vendidos.rows.length === 0) return { produtos: [] };

  const produtoIds = vendidos.rows.map(r => r.produto_id);
  const custosRes = await query('SELECT id, preco, custo_compra FROM produtos WHERE id = ANY($1::uuid[])', [produtoIds]);
  const custosPorId = {};
  custosRes.rows.forEach(p => { custosPorId[p.id] = p; });

  const produtos = vendidos.rows.map(v => {
    const info = custosPorId[v.produto_id] || {};
    const preco = Number(info.preco) || 0;
    const custo = Number(info.custo_compra) || 0;
    const lucroUnitario = preco - custo;
    const quantidade = Number(v.quantidade_vendida) || 0;
    return { nome: v.nome, quantidade_vendida: quantidade, lucro_unitario: lucroUnitario, lucro_total: lucroUnitario * quantidade };
  }).sort((a, b) => b.lucro_total - a.lucro_total);

  return { produtos };
}

function calcularVendeMuitoLucraPouco(produtos) {
  if (!produtos || produtos.length < 3) return null;

  const quantidades = produtos.map(p => p.quantidade_vendida).sort((a, b) => a - b);
  const medianaQuantidade = quantidades[Math.floor(quantidades.length / 2)];

  const candidatos = produtos.filter(p => p.quantidade_vendida >= medianaQuantidade);
  if (candidatos.length === 0) return null;

  return candidatos.reduce((pior, atual) => (atual.lucro_unitario < pior.lucro_unitario ? atual : pior));
}

async function obterValorInvestido(estabelecimentoId) {
  const resultado = await query(
    `SELECT COALESCE(SUM(estoque * custo_compra), 0) AS total
     FROM produtos WHERE estabelecimento_id = $1 AND controla_estoque = true`,
    [estabelecimentoId]
  );
  return Number(resultado.rows[0].total) || 0;
}

async function obterUltimasComprasPorFornecedor(estabelecimentoId) {
  const resultado = await query(
    `SELECT f.nome AS fornecedor_nome, p.nome AS produto_nome, m.quantidade, m.criado_em
     FROM estoque_movimentacoes m
     JOIN produtos p ON p.id = m.produto_id
     LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
     WHERE m.estabelecimento_id = $1 AND m.motivo = 'compra'
     ORDER BY m.criado_em DESC
     LIMIT 5`,
    [estabelecimentoId]
  );
  return resultado.rows.map(r => ({ ...r, fornecedor_nome: r.fornecedor_nome || 'Sem fornecedor cadastrado' }));
}

async function obterCanalTopPorProduto(estabelecimentoId) {
  const resultado = await query(
    `SELECT item->>'nome' AS nome, COALESCE(p.canal_venda, 'delivery') AS canal,
            SUM((item->>'quantidade')::int) AS quantidade
     FROM pedidos p, jsonb_array_elements(p.itens) AS item
     WHERE p.estabelecimento_id = $1 AND p.status_pedido != 'cancelado'
       AND p.criado_em >= NOW() - INTERVAL '30 days'
     GROUP BY item->>'nome', p.canal_venda`,
    [estabelecimentoId]
  );

  const porProduto = {};
  resultado.rows.forEach(r => {
    if (!porProduto[r.nome]) porProduto[r.nome] = [];
    porProduto[r.nome].push({ canal: r.canal, quantidade: Number(r.quantidade) || 0 });
  });

  return Object.entries(porProduto).map(([nome, canais]) => {
    const top = canais.sort((a, b) => b.quantidade - a.quantidade)[0];
    return { nome, canal_top: top.canal, quantidade: top.quantidade };
  }).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8);
}

module.exports = { obterInteligencia };
