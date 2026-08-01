// ===================================================================
// Controller de Fornecedores
// Caminho no projeto: backend/src/controllers/fornecedorController.js
// ===================================================================
const { query } = require('../config/database');

async function listar(req, res) {
  try {
    const resultado = await query(
      'SELECT * FROM fornecedores WHERE estabelecimento_id = $1 AND ativo = true ORDER BY nome ASC',
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar fornecedores:', error);
    res.status(500).json({ erro: 'Erro interno ao listar fornecedores.' });
  }
}

async function criar(req, res) {
  try {
    const { nome, telefone, email, observacoes } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome do fornecedor e obrigatorio.' });
    }

    const resultado = await query(
      `INSERT INTO fornecedores (estabelecimento_id, nome, telefone, email, observacoes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.estabelecimentoId, nome.trim(), telefone || null, email || null, observacoes || null]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar fornecedor:', error);
    res.status(500).json({ erro: 'Erro interno ao criar fornecedor.' });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, telefone, email, observacoes } = req.body;

    const atualizado = await query(
      `UPDATE fornecedores SET
        nome = COALESCE($1, nome),
        telefone = $2,
        email = $3,
        observacoes = $4
       WHERE id = $5 AND estabelecimento_id = $6 RETURNING *`,
      [nome, telefone || null, email || null, observacoes || null, id, req.estabelecimentoId]
    );

    if (atualizado.rows.length === 0) return res.status(404).json({ erro: 'Fornecedor nao encontrado.' });

    res.json(atualizado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar fornecedor:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar fornecedor.' });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      'UPDATE fornecedores SET ativo = false WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Fornecedor nao encontrado.' });
    res.json({ mensagem: 'Fornecedor removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir fornecedor:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir fornecedor.' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
