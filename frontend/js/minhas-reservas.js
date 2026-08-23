// ===================================================================
// Pagina "Minhas reservas" -- lista reservas ativas e o historico de
// agendamentos do cliente nesta loja (via telefone). Reservas ativas
// (pendente/confirmada, ainda no futuro) ganham um botao "Cancelar
// reserva", pra o cliente desmarcar sem precisar ligar pra loja.
// O carregamento da conta e a navegacao do topo ficam em
// js/conta-comum.js.
// ===================================================================

const STATUS_RESERVA_INFO = {
  pendente: { texto: 'Aguardando confirmação', icone: '⏳', classe: 'aguardando' },
  confirmada: { texto: 'Confirmada', icone: '✅', classe: 'confirmado' },
  cancelada: { texto: 'Recusada', icone: '✕', classe: 'cancelado' }
};

// Reserva com status 'cancelada' pode ter sido recusada PELA LOJA ou
// cancelada PELO PROPRIO CLIENTE (ver reservaController.js -- coluna
// cancelada_por). O texto/rotulo muda dependendo de quem cancelou.
function textoCancelamento(reserva) {
  return reserva.cancelada_por === 'cliente' ? 'Cancelado pelo cliente' : 'Recusada';
}

document.addEventListener('DOMContentLoaded', iniciarMinhasReservas);

async function iniciarMinhasReservas() {
  const conta = await carregarContaCliente();
  if (!conta) return;

  preencherSaudacaoConta(conta);
  configurarNavegacaoConta('reservas');
  await carregarMinhasReservas();

  document.getElementById('tela-carregando').classList.add('oculto');
  document.getElementById('tela-cliente').classList.remove('oculto');
}

