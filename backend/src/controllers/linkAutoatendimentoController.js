// ===================================================================
// Controller dos LINKS DE AUTOATENDIMENTO (autoatendimento = o proprio
// lojista usa um link temporario, sem precisar do painel do superadmin).
// Reaproveita a mesma tabela/mecanismo de token do convite de cadastro
// (backend/src/controllers/conviteController.js), diferenciado pela
// coluna "tipo":
//
//  - completar_kyc: loja ja existe mas nunca teve dados_legais (ex: loja
//    de teste criada antes dessa etapa existir). Link de USO UNICO --
//    depois de enviado, os dados (CPF/CNPJ/nome/razao social/nome
//    fantasia) ficam bloqueados, exatamente como no cadastro normal.
//  - editar_contato: link temporario de 24h para o lojista trocar
//    telefone/WhatsApp/endereco por conta propria. NUNCA mexe em
//    CPF/CNPJ/nome do responsavel/razao social/nome fantasia -- esses
//    campos nem aparecem no formulario dessa pagina. Reutilizavel
//    varias vezes enquanto o link nao expirar (nao "queima" no primeiro
//    uso, ao contrario do completar_kyc).
// ===================================================================
const { query } = require('../config/database');
const { hashToken } = require('./conviteController');
const { uploadDocumentoPrivado } = require('../utils/storage');
const { validarCPF, validarTelefone } = require('../utils/validadores');
const { validarFormatoCep } = require('../utils/geocoding');

function calcularIdade(dataTexto) {
  const nascimento = new Date(dataTexto);
  if (isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNao = hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNao) idade--;
  return idade;
}

// Busca o convite pelo token "cru" (nao hasheado) e confere se ele e do
// tipo esperado e ainda esta valido. Usado pelos dois endpoints abaixo.
async function buscarConviteValido(tokenBruto, tipoEsperado) {
  const tokenHash = hashToken(tokenBruto);
  const resultado = await query(
    `SELECT id, status, expira_em, tipo, estabelecimento_id FROM convites_cadastro WHERE token = $1`,
    [tokenHash]
  );
  if (resultado.rows.length === 0) return { erro: 'Link invalido.' };

  const convite = resultado.rows[0];
  if (convite.tipo !== tipoEsperado) return { erro: 'Este link nao e valido para esta acao.' };
  if (convite.status === 'concluido') return { erro: 'Este link ja foi utilizado. Peca um novo link.' };
  if (convite.status === 'cancelado') return { erro: 'Este link foi cancelado.' };
  if (new Date(convite.expira_em) < new Date()) {
    await query(`UPDATE convites_cadastro SET status = 'expirado' WHERE id = $1`, [convite.id]);
    return { erro: 'Este link expirou. Peca um novo link.' };
  }
  return { convite };
}

