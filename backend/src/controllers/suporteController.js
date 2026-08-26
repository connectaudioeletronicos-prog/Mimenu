// ===================================================================
// Suporte 1-para-1 entre o lojista e o administrador supremo.
// Metade "lojista" (protegida por JWT, em /api/admin/suporte) e metade
// "admin supremo" (protegida por CHAVE_CADASTRO_ADMIN, em /api/painel/suporte).
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');
const { enviarEmailRespostaSuporte } = require('../utils/email');

function chaveValida(chave) {
  return !!chave && chave === process.env.CHAVE_CADASTRO_ADMIN;
}

// -------------------------------------------------------------------
// LADO DO LOJISTA
// -------------------------------------------------------------------

// Lista os tickets da PROPRIA loja (req.estabelecimentoId vem do token).
async function listarTicketsLoja(req, res) {
  try {
    const resultado = await query(
      `SELECT t.id, t.assunto, t.status, t.nao_lido_pelo_lojista, t.criado_em, t.atualizado_em,
              (SELECT mensagem FROM suporte_mensagens m WHERE m.ticket_id = t.id ORDER BY m.criado_em DESC LIMIT 1) AS ultima_mensagem
       FROM suporte_tickets t
       WHERE t.estabelecimento_id = $1
       ORDER BY t.atualizado_em DESC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar tickets do lojista:', error);
    res.status(500).json({ erro: 'Erro interno ao listar tickets de suporte.' });
  }
}

// Detalhe de um ticket (mensagens) -- so o dono do ticket pode ver.
async function buscarTicketLoja(req, res) {
  try {
    const { id } = req.params;
    const ticket = await query(
      'SELECT * FROM suporte_tickets WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (ticket.rows.length === 0) {
      return res.status(404).json({ erro: 'Ticket nao encontrado.' });
    }

    const mensagens = await query(
      'SELECT id, autor, mensagem, anexo_url, criado_em FROM suporte_mensagens WHERE ticket_id = $1 ORDER BY criado_em ASC',
      [id]
    );

    // Ao abrir, marca como lido pelo lojista.
    await query('UPDATE suporte_tickets SET nao_lido_pelo_lojista = FALSE WHERE id = $1', [id]);

    res.json({ ticket: ticket.rows[0], mensagens: mensagens.rows });
  } catch (error) {
    console.error('Erro ao buscar ticket do lojista:', error);
    res.status(500).json({ erro: 'Erro interno ao buscar o ticket.' });
  }
}

// Cria um novo ticket (assunto + primeira mensagem + anexo opcional).
async function criarTicketLoja(req, res) {
  try {
    const { assunto, mensagem } = req.body;
    if (!assunto || !mensagem) {
      return res.status(400).json({ erro: 'Preencha o assunto e a mensagem.' });
    }

    let anexoUrl = null;
    if (req.file) {
      anexoUrl = await uploadImagem(req.file.buffer, req.file.mimetype, `suporte/${req.estabelecimentoId}`);
    }

    const ticket = await query(
      `INSERT INTO suporte_tickets (estabelecimento_id, assunto, nao_lido_pelo_admin)
       VALUES ($1, $2, TRUE) RETURNING *`,
      [req.estabelecimentoId, assunto]
    );

    await query(
      `INSERT INTO suporte_mensagens (ticket_id, autor, mensagem, anexo_url)
       VALUES ($1, 'lojista', $2, $3)`,
      [ticket.rows[0].id, mensagem, anexoUrl]
    );

    res.status(201).json({ mensagem: 'Chamado aberto com sucesso.', ticket: ticket.rows[0] });
  } catch (error) {
    console.error('Erro ao criar ticket de suporte:', error);
    res.status(500).json({ erro: 'Erro interno ao abrir o chamado de suporte.' });
  }
}

// Lojista responde dentro de um ticket ja existente.
async function responderTicketLoja(req, res) {
  try {
    const { id } = req.params;
    const { mensagem } = req.body;
    if (!mensagem) {
      return res.status(400).json({ erro: 'Escreva uma mensagem.' });
    }

    const ticket = await query(
      'SELECT id FROM suporte_tickets WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (ticket.rows.length === 0) {
      return res.status(404).json({ erro: 'Ticket nao encontrado.' });
    }

    let anexoUrl = null;
    if (req.file) {
      anexoUrl = await uploadImagem(req.file.buffer, req.file.mimetype, `suporte/${req.estabelecimentoId}`);
    }

    await query(
      `INSERT INTO suporte_mensagens (ticket_id, autor, mensagem, anexo_url) VALUES ($1, 'lojista', $2, $3)`,
      [id, mensagem, anexoUrl]
    );
    await query(
      `UPDATE suporte_tickets SET status = 'aberto', nao_lido_pelo_admin = TRUE, atualizado_em = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ mensagem: 'Mensagem enviada.' });
  } catch (error) {
    console.error('Erro ao responder ticket (lojista):', error);
    res.status(500).json({ erro: 'Erro interno ao enviar a mensagem.' });
  }
}