function formatarDataHoraReserva(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Uma reserva sai de "ativa" e vai pro historico assim que o horario
// agendado ja passou, ou assim que a loja recusa (cancelada) -- nao importa
// se ja passou ou nao, uma recusa ja e' definitiva.
function reservaEstaNoHistorico(reserva) {
  if (reserva.status === 'cancelada') return true;
  const dataHoraAgendada = new Date(`${reserva.data_reserva}T${reserva.horario_reserva.substring(0, 5)}:00`);
  return dataHoraAgendada.getTime() < Date.now();
}

// No historico, "concluida" (verde) so' quando a loja tinha confirmado e o
// horario passou -- cliente efetivamente foi atendido. Qualquer outro caso
// (recusada, ou nunca respondida a tempo) conta como nao concluida (vermelho).
function infoHistoricoReserva(reserva) {
  if (reserva.status === 'confirmada') return { texto: 'Concluída', classe: 'confirmado' };
  if (reserva.status === 'cancelada') return { texto: textoCancelamento(reserva), classe: 'cancelado' };
  return { texto: 'Não concluída', classe: 'cancelado' };
}

function renderizarCardReserva(reserva, { historico = false } = {}) {
  let info = historico ? infoHistoricoReserva(reserva) : (STATUS_RESERVA_INFO[reserva.status] || STATUS_RESERVA_INFO.pendente);
  if (!historico && reserva.status === 'cancelada') {
    info = { ...info, texto: textoCancelamento(reserva) };
  }
  const dataFormatada = new Date(`${reserva.data_reserva}T00:00:00`).toLocaleDateString('pt-BR');

  const linhasExtras = [`Solicitada em ${formatarDataHoraReserva(reserva.criado_em)}`];
  if (reserva.status !== 'pendente' && reserva.atualizado_em) {
    const rotulo = reserva.status === 'confirmada' ? 'Confirmada' : textoCancelamento(reserva);
    linhasExtras.push(`${rotulo} em ${formatarDataHoraReserva(reserva.atualizado_em)}`);
  }

  // So mostra o botao de cancelar em reservas ativas (nao historico) que
  // ainda nao foram recusadas -- reserva ja recusada/passada nao tem o que
  // cancelar.
  const podeCancelar = !historico && reserva.status !== 'cancelada';
  const botaoCancelar = podeCancelar
    ? `<button type="button" class="conta-botao-cancelar-reserva" data-reserva-id="${reserva.id}">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
         Cancelar reserva
       </button>`
    : '';

  return `
    <div class="conta-pedido-card">
      <div class="conta-pedido-card__linha">
        <span class="conta-pedido-card__icone">${STATUS_RESERVA_INFO[reserva.status]?.icone || '📅'}</span>
        <div class="conta-pedido-card__texto">
          <div class="conta-pedido-card__codigo">Reserva #${reserva.id.substring(0, 8)}</div>
          <div class="conta-pedido-card__data">${dataFormatada} às ${reserva.horario_reserva.substring(0, 5)} · ${reserva.quantidade_pessoas} pessoa${reserva.quantidade_pessoas > 1 ? 's' : ''}</div>
          <div class="conta-pedido-card__data" style="opacity:0.75;">${linhasExtras.join(' · ')}</div>
        </div>
        <span class="conta-pedido-card__status conta-pedido-card__status--${info.classe}">${info.texto}</span>
      </div>
      ${botaoCancelar}
    </div>
  `;
}

// Liga o clique dos botoes "Cancelar reserva" recem-renderizados. Pede
// confirmacao antes (acao irreversivel do lado do cliente) e manda o
// telefone da conta logada pro backend confirmar que a reserva e' mesmo
// dessa pessoa.
function ligarBotoesCancelarReserva(container) {
  container.querySelectorAll('.conta-botao-cancelar-reserva').forEach(botao => {
    botao.addEventListener('click', async () => {
      const reservaId = botao.getAttribute('data-reserva-id');
      const confirmou = window.confirm('Tem certeza que deseja cancelar esta reserva? Essa acao nao pode ser desfeita.');
      if (!confirmou) return;

      botao.disabled = true;
      botao.textContent = 'Cancelando...';

      try {
        await cancelarReservaCliente(SLUG_ESTABELECIMENTO, reservaId, CONTA_ATUAL.telefone);
        await carregarMinhasReservas();
      } catch (erro) {
        alert(erro.message);
        botao.disabled = false;
        botao.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          Cancelar reserva`;
      }
    });
  });
}

async function carregarMinhasReservas() {
  const container = document.getElementById('lista-reservas-cliente');
  const containerHistorico = document.getElementById('lista-reservas-historico-cliente');

  if (!SLUG_ESTABELECIMENTO) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Abra "Minha conta" a partir do cardapio de uma loja para ver suas reservas.</p>';
    containerHistorico.innerHTML = '';
    return;
  }
  if (!CONTA_ATUAL.telefone) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Preencha seu telefone em "Meus dados" para ver seu histórico de reservas.</p>';
    containerHistorico.innerHTML = '';
    return;
  }

  container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Carregando reservas...</p>';
  containerHistorico.innerHTML = '';

  try {
    const reservas = await buscarReservasCliente(SLUG_ESTABELECIMENTO, CONTA_ATUAL.telefone);
    if (reservas.length === 0) {
      container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Você ainda não fez nenhuma reserva nesta loja.</p>';
      containerHistorico.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Nenhum agendamento no histórico ainda.</p>';
      return;
    }

    const ativas = reservas.filter(r => !reservaEstaNoHistorico(r));
    const historico = reservas.filter(r => reservaEstaNoHistorico(r));

    container.innerHTML = ativas.length
      ? ativas.map(r => renderizarCardReserva(r)).join('')
      : '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Nenhuma reserva ativa no momento.</p>';
    ligarBotoesCancelarReserva(container);

    containerHistorico.innerHTML = historico.length
      ? historico.map(r => renderizarCardReserva(r, { historico: true })).join('')
      : '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Nenhum agendamento no histórico ainda.</p>';
  } catch (erro) {
    container.innerHTML = '<p style="color:var(--auth-texto-claro);font-size:0.88rem;">Não foi possível carregar suas reservas agora.</p>';
    containerHistorico.innerHTML = '';
  }
}
