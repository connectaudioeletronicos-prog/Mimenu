// ===================================================================
// Controller do Controle de Estoque
// Caminho no projeto: backend/src/controllers/estoqueController.js
// ===================================================================
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { calcularStatus, registrarMovimentacao, verificarEDispararAlerta } = require('../utils/estoque');

// ---------- Listagem e indicadores ----------

async function listarProdutosEstoque(req, res) {
  try {
    const resultado = await query(
      `SELECT p.id, p.codigo, p.nome, p.estoque, p.estoque_minimo, p.custo_compra,
              p.preco, p.data_ultima_compra, p.controla_estoque, p.fornecedor_id,
              f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.estabelecimento_id = $1 AND p.controla_estoque = true
       ORDER BY p.nome ASC`,
      [req.estabelecimentoId]
    );

    const produtos = resultado.rows.map(p => ({
      ...p,
      status: calcularStatus(p.estoque, p.estoque_minimo),
      valor_total: (Number(p.estoque) || 0) * (Number(p.custo_compra) || 0)
    }));

    res.json(produtos);
  } catch (error) {
    console.error('Erro ao listar produtos do estoque:', error);
    res.status(500).json({ erro: 'Erro interno ao listar estoque.' });
  }
}

async function obterIndicadores(req, res) {
  try {
    const resultado = await query(
      `SELECT id, nome, estoque, estoque_minimo, custo_compra, preco
       FROM produtos WHERE estabelecimento_id = $1 AND controla_estoque = true`,
      [req.estabelecimentoId]
    );

    let valorTotalEstoque = 0;
    let lucroEstimado = 0;
    let baixoEstoque = 0;
    let esgotados = 0;

    for (const p of resultado.rows) {
      const estoque = Number(p.estoque) || 0;
      const custo = Number(p.custo_compra) || 0;
      const preco = Number(p.preco) || 0;
      valorTotalEstoque += estoque * custo;
      lucroEstimado += estoque * (preco - custo);

      const status = calcularStatus(estoque, p.estoque_minimo);
      if (status === 'esgotado') esgotados++;
      else if (status === 'atencao') baixoEstoque++;
    }

    res.json({
      valor_total_estoque: valorTotalEstoque,
      lucro_estimado_estoque: lucroEstimado,
      produtos_baixo_estoque: baixoEstoque,
      produtos_esgotados: esgotados,
      total_produtos_controlados: resultado.rows.length
    });
  } catch (error) {
    console.error('Erro ao obter indicadores de estoque:', error);
    res.status(500).json({ erro: 'Erro interno ao obter indicadores.' });
  }
}

// ---------- Movimentacoes manuais (compra / ajuste) ----------

async function registrarCompra(req, res) {
  try {
    const { produto_id, quantidade, custo_compra, fornecedor_id, observacoes } = req.body;
    const qtd = parseInt(quantidade, 10);

    if (!produto_id || !qtd || qtd <= 0) {
      return res.status(400).json({ erro: 'Informe o produto e uma quantidade valida.' });
    }

    const prodRes = await query(
      'SELECT id, nome, estoque, estoque_minimo, controla_estoque FROM produtos WHERE id = $1 AND estabelecimento_id = $2',
      [produto_id, req.estabelecimentoId]
    );
    if (prodRes.rows.length === 0) return res.status(404).json({ erro: 'Produto nao encontrado.' });
    const produto = prodRes.rows[0];

    const novoEstoque = (Number(produto.estoque) || 0) + qtd;

    const campos = ['estoque = $1', 'data_ultima_compra = NOW()'];
    const valores = [novoEstoque];
    let indice = 2;
    if (custo_compra !== undefined && custo_compra !== '') {
      campos.push(`custo_compra = $${indice}`);
      valores.push(parseFloat(custo_compra));
      indice++;
    }
    if (fornecedor_id) {
      campos.push(`fornecedor_id = $${indice}`);
      valores.push(fornecedor_id);
      indice++;
    }
    valores.push(produto_id);

    const atualizado = await query(
      `UPDATE produtos SET ${campos.join(', ')} WHERE id = $${indice} RETURNING *`,
      valores
    );

    await registrarMovimentacao({
      estabelecimentoId: req.estabelecimentoId,
      produtoId: produto_id,
      tipo: 'entrada',
      motivo: 'compra',
      quantidade: qtd,
      estoqueResultante: novoEstoque,
      funcionarioId: req.funcionarioId || null,
      observacoes: observacoes || null
    });

    res.status(201).json(atualizado.rows[0]);
  } catch (error) {
    console.error('Erro ao registrar compra de estoque:', error);
    res.status(500).json({ erro: 'Erro interno ao registrar compra.' });
  }
}

async function ajustarManual(req, res) {
  try {
    const { produto_id, novo_estoque, observacoes } = req.body;
    const novoEstoque = parseInt(novo_estoque, 10);

    if (!produto_id || isNaN(novoEstoque) || novoEstoque < 0) {
      return res.status(400).json({ erro: 'Informe o produto e um novo estoque valido.' });
    }

    const prodRes = await query(
      'SELECT id, nome, estoque, estoque_minimo FROM produtos WHERE id = $1 AND estabelecimento_id = $2',
      [produto_id, req.estabelecimentoId]
    );
    if (prodRes.rows.length === 0) return res.status(404).json({ erro: 'Produto nao encontrado.' });
    const produto = prodRes.rows[0];

    await query('UPDATE produtos SET estoque = $1 WHERE id = $2', [novoEstoque, produto_id]);

    await registrarMovimentacao({
      estabelecimentoId: req.estabelecimentoId,
      produtoId: produto_id,
      tipo: 'ajuste',
      motivo: 'ajuste_manual',
      quantidade: novoEstoque - (Number(produto.estoque) || 0),
      estoqueResultante: novoEstoque,
      funcionarioId: req.funcionarioId || null,
      observacoes: observacoes || null
    });

    await verificarEDispararAlerta(req.estabelecimentoId, { ...produto, estoque: novoEstoque }, Number(produto.estoque) || 0);

    res.json({ mensagem: 'Estoque ajustado com sucesso.' });
  } catch (error) {
    console.error('Erro ao ajustar estoque manualmente:', error);
    res.status(500).json({ erro: 'Erro interno ao ajustar estoque.' });
  }
}

