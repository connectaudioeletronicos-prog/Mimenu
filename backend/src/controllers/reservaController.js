// ===================================================================
// Reserva de mesa - recurso opcional (cada loja liga/desliga na aba
// Configuracoes do painel). Simples: dia, hora, quantidade de pessoas.
//
// Ciclo de vida do status:
//   pendente     -> loja ainda nao respondeu
//   confirmada   -> loja aceitou, aguardando o cliente chegar
//   cancelada    -> recusada pela loja OU cancelada pelo cliente,
//                   sempre ANTES da data/hora marcada (ve cancelada_por)
//   concluida    -> cliente chegou e a loja fez check-in (ve check_in_em)
//   nao_concluida -> a data/hora da reserva passou e ninguem fez
//                    check-in (cliente nao compareceu)
//
// "concluida" e "nao_concluida" nunca sao escolhidos manualmente pelo
// admin: "concluida" so acontece via check-in (funcao fazerCheckIn) e
// "nao_concluida" e automatico, aplicado por sweepReservasExpiradas
// sempre que a lista de reservas e consultada (nao depende de nenhum
// cron/job rodando em segundo plano).
// ===================================================================
const { query } = require('../config/database');
const { validarTelefone } = require('../utils/validadores');
const { notificar } = require('./notificacaoClienteController');

const STATUS_VALIDOS = ['pendente', 'confirmada', 'cancelada'];

// Vira' 'concluida' (se teve check-in) ou 'nao_concluida' (se nao teve)
// qualquer reserva "pendente"/"confirmada" cuja data+hora ja passou.
// Chamada no INICIO de toda consulta que lista reservas (painel do
// admin e "Minhas reservas" do cliente), pra manter o status sempre
// correto sem precisar de um job agendado rodando separado.
//
// BUGFIX: o servidor roda em UTC, mas a data/hora da reserva e' sempre
// horario de Brasilia (sem fuso salvo no banco). Comparar direto com
// NOW() (UTC) fazia qualquer reserva pra daqui a menos de 3h ser
// marcada como "nao compareceu" na hora -- ANTES do horario marcado
// (Brasilia esta 3h atras de UTC). "NOW() AT TIME ZONE
// 'America/Sao_Paulo'" converte o instante atual pro horario de parede
// de Brasilia, comparando corretamente com o horario da reserva.
async function sweepReservasExpiradas(estabelecimentoId) {
  await query(
    `UPDATE reservas
       SET status = CASE WHEN check_in_em IS NOT NULL THEN 'concluida' ELSE 'nao_concluida' END,
           atualizado_em = NOW()
     WHERE estabelecimento_id = $1
       AND status IN ('pendente', 'confirmada')
       AND (data_reserva + horario_reserva::time) < (NOW() AT TIME ZONE 'America/Sao_Paulo')`,
    [estabelecimentoId]
  );
}

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
    await sweepReservasExpiradas(req.estabelecimentoId);

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

