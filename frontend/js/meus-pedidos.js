// ===================================================================
// Pagina "Meus pedidos" -- lista o historico de pedidos do cliente
// nesta loja (via telefone) e permite acompanhar o status de cada
// pedido em tempo real (timeline), igual funcionava na aba "Meus
// pedidos" da antiga pagina unica. O carregamento da conta e a
// navegacao do topo ficam em js/conta-comum.js.
// ===================================================================

let INTERVALO_ACOMPANHAMENTO_CONTA = null;
let PEDIDOS_CARREGADOS = [];

const PASSOS_TIMELINE = [
  { status: 'novo', icone: '📋', titulo: 'Pedido recebido', desc: 'Seu pedido foi recebido pelo estabelecimento.' },
  { status: 'preparando', icone: '🍳', titulo: 'Em preparo', desc: 'Seu pedido esta sendo preparado.' },
  { status: 'pronto', icone: '🔔', titulo: 'Pronto', desc: 'Seu pedido esta pronto e logo sai para entrega!' },
  { status: 'saiu_entrega', icone: '🛵', titulo: 'Saiu para entrega', desc: 'Seu pedido esta a caminho!' },
  { status: 'entregue', icone: '✅', titulo: 'Entregue', desc: 'Pedido entregue. Bom apetite!' }
];
const ORDEM_STATUS = ['novo', 'preparando', 'pronto', 'saiu_entrega', 'entregue'];

const ICONE_STATUS = {
  novo: '🛍️', preparando: '⏱️', saiu_entrega: '🛵', entregue: '✅', cancelado: '✕'
};

