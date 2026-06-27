// ===================================================================
// Controller de promocoes (banners de destaque na home)
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');

async function listar(req, res) {
  try {
    const resultado = await query(
      'SELECT * FROM promocoes WHERE estabelecimento_id = $1 ORDER BY criado_em DESC',
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar promocoes:', error);
    res.status(500).json({ erro: 'Erro interno ao listar promocoes.' });
  }
}

async function criar(req, res) {
  try {
    const { titulo, descricao, produto_id, data_inicio, data_fim } = req.body;

    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({ erro: 'O titulo da promocao e obrigatorio.' });
    }

    let imagemUrl = null;
    if (req.file) {
      imagemUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'promocoes');
    }

    const resultado = await query(
      `INSERT INTO promocoes
        (estabelecimento_id, titulo, descricao, imagem_url, produto_id, data_inicio, data_fim)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.estabelecimentoId, titulo.trim(), descricao || null, imagemUrl, produto_id || null, data_inicio || null, data_fim || null]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar promocao:', error);
    res.status(500).json({ erro: 'Erro interno ao criar promocao.' });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { titulo, descricao, produto_id, data_inicio, data_fim, ativo } = req.body;

    const verificacao = await query(
      'SELECT id, imagem_url FROM promocoes WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Promocao nao encontrada.' });
    }

    let imagemUrl = verificacao.rows[0].imagem_url;
    if (req.file) {
      imagemUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'promocoes');
    }

    const resultado = await query(
      `UPDATE promocoes SET
        titulo = COALESCE($1, titulo),
        descricao = COALESCE($2, descricao),
        produto_id = $3,
        data_inicio = $4,
        data_fim = $5,
        ativo = COALESCE($6, ativo),
        imagem_url = $7
       WHERE id = $8 RETURNING *`,
      [titulo, descricao, produto_id, data_inicio, data_fim, ativo, imagemUrl, id]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar promocao:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar promocao.' });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      'DELETE FROM promocoes WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Promocao nao encontrada.' });
    }
    res.json({ mensagem: 'Promocao excluida com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir promocao:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir promocao.' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
