// ===================================================================
// Controller de autenticacao - login do painel administrativo
// ===================================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const { enviarEmailRecuperacaoSenha } = require('../utils/email');
const { gerarQRCodeBase64 } = require('../utils/qrcode');
const { uploadDocumentoPrivado } = require('../utils/storage');

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
  const arquivos = req.files || {};
  try {
    const {
      convite, slug, nome, email, senha,
      nomePessoal, sobrenome, dataNascimento, telefone,
      tipoDocumentoIdentidade,
      cep, rua, numero, bairro, zona, cidade, uf,
      tipoRegistro, cpf, cnpj, razaoSocial, nomeFantasia
    } = req.body;

    // --- Validacao Etapa 1 (conta de acesso) ---
    if (!convite) {
      return res.status(400).json({ erro: 'Link de convite invalido ou ausente.' });
    }
    if (!slug || !nome || !email || !senha) {
      return res.status(400).json({ erro: 'Slug, nome, email e senha sao obrigatorios.' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    // --- Validacao Etapa 2 (dados pessoais e legais) ---
    const camposObrigatorios = {
      nomePessoal, sobrenome, dataNascimento, telefone,
      tipoDocumentoIdentidade, cep, rua, numero, bairro, zona, cidade, uf, tipoRegistro
    };
    for (const [campo, valor] of Object.entries(camposObrigatorios)) {
      if (!valor) {
        return res.status(400).json({ erro: 'Preencha todos os dados pessoais e de endereco obrigatorios.' });
      }
    }

    const idade = calcularIdade(dataNascimento);
    if (idade === null || idade < 18) {
      return res.status(400).json({ erro: 'E preciso ser maior de 18 anos para se cadastrar.' });
    }

    if (!['rg', 'cnh', 'passaporte'].includes(tipoDocumentoIdentidade)) {
      return res.status(400).json({ erro: 'Tipo de documento de identidade invalido.' });
    }
    if (!['norte', 'sul', 'leste', 'oeste', 'centro'].includes(zona)) {
      return res.status(400).json({ erro: 'Zona do endereco invalida.' });
    }

    if (tipoRegistro === 'cpf') {
      if (!cpf || cpf.replace(/\D/g, '').length !== 11) {
        return res.status(400).json({ erro: 'Informe um CPF valido.' });
      }
    } else if (tipoRegistro === 'cnpj') {
      if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
        return res.status(400).json({ erro: 'Informe um CNPJ valido.' });
      }
      if (!razaoSocial) {
        return res.status(400).json({ erro: 'Informe a razao social (nome oficial do CNPJ).' });
      }
    } else {
      return res.status(400).json({ erro: 'Escolha CPF ou CNPJ.' });
    }

    const arquivoDocumento = arquivos.documento_identidade ? arquivos.documento_identidade[0] : null;
    const arquivoComprovante = arquivos.comprovante_residencia ? arquivos.comprovante_residencia[0] : null;
    if (!arquivoDocumento) {
      return res.status(400).json({ erro: 'Envie a foto/PDF do documento de identidade.' });
    }
    if (!arquivoComprovante) {
      return res.status(400).json({ erro: 'Envie a foto/PDF do comprovante de residencia.' });
    }

    // --- Validar o convite (link unico de uso unico) ---
    const tokenHash = crypto.createHash('sha256').update(convite).digest('hex');
    const conviteResultado = await query(
      `SELECT id, status, expira_em FROM convites_cadastro WHERE token = $1`,
      [tokenHash]
    );

    if (conviteResultado.rows.length === 0) {
      return res.status(403).json({ erro: 'Link de convite invalido.' });
    }

    const conviteRow = conviteResultado.rows[0];

    if (conviteRow.status === 'concluido' || conviteRow.status === 'cancelado') {
      return res.status(403).json({ erro: 'Este link de convite ja foi utilizado ou cancelado.' });
    }
    if (new Date(conviteRow.expira_em) < new Date()) {
      await query(`UPDATE convites_cadastro SET status = 'expirado' WHERE id = $1`, [conviteRow.id]);
      return res.status(403).json({ erro: 'Este link de convite expirou. Peca um novo link.' });
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
    const novoEstabelecimento = await query(
      'INSERT INTO estabelecimentos (slug, nome, email, senha_hash, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [slug, nome, email, senhaHash, true]
    );
    const novoEstabelecimentoId = novoEstabelecimento.rows[0].id;

    // A partir daqui, se algo falhar, desfazemos o estabelecimento criado
    // (evita loja "fantasma" sem dados legais completos).
    try {
      // Envia os documentos para o bucket privado
      const documentoUrl = await uploadDocumentoPrivado(
        arquivoDocumento.buffer, arquivoDocumento.mimetype, `${novoEstabelecimentoId}/documento`
      );
      const comprovanteUrl = await uploadDocumentoPrivado(
        arquivoComprovante.buffer, arquivoComprovante.mimetype, `${novoEstabelecimentoId}/comprovante`
      );

      await query(
        `INSERT INTO dados_legais (
          estabelecimento_id, nome, sobrenome, data_nascimento, telefone,
          tipo_documento_identidade, documento_identidade_url, comprovante_residencia_url,
          cep, rua, numero, bairro, zona, cidade, uf,
          tipo_registro, cpf, cnpj, razao_social, nome_fantasia
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          novoEstabelecimentoId, nomePessoal, sobrenome, dataNascimento, telefone,
          tipoDocumentoIdentidade, documentoUrl, comprovanteUrl,
          cep, rua, numero, bairro, zona, cidade, uf,
          tipoRegistro, tipoRegistro === 'cpf' ? cpf : null, tipoRegistro === 'cnpj' ? cnpj : null,
          tipoRegistro === 'cnpj' ? razaoSocial : null, tipoRegistro === 'cnpj' ? (nomeFantasia || null) : null
        ]
      );
    } catch (erroEtapa2) {
      await query('DELETE FROM estabelecimentos WHERE id = $1', [novoEstabelecimentoId]);
      throw erroEtapa2;
    }

    // Marcar o convite como concluido e "queimar" o link (nao pode ser reusado)
    await query(
      `UPDATE convites_cadastro SET status = 'concluido', estabelecimento_id = $1, usado_em = NOW() WHERE id = $2`,
      [novoEstabelecimentoId, conviteRow.id]
    );

    // Gerar o QR Code fixo do cardapio dessa loja, para o lojista ja
    // baixar e usar em embalagens, panfletos, redes sociais, etc.
    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5500').replace(/\/$/, '');
    const linkCardapio = `${baseUrl}/frontend/index.html?slug=${slug}`;
    const qrcodeCardapio = await gerarQRCodeBase64(linkCardapio);

    res.status(201).json({
      mensagem: 'Estabelecimento cadastrado com sucesso.',
      link_cardapio: linkCardapio,
      qrcode_cardapio: qrcodeCardapio
    });

  } catch (error) {
    console.error('Erro ao cadastrar estabelecimento:', error);
    res.status(500).json({ erro: 'Erro interno ao cadastrar estabelecimento.' });
  }
}

// Calcula a idade em anos completos a partir de uma data de nascimento (YYYY-MM-DD)
function calcularIdade(dataNascimento) {
  const nascimento = new Date(dataNascimento);
  if (isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversarioEsteAno =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversarioEsteAno) idade--;
  return idade;
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