// Aviso best-effort de "pedido pronto": usa a Notification API do navegador
// quando disponivel/permitida. Se nao houver permissao, nao interrompe o
// fluxo -- o cliente ja ve a mudanca no acompanhamento na tela.
function avisarClientePedidoProntoConta() {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification('Seu pedido esta pronto! 🔔', { body: 'Logo ele sai para entrega.' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  } catch (erro) {}
}

function renderizarTimelineConta(box, statusAtual) {
  const indiceAtual = ORDEM_STATUS.indexOf(statusAtual);

  box.innerHTML = `
    <div class="conta-timeline">
      ${PASSOS_TIMELINE.map((passo, i) => {
        const classe = i < indiceAtual ? 'concluido' : i === indiceAtual ? 'ativo' : '';
        return `
          <div class="conta-timeline__passo ${classe}">
            <div class="conta-timeline__bola">${passo.icone}</div>
            <div class="conta-timeline__texto">
              <div class="conta-timeline__titulo">${passo.titulo}</div>
              <div class="conta-timeline__desc">${passo.desc}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function iniciarAcompanhamentoConta(pedidoId, box) {
  let ultimoStatusConhecido = null;
  INTERVALO_ACOMPANHAMENTO_CONTA = setInterval(async () => {
    try {
      const status = await consultarStatusPedido(SLUG_ESTABELECIMENTO, pedidoId);
      const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
      if (!card) { clearInterval(INTERVALO_ACOMPANHAMENTO_CONTA); return; }
      const statusSpan = card.querySelector('.conta-pedido-card__status');
      if (statusSpan) statusSpan.textContent = traduzirStatusConta(status.status_pedido);
      renderizarTimelineConta(box, status.status_pedido);

      if (status.status_pedido === 'pronto' && ultimoStatusConhecido !== 'pronto') {
        avisarClientePedidoProntoConta();
      }
      ultimoStatusConhecido = status.status_pedido;

      if (status.status_pedido === 'entregue' || status.status_pedido === 'cancelado') {
        clearInterval(INTERVALO_ACOMPANHAMENTO_CONTA);
        INTERVALO_ACOMPANHAMENTO_CONTA = null;
      }
    } catch (erro) {}
  }, 15000);
}

function traduzirStatusConta(status) {
  const mapa = {
    novo: 'Recebido', preparando: 'Em preparo', saiu_entrega: 'Saiu para entrega',
    pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado'
  };
  return mapa[status] || status;
}

document.addEventListener('DOMContentLoaded', iniciarMeusPedidos);

async function iniciarMeusPedidos() {
  const conta = await carregarContaCliente();
  if (!conta) return;

  preencherSaudacaoConta(conta);
  configurarNavegacaoConta('pedidos');
  atualizarBadgeAbaNotificacoes();
  await carregarMeusPedidos();

  document.getElementById('tela-carregando').classList.add('oculto');
  document.getElementById('tela-cliente').classList.remove('oculto');
}

function renderizarResumoPedidos(pedidos) {
  const container = document.getElementById('resumo-pedidos-cliente');
  const emPreparo = pedidos.filter(p => p.status_pedido === 'novo' || p.status_pedido === 'preparando' || p.status_pedido === 'pronto').length;
  const saiuEntrega = pedidos.filter(p => p.status_pedido === 'saiu_entrega').length;
  const entregues = pedidos.filter(p => p.status_pedido === 'entregue').length;

  container.innerHTML = `
    <div class="conta-resumo__card">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>
      <div class="conta-resumo__numero">${pedidos.length}</div>
      <div class="conta-resumo__legenda">Total de pedidos</div>
    </div>
    <div class="conta-resumo__card conta-resumo__card--preparo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
      <div class="conta-resumo__numero">${emPreparo}</div>
      <div class="conta-resumo__legenda">Em preparo</div>
    </div>
    <div class="conta-resumo__card conta-resumo__card--entrega">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17h13V6H3z"/><path d="M16 10h4l2 3v4h-6z"/><circle cx="7" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>
      <div class="conta-resumo__numero">${saiuEntrega}</div>
      <div class="conta-resumo__legenda">Saiu para entrega</div>
    </div>
    <div class="conta-resumo__card">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
      <div class="conta-resumo__numero">${entregues}</div>
      <div class="conta-resumo__legenda">Entregues</div>
    </div>
  `;
  container.classList.remove('oculto');
}

async function carregarMeusPedidos() {
  const container = document.getElementById('lista-pedidos-cliente');
  const resumo = document.getElementById('resumo-pedidos-cliente');
  resumo.classList.add('oculto');

  if (!SLUG_ESTABELECIMENTO) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Abra "Minha conta" a partir do cardapio de uma loja para ver seus pedidos dela.</p>';
    return;
  }
  if (!CONTA_ATUAL.telefone) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Preencha seu telefone em "Meus dados" para ver seu historico.</p>';
    return;
  }

  container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Carregando pedidos...</p>';

  try {
    const pedidos = await buscarPedidosCliente(SLUG_ESTABELECIMENTO, CONTA_ATUAL.telefone);
    PEDIDOS_CARREGADOS = pedidos;
    if (pedidos.length === 0) {
      container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Voce ainda nao tem pedidos nesta loja.</p>';
      return;
    }

    renderizarResumoPedidos(pedidos);

    container.innerHTML = pedidos.map(pedido => `
      <div class="conta-pedido-card" data-pedido-id="${pedido.id}">
        <div class="conta-pedido-card__linha">
          <span class="conta-pedido-card__icone">${ICONE_STATUS[pedido.status_pedido] || '🛍️'}</span>
          <div class="conta-pedido-card__texto">
            <div class="conta-pedido-card__codigo">Pedido #${pedido.id.substring(0, 8)}</div>
            <div class="conta-pedido-card__data">${new Date(pedido.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${formatarMoeda(pedido.total)}</div>
          </div>
          <span class="conta-pedido-card__status">${traduzirStatusConta(pedido.status_pedido)}</span>
          <svg class="conta-pedido-card__seta" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <div class="conta-pedido-card__timeline oculto" id="acomp-conta-${pedido.id}"></div>
      </div>
    `).join('');

    container.querySelectorAll('.conta-pedido-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-pedido-id');
        const jaSelecionado = card.classList.contains('selecionado');

        container.querySelectorAll('.conta-pedido-card').forEach(c => {
          c.classList.remove('selecionado');
          c.querySelector('.conta-pedido-card__timeline').classList.add('oculto');
        });
        if (INTERVALO_ACOMPANHAMENTO_CONTA) { clearInterval(INTERVALO_ACOMPANHAMENTO_CONTA); INTERVALO_ACOMPANHAMENTO_CONTA = null; }

        if (!jaSelecionado) {
          card.classList.add('selecionado');
          const box = document.getElementById(`acomp-conta-${id}`);
          box.classList.remove('oculto');
          const pedido = pedidos.find(p => p.id === id);
          renderizarTimelineConta(box, pedido.status_pedido);
          iniciarAcompanhamentoConta(id, box);
        }
      });
    });
  } catch (erro) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Nao foi possivel carregar seus pedidos agora.</p>';
  }
}