// ---------- Historico ----------

async function listarMovimentacoes(req, res) {
  try {
    const { produto_id, limite } = req.query;
    let sql = `
      SELECT m.*, p.nome AS produto_nome, f.nome AS funcionario_nome
      FROM estoque_movimentacoes m
      LEFT JOIN produtos p ON p.id = m.produto_id
      LEFT JOIN funcionarios f ON f.id = m.funcionario_id
      WHERE m.estabelecimento_id = $1`;
    const params = [req.estabelecimentoId];

    if (produto_id) {
      params.push(produto_id);
      sql += ` AND m.produto_id = $${params.length}`;
    }
    sql += ' ORDER BY m.criado_em DESC';

    const limiteFinal = Math.min(parseInt(limite, 10) || 50, 200);
    params.push(limiteFinal);
    sql += ` LIMIT $${params.length}`;

    const resultado = await query(sql, params);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar movimentacoes de estoque:', error);
    res.status(500).json({ erro: 'Erro interno ao listar movimentacoes.' });
  }
}

async function listarNotificacoes(req, res) {
  try {
    const resultado = await query(
      `SELECT n.*, p.nome AS produto_nome
       FROM estoque_notificacoes n
       LEFT JOIN produtos p ON p.id = n.produto_id
       WHERE n.estabelecimento_id = $1
       ORDER BY n.criado_em DESC LIMIT 50`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar notificacoes de estoque:', error);
    res.status(500).json({ erro: 'Erro interno ao listar notificacoes.' });
  }
}

// ---------- Configuracao do modulo (ativar/desativar, senha, alertas) ----------

async function obterConfiguracao(req, res) {
  try {
    const resultado = await query(
      `SELECT estoque_modulo_ativo, estoque_senha_protegida, estoque_alerta_dashboard_ativo,
              estoque_alerta_email_ativo, estoque_alerta_email_destino
       FROM estabelecimentos WHERE id = $1`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao obter configuracao de estoque:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function alternarModulo(req, res) {
  try {
    const { ativo } = req.body;
    await query('UPDATE estabelecimentos SET estoque_modulo_ativo = $1 WHERE id = $2', [!!ativo, req.estabelecimentoId]);
    res.json({ mensagem: ativo ? 'Controle de estoque ativado.' : 'Controle de estoque desativado.' });
  } catch (error) {
    console.error('Erro ao alternar modulo de estoque:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

// Exige a senha de login do estabelecimento pra confirmar tanto a entrada
// na tela (quando estoque_senha_protegida = true) quanto qualquer mudanca
// na propria protecao por senha.
async function verificarSenha(req, res) {
  try {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Informe a senha.' });

    const resultado = await query('SELECT senha_hash FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const senhaCorreta = await bcrypt.compare(senha, resultado.rows[0].senha_hash);
    if (!senhaCorreta) return res.status(401).json({ valido: false, erro: 'Senha incorreta.' });

    res.json({ valido: true });
  } catch (error) {
    console.error('Erro ao verificar senha do estoque:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function alternarProtecaoSenha(req, res) {
  try {
    const { ativo, senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Confirme sua senha para alterar essa configuracao.' });

    const resultado = await query('SELECT senha_hash FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const senhaCorreta = await bcrypt.compare(senha, resultado.rows[0].senha_hash);
    if (!senhaCorreta) return res.status(401).json({ erro: 'Senha incorreta.' });

    await query('UPDATE estabelecimentos SET estoque_senha_protegida = $1 WHERE id = $2', [!!ativo, req.estabelecimentoId]);
    res.json({ mensagem: ativo ? 'Protecao por senha ativada.' : 'Protecao por senha desativada.' });
  } catch (error) {
    console.error('Erro ao alternar protecao por senha do estoque:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function atualizarAlertas(req, res) {
  try {
    const { estoque_alerta_dashboard_ativo, estoque_alerta_email_ativo, estoque_alerta_email_destino } = req.body;

    const resultado = await query(
      `UPDATE estabelecimentos SET
        estoque_alerta_dashboard_ativo = COALESCE($1, estoque_alerta_dashboard_ativo),
        estoque_alerta_email_ativo = COALESCE($2, estoque_alerta_email_ativo),
        estoque_alerta_email_destino = $3
       WHERE id = $4
       RETURNING estoque_alerta_dashboard_ativo, estoque_alerta_email_ativo, estoque_alerta_email_destino`,
      [estoque_alerta_dashboard_ativo, estoque_alerta_email_ativo, estoque_alerta_email_destino || null, req.estabelecimentoId]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar alertas de estoque:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = {
  listarProdutosEstoque,
  obterIndicadores,
  registrarCompra,
  ajustarManual,
  listarMovimentacoes,
  listarNotificacoes,
  obterConfiguracao,
  alternarModulo,
  verificarSenha,
  alternarProtecaoSenha,
  atualizarAlertas
};
