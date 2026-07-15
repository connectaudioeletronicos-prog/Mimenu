// ===================================================================
// Controller de autenticacao - login do painel administrativo
// ===================================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const { enviarEmailRecuperacaoSenha } = require('../utils/email');

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
      { estabelecimentoId: estabelecimento.id, slug: estabelecimento.slug, cargo: 'proprietario' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      estabelecimento: {
        id: estabelecimento.id,
        slug: estabelecimento.slug,
        nome: estabelecimento.nome,
        email: estabelecimento.email,
        cargo: 'proprietario'
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

async function cadastrar(req, res) {
  try {
    const { chaveCadastro, slug, nome, email, senha } = req.body;

    // Validar chave de cadastro
    if (chaveCadastro !== process.env.CHAVE_CADASTRO_ADMIN) {
      return res.status(403).json({ erro: 'Chave de cadastro invalida.' });
    }

    // Validar campos obrigatórios
    if (!slug || !nome || !email || !senha) {
      return res.status(400).json({ erro: 'Slug, nome, email e senha sao obrigatorios.' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    // Verificar se já existe estabelecimento com esse email ou slug
    const verificacao = await query(
      'SELECT id FROM estabelecimentos WHERE email = $1 OR slug = $2',
      [email, slug]
    );

    if (verificacao.rows.length > 0) {
      return res.status(409).json({ erro: 'Já existe um estabelecimento com esse email ou slug.' });
    }

    // Criar hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Inserir novo estabelecimento
    await query(
      'INSERT INTO estabelecimentos (slug, nome, email, senha_hash, ativo) VALUES ($1, $2, $3, $4, $5)',
      [slug, nome, email, senhaHash, true]
    );

    res.status(201).json({ mensagem: 'Estabelecimento cadastrado com sucesso.' });

  } catch (error) {
    console.error('Erro ao cadastrar estabelecimento:', error);
    res.status(500).json({ erro: 'Erro interno ao cadastrar estabelecimento.' });
  }
}

async function esqueciSenha(req, res) {
  const respostaGenerica = { mensagem: 'Se esse e-mail estiver cadastrado, enviamos um link de recuperacao.' };
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'Informe o e-mail.' });

    const resultado = await query('SELECT id, nome, email FROM estabelecimentos WHERE email = $1', [email]);

    // Sempre responde a mesma coisa, exista ou nao o e-mail (evita revelar quais e-mails estao cadastrados).
    if (resultado.rows.length === 0) {
      return res.json(respostaGenerica);
    }

    const estabelecimento = resultado.rows[0];
    const tokenBruto = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenBruto).digest('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await query(
      'UPDATE estabelecimentos SET reset_token = $1, reset_token_expira = $2 WHERE id = $3',
      [tokenHash, expira, estabelecimento.id]
    );

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
    const link = `${baseUrl}/admin/redefinir-senha.html?token=${tokenBruto}`;

    await enviarEmailRecuperacaoSenha(estabelecimento.email, estabelecimento.nome, link);

    res.json(respostaGenerica);
  } catch (error) {
    console.error('Erro ao solicitar recuperacao de senha:', error);
    // Mesmo em erro interno, nao expomos detalhes ao cliente.
    res.json(respostaGenerica);
  }
}

async function redefinirSenha(req, res) {
  try {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
      return res.status(400).json({ erro: 'Token e nova senha sao obrigatorios.' });
    }
    if (novaSenha.length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resultado = await query(
      'SELECT id FROM estabelecimentos WHERE reset_token = $1 AND reset_token_expira > NOW()',
      [tokenHash]
    );

    if (resultado.rows.length === 0) {
      return res.status(400).json({ erro: 'Link invalido ou expirado. Solicite a recuperacao novamente.' });
    }

    const novoHash = await bcrypt.hash(novaSenha, 10);
    await query(
      'UPDATE estabelecimentos SET senha_hash = $1, reset_token = NULL, reset_token_expira = NULL WHERE id = $2',
      [novoHash, resultado.rows[0].id]
    );

    res.json({ mensagem: 'Senha redefinida com sucesso. Voce ja pode entrar com a nova senha.' });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ erro: 'Erro interno ao redefinir senha.' });
  }
}

module.exports = { login, trocarSenha, cadastrar, esqueciSenha, redefinirSenha };
