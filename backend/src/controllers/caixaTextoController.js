// ===================================================================
// Controller de caixas de texto (titulo + corpo, posicionavel)
// Mesmo padrao de carrosseis/vitrines: comeca desativada, o lojista
// ativa quando quiser e escolhe a posicao entre 5 pontos da pagina.
// ===================================================================
const { query } = require('../config/database');
const { normalizarPosicao } = require('../utils/posicao');

const LIMITE_TITULO = 100;
const LIMITE_CORPO = 600;

async function listar(req, res) {
  try {
    const resultado = await query(
      'SELECT * FROM caixas_texto WHERE estabelecimento_id = $1 ORDER BY ordem ASC, criado_em ASC',
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar caixas de texto:', error);
    res.status(500).json({ erro: 'Erro interno ao listar caixas de texto.' });
  }
}

async function criar(req, res) {
  try {
    const { titulo, corpo, posicao, ordem } = req.body;

    if (!corpo || !corpo.trim()) {
      return res.status(400).json({ erro: 'O texto da caixa e obrigatorio.' });
    }

    const tituloFinal = (titulo || 'Aviso').slice(0, LIMITE_TITULO);
    const corpoFinal = corpo.slice(0, LIMITE_CORPO);
    const posicaoFinal = normalizarPosicao(posicao);

    const resultado = await query(
      `INSERT INTO caixas_texto (estabelecimento_id, titulo, corpo, posicao, ordem, ativo)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
      [req.estabelecimentoId, tituloFinal, corpoFinal, posicaoFinal, ordem || 0]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar caixa de texto:', error);
    res.status(500).json({ erro: 'Erro interno ao criar caixa de texto.' });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { titulo, corpo, posicao, ativo, ordem } = req.body;

    const verificacao = await query(
      'SELECT id FROM caixas_texto WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Caixa de texto nao encontrada.' });
    }

    const tituloFinal = titulo !== undefined ? titulo.slice(0, LIMITE_TITULO) : undefined;
    const corpoFinal = corpo !== undefined ? corpo.slice(0, LIMITE_CORPO) : undefined;
    const posicaoFinal = posicao !== undefined
      ? (normalizarPosicao(posicao))
      : undefined;

    const resultado = await query(
      `UPDATE caixas_texto SET
        titulo = COALESCE($1, titulo),
        corpo = COALESCE($2, corpo),
        posicao = COALESCE($3, posicao),
        ativo = COALESCE($4, ativo),
        ordem = COALESCE($5, ordem),
        atualizado_em = NOW()
       WHERE id = $6 RETURNING *`,
      [tituloFinal, corpoFinal, posicaoFinal, ativo, ordem, id]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar caixa de texto:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar caixa de texto.' });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      'DELETE FROM caixas_texto WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Caixa de texto nao encontrada.' });
    }
    res.json({ mensagem: 'Caixa de texto excluida com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir caixa de texto:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir caixa de texto.' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
