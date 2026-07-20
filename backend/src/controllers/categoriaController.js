// ===================================================================
// Controller de categorias (gerenciadas pelo painel admin)
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');

async function listar(req, res) {
  try {
    const resultado = await query(
      'SELECT * FROM categorias WHERE estabelecimento_id = $1 ORDER BY ordem ASC',
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    res.status(500).json({ erro: 'Erro interno ao listar categorias.' });
  }
}

async function criar(req, res) {
  try {
    const { nome, ordem, descricao } = req.body;

    if (!nome || nome.trim() === '') {
      return res.status(400).json({ erro: 'O nome da categoria e obrigatorio.' });
    }

    let iconeUrl = null;
    if (req.file) {
      iconeUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'categorias');
    }

    const resultado = await query(
      'INSERT INTO categorias (estabelecimento_id, nome, icone_url, ordem, descricao) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.estabelecimentoId, nome.trim(), iconeUrl, ordem || 0, descricao || null]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({ erro: 'Erro interno ao criar categoria.' });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, ordem, ativo, descricao } = req.body;

    const verificacao = await query(
      'SELECT id FROM categorias WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Categoria nao encontrada.' });
    }

    let iconeUrl;
    if (req.file) {
      iconeUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'categorias');
    }

    const resultado = await query(
      `UPDATE categorias SET
        nome = COALESCE($1, nome),
        ordem = COALESCE($2, ordem),
        ativo = COALESCE($3, ativo),
        icone_url = COALESCE($4, icone_url),
        descricao = COALESCE($5, descricao)
       WHERE id = $6 RETURNING *`,
      [nome, ordem, ativo, iconeUrl, descricao, id]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar categoria.' });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;

    const resultado = await query(
      'DELETE FROM categorias WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Categoria nao encontrada.' });
    }

    res.json({ mensagem: 'Categoria excluida com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir categoria.' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
