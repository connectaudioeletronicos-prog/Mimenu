// ===================================================================
// Controller de CONVITES DE CADASTRO
// Cada convite gera um LINK UNICO e DE USO UNICO para um lojista se
// cadastrar. O token nunca fica salvo em texto puro no banco (mesma
// logica ja usada na recuperacao de senha): salvamos so o hash SHA-256.
// ===================================================================
const crypto = require('crypto');
const { query } = require('../config/database');
const { gerarQRCodeBase64 } = require('../utils/qrcode');

function hashToken(tokenBruto) {
  return crypto.createHash('sha256').update(tokenBruto).digest('hex');
}

// Monta o link publico de cadastro a partir do token "cru" (nao hasheado).
function montarLinkConvite(tokenBruto) {
  const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5500').replace(/\/$/, '');
  return `${baseUrl}/frontend/admin/cadastro.html?convite=${tokenBruto}`;
}

// -------------------------------------------------------------------
// Gera um novo convite. Protegido pela CHAVE_CADASTRO_ADMIN (agora usada
// como "chave mestra" so por voce, o dono do sistema -- nunca e
// compartilhada com o lojista).
// -------------------------------------------------------------------
async function gerarConvite(req, res) {
  try {
    const { chaveMestra, observacao, diasValidade } = req.body;

    if (!chaveMestra || chaveMestra !== process.env.CHAVE_CADASTRO_ADMIN) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const tokenBruto = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(tokenBruto);

    const dias = Number(diasValidade) > 0 ? Number(diasValidade) : 7;
    const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO convites_cadastro (token, status, observacao, expira_em)
       VALUES ($1, 'pendente', $2, $3)`,
      [tokenHash, observacao || null, expiraEm]
    );

    const link = montarLinkConvite(tokenBruto);
    const qrcode = await gerarQRCodeBase64(link);

    res.status(201).json({ link, qrcode, expira_em: expiraEm });
  } catch (error) {
    console.error('Erro ao gerar convite:', error);
    res.status(500).json({ erro: 'Erro interno ao gerar convite.' });
  }
}

// -------------------------------------------------------------------
// Valida se um token de convite ainda pode ser usado. Chamado pela
// tela de cadastro assim que o lojista abre o link, ANTES de mostrar
// o formulario. Tambem marca o convite como "em_andamento".
// -------------------------------------------------------------------
async function validarConvite(req, res) {
  try {
    const { token } = req.params;
    if (!token) return res.json({ valido: false, motivo: 'Link de convite invalido.' });

    const tokenHash = hashToken(token);
    const resultado = await query(
      `SELECT id, status, expira_em FROM convites_cadastro WHERE token = $1`,
      [tokenHash]
    );

    if (resultado.rows.length === 0) {
      return res.json({ valido: false, motivo: 'Link de convite invalido.' });
    }

    const convite = resultado.rows[0];

    if (convite.status === 'concluido') {
      return res.json({ valido: false, motivo: 'Este link ja foi utilizado. Peca um novo link.' });
    }
    if (convite.status === 'cancelado') {
      return res.json({ valido: false, motivo: 'Este link foi cancelado.' });
    }
    if (new Date(convite.expira_em) < new Date()) {
      await query(`UPDATE convites_cadastro SET status = 'expirado' WHERE id = $1`, [convite.id]);
      return res.json({ valido: false, motivo: 'Este link expirou. Peca um novo link.' });
    }

    if (convite.status === 'pendente') {
      await query(`UPDATE convites_cadastro SET status = 'em_andamento' WHERE id = $1`, [convite.id]);
    }

    res.json({ valido: true });
  } catch (error) {
    console.error('Erro ao validar convite:', error);
    res.status(500).json({ valido: false, motivo: 'Erro interno ao validar convite.' });
  }
}

// -------------------------------------------------------------------
// Lista os convites gerados (protegido pela chave mestra), so para
// voce acompanhar quais ja foram usados/expiraram.
// -------------------------------------------------------------------
async function listarConvites(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveMestra || chaveMestra !== process.env.CHAVE_CADASTRO_ADMIN) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `SELECT id, status, observacao, criado_em, expira_em, usado_em
       FROM convites_cadastro ORDER BY criado_em DESC LIMIT 100`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar convites:', error);
    res.status(500).json({ erro: 'Erro interno ao listar convites.' });
  }
}

module.exports = { gerarConvite, validarConvite, listarConvites, hashToken, montarLinkConvite };
