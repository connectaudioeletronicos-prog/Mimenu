// ===================================================================
// Controller de vitrines (imagem grande + caixa de texto, posicionavel)
// Comecam desativadas por padrao, o lojista ativa quando quiser.
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');

const POSICOES_VALIDAS = ['topo', 'apos-cabecalho', 'apos-categorias', 'apos-produtos', 'antes-rodape'];
const LIMITE_TEXTO = 300;

async function listar(req, res) {
  try {
    const resultado = await query(
      'SELECT * FROM vitrines WHERE estabelecimento_id = $1 ORDER BY ordem ASC, criado_em ASC',
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar vitrines:', error);
    res.status(500).json({ erro: 'Erro interno ao listar vitrines.' });
  }
}

async function criar(req, res) {
  try {
    const { texto, posicao, ordem } = req.body;

    if (!req.file) {
      return res.status(400).json({ erro: 'A imagem da vitrine e obrigatoria.' });
    }

    const textoFinal = (texto || '').slice(0, LIMITE_TEXTO);
    const posicaoFinal = POSICOES_VALIDAS.includes(posicao) ? posicao : 'apos-produtos';
    const imagemUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'vitrines');

    const resultado = await query(
      `INSERT INTO vitrines (estabelecimento_id, imagem_url, texto, posicao, ordem, ativo)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
      [req.estabelecimentoId, imagemUrl, textoFinal, posicaoFinal, ordem || 0]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar vitrine:', error);
    res.status(500).json({ erro: 'Erro interno ao criar vitrine.' });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { texto, posicao, ativo, ordem } = req.body;

    const verificacao = await query(
      'SELECT id, imagem_url FROM vitrines WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Vitrine nao encontrada.' });
    }

    let imagemUrl = verificacao.rows[0].imagem_url;
    if (req.file) {
      imagemUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'vitrines');
    }

    const textoFinal = texto !== undefined ? texto.slice(0, LIMITE_TEXTO) : undefined;
    const posicaoFinal = posicao !== undefined
      ? (POSICOES_VALIDAS.includes(posicao) ? posicao : 'apos-produtos')
      : undefined;

    const resultado = await query(
      `UPDATE vitrines SET
        texto = COALESCE($1, texto),
        posicao = COALESCE($2, posicao),
        ativo = COALESCE($3, ativo),
        ordem = COALESCE($4, ordem),
        imagem_url = $5
       WHERE id = $6 RETURNING *`,
      [textoFinal, posicaoFinal, ativo, ordem, imagemUrl, id]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar vitrine:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar vitrine.' });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      'DELETE FROM vitrines WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Vitrine nao encontrada.' });
    }
    res.json({ mensagem: 'Vitrine excluida com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir vitrine:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir vitrine.' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