// Painel: confirma ou cancela (recusa) uma reserva. So permitido enquanto
// a reserva ainda estiver pendente/confirmada -- depois que a data/hora
// passa (sweepReservasExpiradas ja deve ter marcado como concluida/nao
// concluida) ou depois de um check-in, nao da mais pra confirmar/cancelar.
async function atualizarStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ erro: 'Status invalido.' });

    if (status === 'cancelada') {
      const atual = await query(
        `SELECT status, (data_reserva + horario_reserva::time) < (NOW() AT TIME ZONE 'America/Sao_Paulo') AS ja_passou
         FROM reservas WHERE id = $1 AND estabelecimento_id = $2`,
        [id, req.estabelecimentoId]
      );
      if (atual.rows.length === 0) return res.status(404).json({ erro: 'Reserva nao encontrada.' });
      if (!['pendente', 'confirmada'].includes(atual.rows[0].status)) {
        return res.status(400).json({ erro: 'Essa reserva ja foi finalizada e nao pode mais ser cancelada.' });
      }
      if (atual.rows[0].ja_passou) {
        return res.status(400).json({ erro: 'Essa reserva ja passou da data/hora e nao pode mais ser cancelada.' });
      }
    }

    // Quando e' a propria loja que cancela/recusa (painel do admin), marca
    // cancelada_por = 'loja' pra distinguir de um cancelamento feito pelo
    // cliente em "Minhas reservas" (funcao cancelarPropria, abaixo).
    const canceladaPor = status === 'cancelada' ? 'loja' : null;

    const resultado = await query(
      `UPDATE reservas SET status = $1, atualizado_em = NOW(), cancelada_por = $2
       WHERE id = $3 AND estabelecimento_id = $4 AND status IN ('pendente', 'confirmada')
       RETURNING *`,
      [status, canceladaPor, id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Reserva nao encontrada ou ja finalizada.' });

    const reserva = resultado.rows[0];
    const dataReservaISO = reserva.data_reserva instanceof Date
      ? reserva.data_reserva.toISOString().substring(0, 10)
      : String(reserva.data_reserva).substring(0, 10);
    const dataFormatada = new Date(`${dataReservaISO}T00:00:00`).toLocaleDateString('pt-BR');
    if (status === 'confirmada') {
      notificar(req.estabelecimentoId, reserva.cliente_telefone, 'reserva', reserva.id,
        'Reserva confirmada',
        `Sua reserva para ${dataFormatada} às ${String(reserva.horario_reserva).substring(0, 5)} foi confirmada!`);
    } else if (status === 'cancelada') {
      notificar(req.estabelecimentoId, reserva.cliente_telefone, 'reserva', reserva.id,
        'Reserva recusada',
        `Sua reserva para ${dataFormatada} às ${String(reserva.horario_reserva).substring(0, 5)} não pôde ser confirmada pela loja.`);
    }

    res.json(reserva);
  } catch (error) {
    console.error('Erro ao atualizar status da reserva:', error);
    res.status(500).json({ erro: 'Erro ao atualizar reserva.' });
  }
}

// Painel: check-in -- o cliente chegou no restaurante. So permitido numa
// reserva ainda pendente/confirmada (nao cancelada, nao ja finalizada).
async function fazerCheckIn(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      `UPDATE reservas SET status = 'concluida', check_in_em = NOW(), atualizado_em = NOW()
       WHERE id = $1 AND estabelecimento_id = $2 AND status IN ('pendente', 'confirmada')
       RETURNING *`,
      [id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Reserva nao encontrada, ja cancelada ou ja finalizada.' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao fazer check-in da reserva:', error);
    res.status(500).json({ erro: 'Erro ao fazer check-in.' });
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
// So permitido ANTES da data/hora da reserva -- depois disso ela ja foi
// (ou devera ser, pelo sweep) marcada como concluida/nao concluida.
async function cancelarPropria(req, res) {
  try {
    const { slug, id } = req.params;
    const { telefone } = req.body;

    if (!telefone || !telefone.trim()) {
      return res.status(400).json({ erro: 'Informe seu telefone para cancelar a reserva.' });
    }

    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    await sweepReservasExpiradas(estRes.rows[0].id);

    const reservaRes = await query(
      `SELECT *, (data_reserva + horario_reserva::time) < (NOW() AT TIME ZONE 'America/Sao_Paulo') AS ja_passou
       FROM reservas WHERE id = $1 AND estabelecimento_id = $2`,
      [id, estRes.rows[0].id]
    );
    if (reservaRes.rows.length === 0) return res.status(404).json({ erro: 'Reserva nao encontrada.' });

    const reserva = reservaRes.rows[0];
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneReservaLimpo = (reserva.cliente_telefone || '').replace(/\D/g, '');
    if (telefoneLimpo !== telefoneReservaLimpo) {
      return res.status(403).json({ erro: 'Nao foi possivel confirmar essa reserva com o telefone informado.' });
    }

    if (!['pendente', 'confirmada'].includes(reserva.status)) {
      return res.status(400).json({ erro: 'Essa reserva ja foi finalizada e nao pode mais ser cancelada.' });
    }

    if (reserva.ja_passou) {
      return res.status(400).json({ erro: 'Essa reserva ja passou e nao pode mais ser cancelada.' });
    }

    const resultado = await query(
      "UPDATE reservas SET status = 'cancelada', atualizado_em = NOW(), cancelada_por = 'cliente' WHERE id = $1 RETURNING *",
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

    await sweepReservasExpiradas(estRes.rows[0].id);

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

module.exports = { criar, listar, listarReservasCliente, atualizarStatus, fazerCheckIn, alternarReservaAtiva, cancelarPropria };
