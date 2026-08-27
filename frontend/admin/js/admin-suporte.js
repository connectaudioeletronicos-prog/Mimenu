// ===================================================================
// SUPORTE (lado do lojista) - logica de tela
// Caminho no projeto: frontend/admin/js/admin-suporte.js
// Depende de funcoes globais ja existentes em admin.js/admin-api.js:
// chamarApiAdmin, mostrarToast.
// ===================================================================

let SUPORTE_TICKET_ATUAL = null;

function suporteFormatarData(iso) {
  if (!iso) return '';
  const data = new Date(iso);
  return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function suporteRotuloStatus(status) {
  return { aberto: 'Aguardando resposta', respondido: 'Respondido', fechado: 'Fechado' }[status] || status;
}

function mostrarViewSuporte(nome) {
  ['suporte-lista-view', 'suporte-novo-view', 'suporte-detalhe-view'].forEach(id => {
    document.getElementById(id).classList.toggle('oculto', id !== nome);
  });
}

async function carregarListaSuporte() {
  const container = document.getElementById('suporte-lista-tickets');
  container.innerHTML = '<p>Carregando...</p>';
  try {
    const tickets = await chamarApiAdmin('/suporte/tickets');
    if (tickets.length === 0) {
      container.innerHTML = '<p>Nenhum chamado ainda. Clique em "+ Novo chamado" para falar com o suporte.</p>';
    } else {
      container.innerHTML = tickets.map(t => `
        <div class="item-admin suporte-ticket-card" data-ticket-id="${t.id}">
          <div class="item-admin__info">
            <div class="item-admin__titulo">${t.assunto} ${t.nao_lido_pelo_lojista ? '<span class="painel__menu-contador">nova resposta</span>' : ''}</div>
            <div class="item-admin__subtitulo">${(t.ultima_mensagem || '').slice(0, 80)}</div>
            <small>${suporteRotuloStatus(t.status)} · ${suporteFormatarData(t.atualizado_em)}</small>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-ticket-id]').forEach(el => {
        el.addEventListener('click', () => abrirTicketSuporte(el.dataset.ticketId));
      });
    }
  } catch (erro) {
    container.innerHTML = `<p class="msg erro">${erro.message}</p>`;
  }
  await atualizarContadorSuporte();
}

async function atualizarContadorSuporte() {
  if (!obterToken()) return; // ainda nao logado -- nao ha sessao pra consultar
  try {
    const tickets = await chamarApiAdmin('/suporte/tickets');
    const naoLidos = tickets.filter(t => t.nao_lido_pelo_lojista).length;
    const rotulo = naoLidos > 0 ? naoLidos : '';
    const badge = document.querySelector('[data-menu-contador="suporte-nao-lidos"]');
    if (badge) badge.textContent = rotulo;
    const badgeSidebar = document.querySelector('[data-menu-contador="suporte-nao-lidos-sidebar"]');
    if (badgeSidebar) badgeSidebar.textContent = rotulo;
  } catch (erro) {
    // Silencioso -- contador e so um indicador visual, nao trava a tela.
  }
}

function renderizarMensagemSuporte(m) {
  const autorEu = m.autor === 'lojista';
  return `
    <div class="suporte-msg ${autorEu ? 'suporte-msg--eu' : 'suporte-msg--suporte'}">
      <div class="suporte-msg__autor">${autorEu ? 'Voce' : 'Suporte Mimenu'}</div>
      <div class="suporte-msg__texto">${(m.mensagem || '').replace(/\n/g, '<br>')}</div>
      ${m.anexo_url ? `<a href="${m.anexo_url}" target="_blank"><img src="${m.anexo_url}" class="suporte-msg__anexo" alt="anexo"></a>` : ''}
      <div class="suporte-msg__data">${suporteFormatarData(m.criado_em)}</div>
    </div>
  `;
}

async function abrirTicketSuporte(id) {
  mostrarViewSuporte('suporte-detalhe-view');
  document.getElementById('suporte-detalhe-mensagens').innerHTML = '<p>Carregando...</p>';
  try {
    const dados = await chamarApiAdmin(`/suporte/tickets/${id}`);
    SUPORTE_TICKET_ATUAL = id;
    document.getElementById('suporte-detalhe-assunto').textContent = dados.ticket.assunto;
    document.getElementById('suporte-detalhe-mensagens').innerHTML = dados.mensagens.map(renderizarMensagemSuporte).join('');
    document.getElementById('suporte-detalhe-resposta').value = '';
    document.getElementById('suporte-detalhe-anexo').value = '';
    document.getElementById('suporte-detalhe-resultado').innerHTML = '';
    atualizarContadorSuporte();
  } catch (erro) {
    document.getElementById('suporte-detalhe-mensagens').innerHTML = `<p class="msg erro">${erro.message}</p>`;
  }
}

function configurarEntradaSuporte() {
  const botaoAbrir = document.getElementById('botao-ir-para-suporte');
  if (!botaoAbrir) return;

  botaoAbrir.addEventListener('click', () => {
    document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    document.getElementById('aba-suporte').classList.remove('oculto');
    mostrarViewSuporte('suporte-lista-view');
    carregarListaSuporte();
  });

  document.getElementById('botao-voltar-config-de-suporte').addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    document.getElementById('aba-configuracoes').classList.remove('oculto');
  });

  document.getElementById('botao-voltar-lista-suporte').addEventListener('click', () => {
    mostrarViewSuporte('suporte-lista-view');
    carregarListaSuporte();
  });

  document.getElementById('botao-novo-chamado-suporte').addEventListener('click', () => {
    document.getElementById('suporte-novo-assunto').value = '';
    document.getElementById('suporte-novo-mensagem').value = '';
    document.getElementById('suporte-novo-anexo').value = '';
    document.getElementById('suporte-novo-resultado').innerHTML = '';
    mostrarViewSuporte('suporte-novo-view');
  });

  document.getElementById('botao-cancelar-novo-chamado').addEventListener('click', () => {
    mostrarViewSuporte('suporte-lista-view');
  });

  document.getElementById('botao-enviar-novo-chamado').addEventListener('click', async () => {
    const assunto = document.getElementById('suporte-novo-assunto').value.trim();
    const mensagem = document.getElementById('suporte-novo-mensagem').value.trim();
    const arquivo = document.getElementById('suporte-novo-anexo').files[0];
    const resultadoEl = document.getElementById('suporte-novo-resultado');

    if (!assunto || !mensagem) {
      resultadoEl.innerHTML = '<div class="msg erro">Preencha o assunto e a mensagem.</div>';
      return;
    }

    const formData = new FormData();
    formData.append('assunto', assunto);
    formData.append('mensagem', mensagem);
    if (arquivo) formData.append('anexo', arquivo);

    try {
      await chamarApiAdmin('/suporte/tickets', { method: 'POST', body: formData, isFormData: true });
      mostrarToast('Chamado aberto com sucesso.');
      mostrarViewSuporte('suporte-lista-view');
      carregarListaSuporte();
    } catch (erro) {
      resultadoEl.innerHTML = `<div class="msg erro">${erro.message}</div>`;
    }
  });

  document.getElementById('botao-enviar-resposta-suporte').addEventListener('click', async () => {
    const mensagem = document.getElementById('suporte-detalhe-resposta').value.trim();
    const arquivo = document.getElementById('suporte-detalhe-anexo').files[0];
    const resultadoEl = document.getElementById('suporte-detalhe-resultado');

    if (!mensagem) {
      resultadoEl.innerHTML = '<div class="msg erro">Escreva uma mensagem.</div>';
      return;
    }
    if (!SUPORTE_TICKET_ATUAL) return;

    const formData = new FormData();
    formData.append('mensagem', mensagem);
    if (arquivo) formData.append('anexo', arquivo);

    try {
      await chamarApiAdmin(`/suporte/tickets/${SUPORTE_TICKET_ATUAL}/mensagens`, { method: 'POST', body: formData, isFormData: true });
      abrirTicketSuporte(SUPORTE_TICKET_ATUAL);
    } catch (erro) {
      resultadoEl.innerHTML = `<div class="msg erro">${erro.message}</div>`;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  configurarEntradaSuporte();
  // So verifica chamados novos se ja existir uma sessao (evita bater na
  // API antes do login, o que derrubava a pagina por "sessao expirada").
  setTimeout(atualizarContadorSuporte, 1500);

  // Tambem atualiza assim que o login e concluido com sucesso: escuta o
  // envio do formulario de login e, se der certo, atualiza o contador
  // pouco depois (dando tempo do token ser salvo).
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', () => {
      setTimeout(atualizarContadorSuporte, 1000);
    });
  }
});
