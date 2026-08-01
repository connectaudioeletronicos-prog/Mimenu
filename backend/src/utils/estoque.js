// ===================================================================
// Utilitario de Controle de Estoque
// Caminho no projeto: backend/src/utils/estoque.js
// ===================================================================
// Centraliza toda a logica de baixa automatica de estoque nas vendas,
// registro de movimentacoes e disparo de alertas (dashboard/e-mail).
// Usado pelo pedidoController (baixa automatica) e pelo estoqueController
// (compra manual / ajuste manual).
// ===================================================================
const { query } = require('../config/database');
const { enviarEmailGenerico } = require('./email');

function calcularStatus(estoque, estoqueMinimo) {
  const qtd = Number(estoque) || 0;
  const minimo = Number(estoqueMinimo) || 0;
  if (qtd <= 0) return 'esgotado';
  if (qtd <= minimo) return 'atencao';
  return 'normal';
}

// Registra uma linha no historico de movimentacoes. Nao falha o fluxo
// principal caso de erro (so loga), pra nunca travar uma venda por causa
// do log de estoque.
async function registrarMovimentacao({
  estabelecimentoId, produtoId, tipo, motivo, quantidade, estoqueResultante,
  pedidoId = null, funcionarioId = null, canalVenda = null, observacoes = null
}) {
  try {
    await query(
      `INSERT INTO estoque_movimentacoes
        (estabelecimento_id, produto_id, tipo, motivo, quantidade, estoque_resultante, pedido_id, funcionario_id, canal_venda, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [estabelecimentoId, produtoId, tipo, motivo, quantidade, estoqueResultante, pedidoId, funcionarioId, canalVenda, observacoes]
    );
  } catch (error) {
    console.error('Erro ao registrar movimentacao de estoque:', error.message);
  }
}

// Verifica se o produto entrou em nivel de alerta (atencao ou esgotado) e,
// se sim, dispara os canais que o lojista tiver ativado (dashboard/e-mail).
// A checagem de "ja avisou recentemente" e simples: nao avisa de novo se ja
// existe uma notificacao para esse produto nas ultimas 6 horas, pra nao
// floodar o lojista de e-mail a cada venda.
async function verificarEDispararAlerta(estabelecimentoId, produto) {
  try {
    if (!produto.controla_estoque) return;
    const status = calcularStatus(produto.estoque, produto.estoque_minimo);
    if (status === 'normal') return;

    const jaAvisado = await query(
      `SELECT id FROM estoque_notificacoes
       WHERE estabelecimento_id = $1 AND produto_id = $2 AND criado_em > NOW() - INTERVAL '6 hours'
       LIMIT 1`,
      [estabelecimentoId, produto.id]
    );
    if (jaAvisado.rows.length > 0) return;

    const estRes = await query(
      `SELECT nome, email, estoque_alerta_dashboard_ativo, estoque_alerta_email_ativo, estoque_alerta_email_destino
       FROM estabelecimentos WHERE id = $1`,
      [estabelecimentoId]
    );
    if (estRes.rows.length === 0) return;
    const estabelecimento = estRes.rows[0];

    const mensagem = status === 'esgotado'
      ? `Atencao! ${produto.nome} esta esgotado. Recomendamos realizar uma nova compra.`
      : `Atencao! Restam apenas ${produto.estoque} unidades de ${produto.nome}. Recomendamos realizar uma nova compra.`;

    if (estabelecimento.estoque_alerta_dashboard_ativo) {
      await query(
        `INSERT INTO estoque_notificacoes (estabelecimento_id, produto_id, canal, mensagem, destino, enviado_com_sucesso)
         VALUES ($1,$2,'dashboard',$3,NULL,true)`,
        [estabelecimentoId, produto.id, mensagem]
      );
    }

    if (estabelecimento.estoque_alerta_email_ativo) {
      const destino = estabelecimento.estoque_alerta_email_destino || estabelecimento.email;
      const resultadoEnvio = await enviarEmailGenerico(destino, estabelecimento.nome, 'Alerta de estoque - Mimenu', mensagem);
      await query(
        `INSERT INTO estoque_notificacoes (estabelecimento_id, produto_id, canal, mensagem, destino, enviado_com_sucesso)
         VALUES ($1,$2,'email',$3,$4,$5)`,
        [estabelecimentoId, produto.id, mensagem, destino, !!resultadoEnvio.enviado]
      );
    }
  } catch (error) {
    console.error('Erro ao verificar/disparar alerta de estoque:', error.message);
  }
}

// Chamada apos uma venda ser confirmada (pedido publico ou pedido manual de
// balcao/mesa). Para cada item vendido, se o produto tiver controle de
// estoque ativado, desconta a quantidade (nunca deixa ir abaixo de 0),
// registra a movimentacao e checa alerta. Erros aqui nunca devem derrubar
// a criacao do pedido -- por isso todo o corpo esta em try/catch silencioso.
async function baixarEstoquePorVenda(estabelecimentoId, itensVendidos, { pedidoId, funcionarioId = null, canalVenda }) {
  for (const item of itensVendidos) {
    try {
      const prodRes = await query(
        'SELECT id, nome, estoque, estoque_minimo, controla_estoque FROM produtos WHERE id = $1 AND estabelecimento_id = $2',
        [item.produto_id, estabelecimentoId]
      );
      if (prodRes.rows.length === 0) continue;
      const produto = prodRes.rows[0];
      if (!produto.controla_estoque) continue;

      const estoqueAtual = Number(produto.estoque) || 0;
      const novoEstoque = Math.max(0, estoqueAtual - Number(item.quantidade));

      await query('UPDATE produtos SET estoque = $1 WHERE id = $2', [novoEstoque, produto.id]);

      await registrarMovimentacao({
        estabelecimentoId,
        produtoId: produto.id,
        tipo: 'saida',
        motivo: 'venda',
        quantidade: item.quantidade,
        estoqueResultante: novoEstoque,
        pedidoId,
        funcionarioId,
        canalVenda
      });

      await verificarEDispararAlerta(estabelecimentoId, { ...produto, estoque: novoEstoque });
    } catch (error) {
      console.error(`Erro ao baixar estoque do produto ${item.produto_id}:`, error.message);
    }
  }
}

module.exports = {
  calcularStatus,
  registrarMovimentacao,
  verificarEDispararAlerta,
  baixarEstoquePorVenda
};
