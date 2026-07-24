// ===================================================================
// Reserva de mesa - recurso opcional (cada loja liga/desliga na aba
// Configuracoes do painel). Simples: dia, hora, quantidade de pessoas.
// ===================================================================
const { query } = require('../config/database');

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
      'UPDATE reservas SET status = $1 WHERE id = $2 AND estabelecimento_id = $3 RETURNING *',
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

module.exports = { criar, listar, atualizarStatus, alternarReservaAtiva };
t
