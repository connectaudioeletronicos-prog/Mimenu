// ===================================================================
// Controller do PAINEL SUPER-ADMIN (uso exclusivo seu, dono do sistema)
// Protegido pela mesma CHAVE_CADASTRO_ADMIN usada nos convites.
// ===================================================================
const { query } = require('../config/database');

function chaveValida(chave) {
  return !!chave && chave === process.env.CHAVE_CADASTRO_ADMIN;
}

// Lista todos os estabelecimentos (lojistas) cadastrados
async function listarEstabelecimentos(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `SELECT id, slug, nome, email, ativo, plano, criado_em
       FROM estabelecimentos ORDER BY criado_em DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar estabelecimentos:', error);
    res.status(500).json({ erro: 'Erro interno ao listar estabelecimentos.' });
  }
}

// Bloqueia ou desbloqueia um estabelecimento (ativo = true/false)
async function alternarStatusEstabelecimento(req, res) {
  try {
    const { chaveMestra, ativo } = req.body;
    const { id } = req.params;

    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (typeof ativo !== 'boolean') {
      return res.status(400).json({ erro: 'Campo "ativo" deve ser true ou false.' });
    }

    const resultado = await query(
      `UPDATE estabelecimentos SET ativo = $1, atualizado_em = NOW() WHERE id = $2 RETURNING id, slug, nome, ativo`,
      [ativo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    res.json({ mensagem: 'Status atualizado com sucesso.', estabelecimento: resultado.rows[0] });
  } catch (error) {
    console.error('Erro ao alternar status do estabelecimento:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar status.' });
  }
}

// Cancela um convite que ainda nao foi usado
async function cancelarConvite(req, res) {
  try {
    const { chaveMestra } = req.body;
    const { id } = req.params;

    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `UPDATE convites_cadastro SET status = 'cancelado'
       WHERE id = $1 AND status IN ('pendente', 'em_andamento')
       RETURNING id`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Convite nao encontrado ou ja finalizado.' });
    }

    res.json({ mensagem: 'Convite cancelado com sucesso.' });
  } catch (error) {
    console.error('Erro ao cancelar convite:', error);
    res.status(500).json({ erro: 'Erro interno ao cancelar convite.' });
  }
}

module.exports = { listarEstabelecimentos, alternarStatusEstabelecimento, cancelarConvite };
