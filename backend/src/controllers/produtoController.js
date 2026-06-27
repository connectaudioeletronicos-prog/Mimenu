// ===================================================================
// Controller de produtos (gerenciados pelo painel admin)
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');

async function listar(req, res) {
  try {
    const resultado = await query(
      `SELECT p.*, c.nome as categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.estabelecimento_id = $1
       ORDER BY p.ordem ASC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ erro: 'Erro interno ao listar produtos.' });
  }
}

async function criar(req, res) {
  try {
    const { categoria_id, codigo, nome, descricao, preco, preco_promocional, ordem } = req.body;

    if (!nome || nome.trim() === '') {
      return res.status(400).json({ erro: 'O nome do produto e obrigatorio.' });
    }
    if (preco === undefined || isNaN(parseFloat(preco)) || parseFloat(preco) < 0) {
      return res.status(400).json({ erro: 'O preco informado e invalido.' });
    }

    let fotoUrl = null;
    if (req.file) {
      fotoUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'produtos');
    }

    const resultado = await query(
      `INSERT INTO produtos
        (estabelecimento_id, categoria_id, codigo, nome, descricao, preco, preco_promocional, foto_url, ordem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.estabelecimentoId,
        categoria_id || null,
        codigo || null,
        nome.trim(),
        descricao || null,
        parseFloat(preco),
        preco_promocional ? parseFloat(preco_promocional) : null,
        fotoUrl,
        ordem || 0
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ erro: 'Erro interno ao criar produto.' });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { categoria_id, codigo, nome, descricao, preco, preco_promocional, ordem, disponivel } = req.body;

    const verificacao = await query(
      'SELECT id, foto_url FROM produtos WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Produto nao encontrado.' });
    }

    let fotoUrl = verificacao.rows[0].foto_url;
    if (req.file) {
      fotoUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'produtos');
    }

    const resultado = await query(
      `UPDATE produtos SET
        categoria_id = COALESCE($1, categoria_id),
        codigo = COALESCE($2, codigo),
        nome = COALESCE($3, nome),
        descricao = COALESCE($4, descricao),
        preco = COALESCE($5, preco),
        preco_promocional = $6,
        foto_url = $7,
        ordem = COALESCE($8, ordem),
        disponivel = COALESCE($9, disponivel)
       WHERE id = $10 RETURNING *`,
      [
        categoria_id, codigo, nome, descricao,
        preco !== undefined ? parseFloat(preco) : undefined,
        preco_promocional !== undefined ? (preco_promocional ? parseFloat(preco_promocional) : null) : verificacao.rows[0].preco_promocional,
        fotoUrl, ordem, disponivel, id
      ]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar produto.' });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;

    const resultado = await query(
      'DELETE FROM produtos WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Produto nao encontrado.' });
    }

    res.json({ mensagem: 'Produto excluido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir produto.' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