// -------------------------------------------------------------------
// Completar o KYC de uma loja JA EXISTENTE (mesmos dados e validacoes
// da Etapa 2 do cadastro normal em authController.cadastrar, mas sem
// criar uma loja nova -- so preenche o dados_legais da loja apontada
// pelo token). Se a loja ja tiver dados_legais, recusa (usar o painel
// do superadmin para corrigir algo pontual nesse caso).
// -------------------------------------------------------------------
async function completarKyc(req, res) {
  try {
    const { token } = req.params;
    const {
      nomePessoal, sobrenome, dataNascimento, telefone,
      cep, zona, numero, rua, bairro, cidade, uf,
      tipoDocumentoIdentidade, tipoRegistro, cpf, cnpj, razaoSocial, nomeFantasia
    } = req.body;
    const arquivos = req.files || {};

    const { convite, erro } = await buscarConviteValido(token, 'completar_kyc');
    if (erro) return res.status(403).json({ erro });

    const jaTemDadosLegais = await query(
      'SELECT id FROM dados_legais WHERE estabelecimento_id = $1',
      [convite.estabelecimento_id]
    );
    if (jaTemDadosLegais.rows.length > 0) {
      return res.status(409).json({
        erro: 'Esta loja ja tem um cadastro de dados legais (KYC). Para corrigir algo especifico, fale com o suporte.'
      });
    }

    const camposObrigatorios = {
      nomePessoal, sobrenome, dataNascimento, telefone,
      tipoDocumentoIdentidade, cep, rua, numero, bairro, zona, cidade, uf, tipoRegistro
    };
    for (const [, valor] of Object.entries(camposObrigatorios)) {
      if (!valor) {
        return res.status(400).json({ erro: 'Preencha todos os dados pessoais e de endereco obrigatorios.' });
      }
    }

    const idade = calcularIdade(dataNascimento);
    if (idade === null || idade < 18) {
      return res.status(400).json({ erro: 'E preciso ser maior de 18 anos para completar o cadastro.' });
    }
    if (!validarTelefone(telefone)) {
      return res.status(400).json({ erro: 'Informe o telefone no formato (99) 999999999.' });
    }
    if (!validarFormatoCep(cep)) {
      return res.status(400).json({ erro: 'Informe o CEP no formato 99999-999.' });
    }
    if (!['rg', 'cnh', 'passaporte'].includes(tipoDocumentoIdentidade)) {
      return res.status(400).json({ erro: 'Tipo de documento de identidade invalido.' });
    }
    if (!['norte', 'sul', 'leste', 'oeste', 'centro'].includes(zona)) {
      return res.status(400).json({ erro: 'Zona do endereco invalida.' });
    }
    if (!validarCPF(cpf)) {
      return res.status(400).json({ erro: 'Informe o CPF do responsavel no formato 000.000.000-00.' });
    }
    if (!nomeFantasia) {
      return res.status(400).json({ erro: 'Informe o nome fantasia da loja.' });
    }
    if (tipoRegistro === 'cnpj') {
      if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
        return res.status(400).json({ erro: 'Informe um CNPJ valido.' });
      }
      if (!razaoSocial) {
        return res.status(400).json({ erro: 'Informe a razao social (nome oficial do CNPJ).' });
      }
    } else if (tipoRegistro !== 'cpf') {
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

    const documentoUrl = await uploadDocumentoPrivado(
      arquivoDocumento.buffer, arquivoDocumento.mimetype, `${convite.estabelecimento_id}/documento`
    );
    const comprovanteUrl = await uploadDocumentoPrivado(
      arquivoComprovante.buffer, arquivoComprovante.mimetype, `${convite.estabelecimento_id}/comprovante`
    );

    await query(
      `INSERT INTO dados_legais (
        estabelecimento_id, nome, sobrenome, data_nascimento, telefone,
        tipo_documento_identidade, documento_identidade_url, comprovante_residencia_url,
        cep, rua, numero, bairro, zona, cidade, uf,
        tipo_registro, cpf, cnpj, razao_social, nome_fantasia
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        convite.estabelecimento_id, nomePessoal, sobrenome, dataNascimento, telefone,
        tipoDocumentoIdentidade, documentoUrl, comprovanteUrl,
        cep, rua, numero, bairro, zona, cidade, uf,
        tipoRegistro, tipoRegistro === 'cpf' ? cpf : null, tipoRegistro === 'cnpj' ? cnpj : null,
        tipoRegistro === 'cnpj' ? razaoSocial : null, nomeFantasia || null
      ]
    );

    // Link de uso unico: depois de enviado, nao pode ser usado de novo
    // (mesma regra do cadastro por convite normal).
    await query(`UPDATE convites_cadastro SET status = 'concluido', usado_em = NOW() WHERE id = $1`, [convite.id]);

    res.json({ mensagem: 'Dados cadastrais enviados com sucesso!' });
  } catch (error) {
    console.error('Erro ao completar KYC via link de autoatendimento:', error);
    res.status(500).json({ erro: 'Erro interno ao enviar os dados.' });
  }
}

// -------------------------------------------------------------------
// Edicao de contato por autoatendimento (link temporario, 24h). So mexe
// em telefone/WhatsApp/endereco (e telefone do responsavel + endereco
// cadastral, se a loja ja tiver KYC) -- nunca em CPF/CNPJ/nome do
// responsavel/razao social/nome fantasia. O link continua valido para
// varios usos ate expirar (nao "queima" no primeiro salvamento).
// -------------------------------------------------------------------
async function editarContato(req, res) {
  try {
    const { token } = req.params;
    const { whatsapp, telefone, endereco, responsavel_telefone, cep, rua, numero, bairro, cidade, uf } = req.body;

    const { convite, erro } = await buscarConviteValido(token, 'editar_contato');
    if (erro) return res.status(403).json({ erro });

    await query(
      `UPDATE estabelecimentos SET
         whatsapp = COALESCE($1, whatsapp), telefone = COALESCE($2, telefone),
         endereco = COALESCE($3, endereco), atualizado_em = NOW()
       WHERE id = $4`,
      [whatsapp || null, telefone || null, endereco || null, convite.estabelecimento_id]
    );

    // Se a loja ainda nao tiver dados_legais, nao criamos um registro
    // parcial por aqui (ao contrario do painel do superadmin) -- esse
    // caso deve passar pelo link de "completar cadastro" (completarKyc
    // acima), que exige documento + comprovante como qualquer KYC.
    let avisoDadosLegais = null;
    const temDadosLegais = await query(
      'SELECT id FROM dados_legais WHERE estabelecimento_id = $1',
      [convite.estabelecimento_id]
    );
    if (temDadosLegais.rows.length > 0) {
      await query(
        `UPDATE dados_legais SET
           telefone = COALESCE($1, telefone), cep = COALESCE($2, cep), rua = COALESCE($3, rua),
           numero = COALESCE($4, numero), bairro = COALESCE($5, bairro),
           cidade = COALESCE($6, cidade), uf = COALESCE($7, uf)
         WHERE estabelecimento_id = $8`,
        [responsavel_telefone || null, cep || null, rua || null, numero || null, bairro || null, cidade || null, uf || null, convite.estabelecimento_id]
      );
    } else {
      avisoDadosLegais = 'Telefone/WhatsApp e endereco do cardapio foram salvos. O endereco cadastral e telefone do responsavel nao, pois esta loja ainda nao tem um cadastro de dados legais (KYC) -- peca ao suporte um link de "completar cadastro" para isso.';
    }

    await query(`UPDATE convites_cadastro SET usado_em = NOW() WHERE id = $1`, [convite.id]);

    res.json({ mensagem: 'Dados atualizados com sucesso!', aviso: avisoDadosLegais || undefined });
  } catch (error) {
    console.error('Erro ao editar contato via link de autoatendimento:', error);
    res.status(500).json({ erro: 'Erro interno ao salvar os dados.' });
  }
}

module.exports = { completarKyc, editarContato };
