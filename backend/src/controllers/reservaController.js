// ===================================================================
// Reserva de mesa - recurso opcional (cada loja liga/desliga na aba
// Configuracoes do painel). Simples: dia, hora, quantidade de pessoas.
// ===================================================================
const { query } = require('../config/database');
const { validarTelefone } = require('../utils/validadores');

const STATUS_VALIDOS = ['pendente', 'confirmada', 'cancelada'];

// Cliente cria uma reserva (rota publica, igual ao pedido -- nao exige
// login, so nome e telefone pra contato).
async function criar(req, res) {
  try {
    const { slug } = req.params;
    const { cliente_nome, cliente_telefone, data_reserva, horario_reserva, quantidade_pessoas, observacoes } = req.body;

    if (!cliente_nome || !cliente_nome.trim() || !cliente_telefone || !cliente_telefone.trim()) {
      return res.status(400).json({ erro: 'Informe seu nome e telefone.' });
    }
    if (!validarTelefone(cliente_telefone)) {
      return res.status(400).json({ erro: 'Informe o telefone no formato (99) 999999999.' });
    }
    if (!data_reserva || !horario_reserva) {
      return res.status(400).json({ erro: 'Informe o dia e o horario da reserva.' });
    }
    const pessoas = parseInt(quantidade_pessoas, 10);
    if (!pessoas || pessoas <= 0) {
      return res.status(400).json({ erro: 'Informe a quantidade de pessoas.' });
    }

    const estRes = await query('SELECT id, reserva_mesa_ativa FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    if (!estRes.rows[0].reserva_mesa_ativa) {
      return res.status(403).json({ erro: 'Essa loja nao esta aceitando reservas no momento.' });
    }

    const resultado = await query(
      `INSERT INTO reservas (estabelecimento_id, cliente_nome, cliente_telefone, data_reserva, horario_reserva, quantidade_pessoas, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [estRes.rows[0].id, cliente_nome.trim(), cliente_telefone.trim(), data_reserva, horario_reserva, pessoas, observacoes || null]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar reserva:', error);
    res.status(500).json({ erro: 'Erro ao criar reserva.' });
  }
}

// Painel: lista as reservas da loja (mais recentes/proximas primeiro).
async function listar(req, res) {
  try {
    const resultado = await query(
      `SELECT * FROM reservas WHERE estabelecimento_id = $1
       ORDER BY data_reserva ASC, horario_reserva ASC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar reservas:', error);
    res.status(500).json({ erro: 'Erro ao listar reservas.' });
  }
}

// Painel: confirma ou cancela uma reserva.
async function atualizarStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ erro: 'Status invalido.' });

    const resultado = await query(
      'UPDATE reservas SET status = $1, atualizado_em = NOW() WHERE id = $2 AND estabelecimento_id = $3 RETURNING *',
      [status, id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Reserva nao encontrada.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar status da reserva:', error);
    res.status(500).json({ erro: 'Erro ao atualizar reserva.' });
  }
}

// Painel: liga/desliga o recurso de reserva de mesa pra essa loja.
async function alternarReservaAtiva(req, res) {
  try {
    const { ativo } = req.body;
    await query('UPDATE estabelecimentos SET reserva_mesa_ativa = $1 WHERE id = $2', [ativo === true, req.estabelecimentoId]);
    res.json({ reserva_mesa_ativa: ativo === true });
  } catch (error) {
    console.error('Erro ao atualizar configuracao de reserva:', error);
    res.status(500).json({ erro: 'Erro ao atualizar configuracao.' });
  }
}

// Cliente cancela a propria reserva (rota publica, sem login -- confere
// o telefone informado contra o telefone salvo na reserva pra garantir
// que ninguem cancela reserva de outra pessoa so' adivinhando o id).
async function cancelarPropria(req, res) {
  try {
    const { slug, id } = req.params;
    const { telefone } = req.body;

    if (!telefone || !telefone.trim()) {
      return res.status(400).json({ erro: 'Informe seu telefone para cancelar a reserva.' });
    }

    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const reservaRes = await query(
      'SELECT * FROM reservas WHERE id = $1 AND estabelecimento_id = $2',
      [id, estRes.rows[0].id]
    );
    if (reservaRes.rows.length === 0) return res.status(404).json({ erro: 'Reserva nao encontrada.' });

    const reserva = reservaRes.rows[0];
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneReservaLimpo = (reserva.cliente_telefone || '').replace(/\D/g, '');
    if (telefoneLimpo !== telefoneReservaLimpo) {
      return res.status(403).json({ erro: 'Nao foi possivel confirmar essa reserva com o telefone informado.' });
    }

    if (reserva.status === 'cancelada') {
      return res.status(400).json({ erro: 'Essa reserva ja esta cancelada.' });
    }

    const dataHoraAgendada = new Date(`${reserva.data_reserva instanceof Date ? reserva.data_reserva.toISOString().substring(0, 10) : String(reserva.data_reserva).substring(0, 10)}T${String(reserva.horario_reserva).substring(0, 5)}:00`);
    if (dataHoraAgendada.getTime() < Date.now()) {
      return res.status(400).json({ erro: 'Essa reserva ja passou e nao pode mais ser cancelada.' });
    }

    const resultado = await query(
      "UPDATE reservas SET status = 'cancelada', atualizado_em = NOW() WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao cancelar reserva do cliente:', error);
    res.status(500).json({ erro: 'Erro ao cancelar reserva.' });
  }
}

// Cliente consulta o historico de reservas dele mesmo (rota publica, sem
// login -- usa o telefone, igual ja funciona pra "Meus pedidos").
async function listarReservasCliente(req, res) {
  try {
    const { slug, telefone } = req.params;
    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const telefoneLimpo = (telefone || '').replace(/\D/g, '');
    const resultado = await query(
      `SELECT * FROM reservas
       WHERE estabelecimento_id = $1
         AND regexp_replace(cliente_telefone, '\\D', '', 'g') LIKE $2
       ORDER BY data_reserva DESC, horario_reserva DESC LIMIT 30`,
      [estRes.rows[0].id, `%${telefoneLimpo}%`]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar reservas do cliente:', error);
    res.status(500).json({ erro: 'Erro ao listar reservas.' });
  }
}

module.exports = { criar, listar, listarReservasCliente, atualizarStatus, alternarReservaAtiva, cancelarPropria };
