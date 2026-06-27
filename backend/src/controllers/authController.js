// ===================================================================
// Controller de autenticacao - login do painel administrativo
// ===================================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

async function login(req, res) {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'E-mail e senha sao obrigatorios.' });
    }

    const resultado = await query(
      'SELECT id, slug, nome, email, senha_hash, ativo FROM estabelecimentos WHERE email = $1',
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    }

    const estabelecimento = resultado.rows[0];

    if (!estabelecimento.ativo) {
      return res.status(403).json({ erro: 'Este estabelecimento esta desativado. Contate o suporte.' });
    }

    const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senha_hash);

    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    }

    const token = jwt.sign(
      { estabelecimentoId: estabelecimento.id, slug: estabelecimento.slug },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      estabelecimento: {
        id: estabelecimento.id,
        slug: estabelecimento.slug,
        nome: estabelecimento.nome,
        email: estabelecimento.email
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ erro: 'Erro interno ao processar login.' });
  }
}

async function trocarSenha(req, res) {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const estabelecimentoId = req.estabelecimentoId;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ erro: 'Senha atual e nova senha sao obrigatorias.' });
    }
    if (novaSenha.length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    const resultado = await query('SELECT senha_hash FROM estabelecimentos WHERE id = $1', [estabelecimentoId]);
    const senhaCorreta = await bcrypt.compare(senhaAtual, resultado.rows[0].senha_hash);

    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }

    const novoHash = await bcrypt.hash(novaSenha, 10);
    await query('UPDATE estabelecimentos SET senha_hash = $1 WHERE id = $2', [novoHash, estabelecimentoId]);

    res.json({ mensagem: 'Senha alterada com sucesso.' });

  } catch (error) {
    console.error('Erro ao trocar senha:', error);
    res.status(500).json({ erro: 'Erro interno ao trocar senha.' });
  }
}

module.exports = { login, trocarSenha };