// -------------------------------------------------------------------
// LADO DO ADMIN SUPREMO
// -------------------------------------------------------------------

// Lista todos os tickets, de todas as lojas, com indicador de nao-lido.
async function listarTicketsAdmin(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `SELECT t.id, t.assunto, t.status, t.nao_lido_pelo_admin, t.criado_em, t.atualizado_em,
              e.id AS estabelecimento_id, e.nome AS nome_loja, e.email AS email_loja,
              (SELECT mensagem FROM suporte_mensagens m WHERE m.ticket_id = t.id ORDER BY m.criado_em DESC LIMIT 1) AS ultima_mensagem
       FROM suporte_tickets t
       JOIN estabelecimentos e ON e.id = t.estabelecimento_id
       ORDER BY t.nao_lido_pelo_admin DESC, t.atualizado_em DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar tickets (admin):', error);
    res.status(500).json({ erro: 'Erro interno ao listar tickets de suporte.' });
  }
}

// Detalhe de um ticket para o admin supremo.
async function buscarTicketAdmin(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const { id } = req.params;
    const ticket = await query(
      `SELECT t.*, e.nome AS nome_loja, e.email AS email_loja
       FROM suporte_tickets t JOIN estabelecimentos e ON e.id = t.estabelecimento_id
       WHERE t.id = $1`,
      [id]
    );
    if (ticket.rows.length === 0) {
      return res.status(404).json({ erro: 'Ticket nao encontrado.' });
    }

    const mensagens = await query(
      'SELECT id, autor, mensagem, anexo_url, criado_em FROM suporte_mensagens WHERE ticket_id = $1 ORDER BY criado_em ASC',
      [id]
    );

    await query('UPDATE suporte_tickets SET nao_lido_pelo_admin = FALSE WHERE id = $1', [id]);

    res.json({ ticket: ticket.rows[0], mensagens: mensagens.rows });
  } catch (error) {
    console.error('Erro ao buscar ticket (admin):', error);
    res.status(500).json({ erro: 'Erro interno ao buscar o ticket.' });
  }
}

// Admin supremo responde -- grava a mensagem e avisa o lojista por e-mail.
async function responderTicketAdmin(req, res) {
  try {
    const { chaveMestra, mensagem } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!mensagem) {
      return res.status(400).json({ erro: 'Escreva uma mensagem.' });
    }

    const { id } = req.params;
    const ticket = await query(
      `SELECT t.assunto, e.email AS email_loja, e.nome AS nome_loja
       FROM suporte_tickets t JOIN estabelecimentos e ON e.id = t.estabelecimento_id
       WHERE t.id = $1`,
      [id]
    );
    if (ticket.rows.length === 0) {
      return res.status(404).json({ erro: 'Ticket nao encontrado.' });
    }

    await query(
      `INSERT INTO suporte_mensagens (ticket_id, autor, mensagem) VALUES ($1, 'admin', $2)`,
      [id, mensagem]
    );
    await query(
      `UPDATE suporte_tickets SET status = 'respondido', nao_lido_pelo_lojista = TRUE, atualizado_em = NOW() WHERE id = $1`,
      [id]
    );

    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5500').replace(/\/$/, '');
    const linkTicket = `${baseUrl}/admin/admin-index.html?aba=configuracoes&suporteTicket=${id}`;
    const resultadoEnvio = await enviarEmailRespostaSuporte(
      ticket.rows[0].email_loja, ticket.rows[0].nome_loja, ticket.rows[0].assunto, linkTicket
    );

    res.json({
      mensagem: 'Resposta enviada.',
      email_notificacao_enviado: !!(resultadoEnvio && resultadoEnvio.enviado)
    });
  } catch (error) {
    console.error('Erro ao responder ticket (admin):', error);
    res.status(500).json({ erro: 'Erro interno ao enviar a resposta.' });
  }
}

module.exports = {
  listarTicketsLoja, buscarTicketLoja, criarTicketLoja, responderTicketLoja,
  listarTicketsAdmin, buscarTicketAdmin, responderTicketAdmin
};
