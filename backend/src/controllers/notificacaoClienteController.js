// ===================================================================
// Notificacoes do CLIENTE (nao confundir com notificacoes internas de
// estoque, que sao pra loja). Guarda um aviso toda vez que uma reserva
// e confirmada/recusada, ou que um pedido muda de status -- o cliente
// ve isso no proprio app (badge "nao lida" em "Minha conta" + pagina
// "Notificacoes"), sem precisar ficar checando manualmente.
//
// A funcao "notificar" e' chamada de DENTRO de outros controllers
// (reservaController.atualizarStatus, pedidoController.atualizarStatusPedido)
// depois que a acao principal ja' deu certo -- se o INSERT da notificacao
// falhar por algum motivo, so loga o erro no console e segue, nunca
// derruba a resposta da acao principal (confirmar uma reserva/pedido nao
// pode falhar so' porque a notificacao teve algum problema).
// ===================================================================
const { query } = require('../config/database');

async function notificar(estabelecimentoId, clienteTelefone, tipo, referenciaId, titulo, mensagem) {
  try {
    if (!clienteTelefone) return;
    await query(
      `INSERT INTO notificacoes_cliente (estabelecimento_id, cliente_telefone, tipo, referencia_id, titulo, mensagem)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [estabelecimentoId, clienteTelefone, tipo, referenciaId, titulo, mensagem]
    );
  } catch (error) {
    console.error('Erro ao criar notificacao para o cliente (nao interrompe a acao principal):', error.message);
  }
}

// Cliente ve suas notificacoes (rota publica, sem login -- so pelo
// telefone, igual "Meus pedidos"/"Minhas reservas").
async function listar(req, res) {
  try {
    const { slug, telefone } = req.params;
    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const telefoneLimpo = (telefone || '').replace(/\D/g, '');
    const resultado = await query(
      `SELECT * FROM notificacoes_cliente
       WHERE estabelecimento_id = $1
         AND regexp_replace(cliente_telefone, '\\D', '', 'g') LIKE $2
       ORDER BY criado_em DESC LIMIT 50`,
      [estRes.rows[0].id, `%${telefoneLimpo}%`]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar notificacoes do cliente:', error);
    res.status(500).json({ erro: 'Erro ao listar notificacoes.' });
  }
}

// Badge de "nao lidas" -- chamado com frequencia (toda vez que o cardapio
// carrega), entao e' uma consulta enxuta, so a contagem.
async function contarNaoLidas(req, res) {
  try {
    const { slug, telefone } = req.params;
    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const telefoneLimpo = (telefone || '').replace(/\D/g, '');
    const resultado = await query(
      `SELECT COUNT(*)::int AS nao_lidas FROM notificacoes_cliente
       WHERE estabelecimento_id = $1
         AND regexp_replace(cliente_telefone, '\\D', '', 'g') LIKE $2
         AND lida = false`,
      [estRes.rows[0].id, `%${telefoneLimpo}%`]
    );
    res.json({ nao_lidas: resultado.rows[0].nao_lidas });
  } catch (error) {
    console.error('Erro ao contar notificacoes nao lidas:', error);
    res.status(500).json({ erro: 'Erro ao contar notificacoes.' });
  }
}

// Marca todas como lidas de uma vez -- chamado quando o cliente abre a
// pagina "Notificacoes".
async function marcarTodasLidas(req, res) {
  try {
    const { slug, telefone } = req.params;
    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const telefoneLimpo = (telefone || '').replace(/\D/g, '');
    await query(
      `UPDATE notificacoes_cliente SET lida = true
       WHERE estabelecimento_id = $1
         AND regexp_replace(cliente_telefone, '\\D', '', 'g') LIKE $2
         AND lida = false`,
      [estRes.rows[0].id, `%${telefoneLimpo}%`]
    );
    res.json({ mensagem: 'Notificacoes marcadas como lidas.' });
  } catch (error) {
    console.error('Erro ao marcar notificacoes como lidas:', error);
    res.status(500).json({ erro: 'Erro ao marcar notificacoes como lidas.' });
  }
}

module.exports = { notificar, listar, contarNaoLidas, marcarTodasLidas };
