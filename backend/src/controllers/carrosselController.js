// ===================================================================
// Controller de carrosseis extras (grupos de banners com fotos ilimitadas)
// Cada estabelecimento pode ter varios carrosseis, cada um posicionavel
// em um ponto diferente da pagina publica. Comecam desativados por padrao.
// ===================================================================
const { query } = require('../config/database');
const { normalizarPosicao } = require('../utils/posicao');
const { uploadImagem } = require('../utils/storage');


async function listar(req, res) {
  try {
    const carrosseis = await query(
      'SELECT * FROM carrosseis WHERE estabelecimento_id = $1 ORDER BY ordem ASC, criado_em ASC',
      [req.estabelecimentoId]
    );

    const imagens = await query(
      `SELECT ci.* FROM carrossel_imagens ci
       INNER JOIN carrosseis c ON c.id = ci.carrossel_id
       WHERE c.estabelecimento_id = $1
       ORDER BY ci.ordem ASC, ci.criado_em ASC`,
      [req.estabelecimentoId]
    );

    const resultado = carrosseis.rows.map(carrossel => ({
      ...carrossel,
      imagens: imagens.rows.filter(img => img.carrossel_id === carrossel.id)
    }));

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao listar carrosseis:', error);
    res.status(500).json({ erro: 'Erro interno ao listar carrosseis.' });
  }
}

async function criar(req, res) {
  try {
    const { nome, posicao, ordem } = req.body;
    const posicaoFinal = normalizarPosicao(posicao);

    const resultado = await query(
      `INSERT INTO carrosseis (estabelecimento_id, nome, posicao, ordem, ativo)
       VALUES ($1, $2, $3, $4, false) RETURNING *`,
      [req.estabelecimentoId, (nome || 'Carrossel').trim(), posicaoFinal, ordem || 0]
    );

    res.status(201).json({ ...resultado.rows[0], imagens: [] });
  } catch (error) {
    console.error('Erro ao criar carrossel:', error);
    res.status(500).json({ erro: 'Erro ao criar carrossel: ' + (error.message || 'erro desconhecido') });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, posicao, ativo, ordem } = req.body;

    const verificacao = await query(
      'SELECT id FROM carrosseis WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Carrossel nao encontrado.' });
    }

    const posicaoFinal = posicao !== undefined
      ? (normalizarPosicao(posicao))
      : undefined;

    const resultado = await query(
      `UPDATE carrosseis SET
        nome = COALESCE($1, nome),
        posicao = COALESCE($2, posicao),
        ativo = COALESCE($3, ativo),
        ordem = COALESCE($4, ordem)
       WHERE id = $5 RETURNING *`,
      [nome, posicaoFinal, ativo, ordem, id]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar carrossel:', error);
    res.status(500).json({ erro: 'Erro ao atualizar carrossel: ' + (error.message || 'erro desconhecido') });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      'DELETE FROM carrosseis WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Carrossel nao encontrado.' });
    }
    res.json({ mensagem: 'Carrossel excluido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir carrossel:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir carrossel.' });
  }
}

async function adicionarImagem(req, res) {
  try {
    const { id } = req.params;
    const { produto_id } = req.body;

    const verificacao = await query(
      'SELECT id FROM carrosseis WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Carrossel nao encontrado.' });
    }

    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });
    }

    const contagem = await query(
      'SELECT COUNT(*)::int AS total FROM carrossel_imagens WHERE carrossel_id = $1',
      [id]
    );

    const imagemUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'carrosseis');

    const resultado = await query(
      `INSERT INTO carrossel_imagens (carrossel_id, imagem_url, ordem, produto_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, imagemUrl, contagem.rows[0].total, produto_id || null]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao adicionar imagem ao carrossel:', error);
    res.status(500).json({ erro: 'Erro interno ao adicionar imagem.' });
  }
}

async function atualizarImagem(req, res) {
  try {
    const { imagemId } = req.params;
    const { ordem, produto_id } = req.body;

    // produto_id pode vir vazio ("") quando o lojista quer desvincular a
    // imagem do produto - nesse caso gravamos NULL de verdade, em vez de
    // ignorar a mudanca (por isso nao da pra usar so COALESCE aqui).
    const produtoIdParaSalvar = produto_id === '' ? null : produto_id;
    const devesAtualizarProduto = produto_id !== undefined;

    const resultado = await query(
      `UPDATE carrossel_imagens SET
        ordem = COALESCE($1, ordem),
        produto_id = CASE WHEN $2 THEN $3::uuid ELSE produto_id END
       WHERE id = $4 AND carrossel_id IN (SELECT id FROM carrosseis WHERE estabelecimento_id = $5)
       RETURNING *`,
      [ordem, devesAtualizarProduto, produtoIdParaSalvar, imagemId, req.estabelecimentoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Imagem nao encontrada.' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar imagem do carrossel:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar imagem.' });
  }
}

async function removerImagem(req, res) {
  try {
    const { imagemId } = req.params;

    const resultado = await query(
      `DELETE FROM carrossel_imagens
       WHERE id = $1 AND carrossel_id IN (SELECT id FROM carrosseis WHERE estabelecimento_id = $2)
       RETURNING id`,
      [imagemId, req.estabelecimentoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Imagem nao encontrada.' });
    }

    res.json({ mensagem: 'Imagem removida com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover imagem do carrossel:', error);
    res.status(500).json({ erro: 'Erro interno ao remover imagem.' });
  }
}

module.exports = { listar, criar, atualizar, excluir, adicionarImagem, atualizarImagem, removerImagem };
