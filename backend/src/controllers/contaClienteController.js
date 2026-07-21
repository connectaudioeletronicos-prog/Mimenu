// ===================================================================
// Controller de autenticacao - conta do cliente (aplicativo do cliente)
// ===================================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');

async function cadastrar(req, res) {
  try {
    const {
      nome, sobrenome, email, senha,
      cpf, cep, logradouro, numero, bairro, cidade, uf
    } = req.body;

    if (!nome || !sobrenome || !email || !senha) {
      return res.status(400).json({ erro: 'Nome, sobrenome, e-mail e senha sao obrigatorios.' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const cpfLimpo = (cpf || '').replace(/\D/g, '');
    if (!cpfLimpo || cpfLimpo.length !== 11) {
      return res.status(400).json({ erro: 'Informe um CPF valido.' });
    }
    if (!cep || !logradouro || !numero || !bairro || !cidade || !uf) {
      return res.status(400).json({ erro: 'Preencha todos os dados de endereco.' });
    }

    const existente = await query(
      'SELECT id FROM contas_clientes WHERE email = $1 OR cpf = $2',
      [email.toLowerCase().trim(), cpfLimpo]
    );
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Ja existe uma conta com esse e-mail ou CPF.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const resultado = await query(
      `INSERT INTO contas_clientes
        (nome, sobrenome, email, senha_hash, cpf, cep, logradouro, numero, bairro, cidade, uf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, nome, sobrenome, email`,
      [
        nome.trim(), sobrenome.trim(), email.toLowerCase().trim(), senhaHash,
        cpfLimpo, cep, logradouro.trim(), numero.trim(), bairro.trim(), cidade.trim(), uf.toUpperCase()
      ]
    );
    const conta = resultado.rows[0];

    const token = jwt.sign(
      { contaClienteId: conta.id, tipo: 'cliente' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      conta: { id: conta.id, nome: conta.nome, sobrenome: conta.sobrenome, email: conta.email }
    });
  } catch (error) {
    console.error('Erro ao cadastrar conta de cliente:', error);
    res.status(500).json({ erro: 'Erro interno ao criar a conta.' });
  }
}

async function login(req, res) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'E-mail e senha sao obrigatorios.' });
    }

    const resultado = await query(
      'SELECT id, nome, sobrenome, email, senha_hash FROM contas_clientes WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    }

    const conta = resultado.rows[0];
    const senhaCorreta = await bcrypt.compare(senha, conta.senha_hash);
    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    }

    const token = jwt.sign(
      { contaClienteId: conta.id, tipo: 'cliente' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      conta: { id: conta.id, nome: conta.nome, sobrenome: conta.sobrenome, email: conta.email }
    });
  } catch (error) {
    console.error('Erro no login de cliente:', error);
    res.status(500).json({ erro: 'Erro interno ao processar login.' });
  }
}

async function loginGoogle(req, res) {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ erro: 'Codigo de autorizacao do Google ausente.' });
    }

    // Troca o codigo de autorizacao (recebido do botao "Continuar com
    // Google" no navegador) pelos tokens reais, direto com o Google.
    const respostaToken = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code'
      })
    });
    const dadosToken = await respostaToken.json();

    if (!respostaToken.ok || !dadosToken.id_token) {
      console.error('Erro ao trocar codigo do Google:', dadosToken);
      return res.status(401).json({ erro: 'Nao foi possivel validar o login com o Google.' });
    }

    // O id_token e um JWT emitido pelo Google. Como acabamos de troca-lo
    // diretamente com o Google usando nosso client_secret, o conteudo ja
    // e confiavel - so precisamos ler o payload (segunda parte do JWT).
    const payloadBase64 = dadosToken.id_token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));

    const googleId = payload.sub;
    const email = (payload.email || '').toLowerCase().trim();
    const nome = payload.given_name || payload.name || 'Cliente';
    const sobrenome = payload.family_name || '';

    if (!email) {
      return res.status(400).json({ erro: 'Sua conta Google precisa ter um e-mail publico para continuar.' });
    }

    // Busca por google_id (quem ja logou assim antes) ou por e-mail
    // (permite vincular ao login do Google uma conta ja existente).
    const resultado = await query(
      'SELECT id, nome, sobrenome, email FROM contas_clientes WHERE google_id = $1 OR email = $2',
      [googleId, email]
    );

    let conta;
    if (resultado.rows.length > 0) {
      conta = resultado.rows[0];
      await query('UPDATE contas_clientes SET google_id = $1 WHERE id = $2', [googleId, conta.id]);
    } else {
      const novaConta = await query(
        `INSERT INTO contas_clientes (nome, sobrenome, email, google_id)
         VALUES ($1, $2, $3, $4) RETURNING id, nome, sobrenome, email`,
        [nome.trim(), (sobrenome || '').trim(), email, googleId]
      );
      conta = novaConta.rows[0];
    }

    const token = jwt.sign(
      { contaClienteId: conta.id, tipo: 'cliente' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      conta: { id: conta.id, nome: conta.nome, sobrenome: conta.sobrenome, email: conta.email }
    });
  } catch (error) {
    console.error('Erro no login com Google:', error);
    res.status(500).json({ erro: 'Erro interno ao processar login com Google.' });
  }
}

async function esqueciSenha(req, res) {
  const respostaGenerica = { mensagem: 'Se esse e-mail estiver cadastrado, enviamos um link de recuperacao.' };
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'Informe o e-mail.' });

    const resultado = await query('SELECT id, nome, email FROM contas_clientes WHERE email = $1', [email.toLowerCase().trim()]);
    if (resultado.rows.length === 0) {
      return res.json(respostaGenerica);
    }

    const conta = resultado.rows[0];
    const tokenBruto = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenBruto).digest('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000);

    await query(
      'UPDATE contas_clientes SET reset_token = $1, reset_token_expira = $2 WHERE id = $3',
      [tokenHash, expira, conta.id]
    );

    // TODO: reaproveitar utils/email.js para mandar esse link por e-mail
    // (mesmo servico ja usado em authController -> enviarEmailRecuperacaoSenha)
    console.log(`[cliente] link de recuperacao de senha para ${conta.email}: token=${tokenBruto}`);

    res.json(respostaGenerica);
  } catch (error) {
    console.error('Erro ao solicitar recuperacao de senha do cliente:', error);
    res.json(respostaGenerica);
  }
}

module.exports = { cadastrar, login, loginGoogle, esqueciSenha };
