// ===================================================================
// Controller de Relatorios de Vendas (usado pela pagina "Vendas &
// Inteligencia" do Controle de Estoque)
// Caminho no projeto: backend/src/controllers/relatorioVendasController.js
// ===================================================================
const { query } = require('../config/database');
const { resolverIntervalo } = require('../utils/periodo');

// Todas as consultas ignoram pedidos cancelados. Um pedido conta como
// "venda" a partir do momento em que e criado (e quando o estoque ja foi
// baixado), independente do status_pedido atual (novo/preparando/entregue).

function obterIntervaloDaQuery(req) {
  const { intervalo = 'hoje', data_inicio, data_fim } = req.query;
  return resolverIntervalo(intervalo, data_inicio, data_fim);
}

async function vendasPorPeriodo(req, res) {
  try {
    const { inicio, fim } = obterIntervaloDaQuery(req);
    const resultado = await query(
      `SELECT DATE(criado_em) AS dia, SUM(total) AS total
       FROM pedidos
       WHERE estabelecimento_id = $1 AND status_pedido != 'cancelado' AND criado_em BETWEEN $2 AND $3
       GROUP BY DATE(criado_em)
       ORDER BY dia ASC`,
      [req.estabelecimentoId, inicio, fim]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao obter vendas por periodo:', error);
    res.status(500).json({ erro: 'Erro interno ao obter vendas por periodo.' });
  }
}

async function vendasPorCanal(req, res) {
  try {
    const { inicio, fim } = obterIntervaloDaQuery(req);
    const resultado = await query(
      `SELECT COALESCE(canal_venda, 'delivery') AS canal, SUM(total) AS total, COUNT(*) AS pedidos
       FROM pedidos
       WHERE estabelecimento_id = $1 AND status_pedido != 'cancelado' AND criado_em BETWEEN $2 AND $3
       GROUP BY canal_venda`,
      [req.estabelecimentoId, inicio, fim]
    );

    const base = { delivery: 0, retirada: 0, balcao: 0, mesa: 0 };
    resultado.rows.forEach(r => { base[r.canal] = Number(r.total) || 0; });

    res.json(base);
  } catch (error) {
    console.error('Erro ao obter vendas por canal:', error);
    res.status(500).json({ erro: 'Erro interno ao obter vendas por canal.' });
  }
}

async function vendasPorProduto(req, res) {
  try {
    const { inicio, fim } = obterIntervaloDaQuery(req);
    const resultado = await query(
      `SELECT
         (item->>'produto_id') AS produto_id,
         item->>'nome' AS nome,
         SUM((item->>'quantidade')::int) AS quantidade_vendida,
         SUM((item->>'quantidade')::int * COALESCE((item->>'preco_unitario')::numeric, (item->>'preco')::numeric, 0)) AS valor_vendido
       FROM pedidos p, jsonb_array_elements(p.itens) AS item
       WHERE p.estabelecimento_id = $1 AND p.status_pedido != 'cancelado' AND p.criado_em BETWEEN $2 AND $3
       GROUP BY produto_id, nome
       ORDER BY quantidade_vendida DESC`,
      [req.estabelecimentoId, inicio, fim]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao obter vendas por produto:', error);
    res.status(500).json({ erro: 'Erro interno ao obter vendas por produto.' });
  }
}

async function lucroPorProduto(req, res) {
  try {
    const { inicio, fim } = obterIntervaloDaQuery(req);
    const vendidos = await query(
      `SELECT
         (item->>'produto_id') AS produto_id,
         item->>'nome' AS nome,
         SUM((item->>'quantidade')::int) AS quantidade_vendida
       FROM pedidos p, jsonb_array_elements(p.itens) AS item
       WHERE p.estabelecimento_id = $1 AND p.status_pedido != 'cancelado' AND p.criado_em BETWEEN $2 AND $3
       GROUP BY produto_id, nome
       ORDER BY quantidade_vendida DESC`,
      [req.estabelecimentoId, inicio, fim]
    );

    if (vendidos.rows.length === 0) return res.json({ produtos: [], lucro_total: 0 });

    const produtoIds = vendidos.rows.map(r => r.produto_id);
    const custosRes = await query(
      `SELECT id, preco, custo_compra FROM produtos WHERE id = ANY($1::uuid[])`,
      [produtoIds]
    );
    const custosPorId = {};
    custosRes.rows.forEach(p => { custosPorId[p.id] = p; });

    let lucroTotalGeral = 0;
    const produtos = vendidos.rows.map(v => {
      const info = custosPorId[v.produto_id] || {};
      const preco = Number(info.preco) || 0;
      const custo = Number(info.custo_compra) || 0;
      const lucroUnitario = preco - custo;
      const quantidade = Number(v.quantidade_vendida) || 0;
      const lucroTotal = lucroUnitario * quantidade;
      lucroTotalGeral += lucroTotal;

      return {
        produto_id: v.produto_id,
        nome: v.nome,
        preco,
        custo_compra: custo,
        lucro_unitario: lucroUnitario,
        quantidade_vendida: quantidade,
        lucro_total: lucroTotal
      };
    }).sort((a, b) => b.lucro_total - a.lucro_total);

    res.json({ produtos, lucro_total: lucroTotalGeral });
  } catch (error) {
    console.error('Erro ao obter lucro por produto:', error);
    res.status(500).json({ erro: 'Erro interno ao obter lucro por produto.' });
  }
}

module.exports = { vendasPorPeriodo, vendasPorCanal, vendasPorProduto, lucroPorProduto };
