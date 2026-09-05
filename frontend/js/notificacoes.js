// ===================================================================
// Pagina "Notificacoes" -- avisos de reserva confirmada/recusada e de
// mudanca de status de pedido (confirmado, pronto, saiu para entrega,
// entregue, cancelado). Identificado por telefone, igual "Meus pedidos"
// e "Minhas reservas". Ao abrir esta pagina, todas as notificacoes sao
// marcadas como lidas (o badge vermelho zera).
// O carregamento da conta e a navegacao do topo ficam em
// js/conta-comum.js.
// ===================================================================

const ICONE_POR_TIPO = { reserva: '📅', pedido: '🧾' };

document.addEventListener('DOMContentLoaded', iniciarNotificacoes);

async function iniciarNotificacoes() {
  const conta = await carregarContaCliente();
  if (!conta) return;

  preencherSaudacaoConta(conta);
  configurarNavegacaoConta('notificacoes');
  await carregarNotificacoes();

  document.getElementById('tela-carregando').classList.add('oculto');
  document.getElementById('tela-cliente').classList.remove('oculto');
}

function formatarDataHoraNotificacao(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function renderizarCardNotificacao(notificacao) {
  const naoLidaEstilo = !notificacao.lida ? 'border-left: 3px solid #e63946;' : '';
  return `
    <div class="conta-pedido-card" style="${naoLidaEstilo}">
      <div class="conta-pedido-card__linha">
        <span class="conta-pedido-card__icone">${ICONE_POR_TIPO[notificacao.tipo] || '🔔'}</span>
        <div class="conta-pedido-card__texto">
          <div class="conta-pedido-card__codigo">${notificacao.titulo}</div>
          <div class="conta-pedido-card__data">${notificacao.mensagem}</div>
          <div class="conta-pedido-card__data" style="opacity:0.75;">${formatarDataHoraNotificacao(notificacao.criado_em)}</div>
        </div>
      </div>
    </div>
  `;
}

async function carregarNotificacoes() {
  const container = document.getElementById('lista-notificacoes-cliente');

  if (!SLUG_ESTABELECIMENTO) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Abra "Minha conta" a partir do cardápio de uma loja para ver suas notificações.</p>';
    return;
  }
  if (!CONTA_ATUAL.telefone) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Preencha seu telefone em "Meus dados" para receber notificações.</p>';
    return;
  }

  container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Carregando notificações...</p>';

  try {
    const notificacoes = await buscarNotificacoesCliente(SLUG_ESTABELECIMENTO, CONTA_ATUAL.telefone);
    container.innerHTML = notificacoes.length
      ? notificacoes.map(renderizarCardNotificacao).join('')
      : '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Você ainda não tem nenhuma notificação nesta loja.</p>';

    // Marca tudo como lido ao abrir a pagina -- o badge vermelho (aqui e
    // no botao "Minha conta" do cardapio) so volta a aparecer na proxima
    // vez que algo novo acontecer (reserva confirmada, pedido mudou de
    // status, etc).
    if (notificacoes.some(n => !n.lida)) {
      await marcarNotificacoesComoLidas(SLUG_ESTABELECIMENTO, CONTA_ATUAL.telefone);
      const badge = document.getElementById('badge-aba-notificacoes');
      if (badge) badge.classList.add('oculto');
    }
  } catch (erro) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Não foi possível carregar suas notificações agora.</p>';
  }
}
