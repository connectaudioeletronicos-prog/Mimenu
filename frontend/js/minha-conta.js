// ===================================================================
// Pagina "Minha conta" -- substitui o antigo mini-formulario embutido no
// cardapio (que so lia um cache local do navegador). Agora mostra e edita
// os dados reais da conta logada, via GET/PUT /clientes/auth/me.
// ===================================================================

const CHAVE_TOKEN_CLIENTE_CONTA = 'palatos_token_cliente';
const CHAVE_CONTA_CLIENTE_CONTA = 'palatos_conta_cliente';

let CONTA_ATUAL = null;
let INTERVALO_ACOMPANHAMENTO_CONTA = null;

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
  const passos = [
    { status: 'novo', icone: '📋', titulo: 'Pedido recebido', desc: 'Seu pedido foi recebido pelo estabelecimento.' },
    { status: 'preparando', icone: '🍳', titulo: 'Em preparo', desc: 'Seu pedido esta sendo preparado.' },
    { status: 'pronto', icone: '🔔', titulo: 'Pronto', desc: 'Seu pedido esta pronto e logo sai para entrega!' },
    { status: 'saiu_entrega', icone: '🛵', titulo: 'Saiu para entrega', desc: 'Seu pedido esta a caminho!' },
    { status: 'entregue', icone: '✅', titulo: 'Entregue', desc: 'Pedido entregue. Bom apetite!' }
  ];
  const ordem = ['novo', 'preparando', 'pronto', 'saiu_entrega', 'entregue'];
  const indiceAtual = ordem.indexOf(statusAtual);

  box.innerHTML = `
    <div class="acompanhamento-box__titulo">Acompanhamento do pedido</div>
    <div class="pedido-timeline">
      ${passos.map((passo, i) => {
        const classe = i < indiceAtual ? 'concluido' : i === indiceAtual ? 'ativo' : '';
        return `
          <div class="pedido-timeline__passo ${classe}">
            <div class="pedido-timeline__icone">${passo.icone}</div>
            <div class="pedido-timeline__texto">
              <div class="pedido-timeline__titulo">${passo.titulo}</div>
              <div class="pedido-timeline__desc">${passo.desc}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    ${statusAtual !== 'entregue' && statusAtual !== 'cancelado'
      ? '<div class="acompanhamento-atualizando">Atualizando automaticamente a cada 15 segundos...</div>'
      : ''}
  `;
}

function iniciarAcompanhamentoConta(pedidoId, box) {
  let ultimoStatusConhecido = null;
  INTERVALO_ACOMPANHAMENTO_CONTA = setInterval(async () => {
    try {
      const status = await consultarStatusPedido(SLUG_ESTABELECIMENTO, pedidoId);
      const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
      if (!card) { clearInterval(INTERVALO_ACOMPANHAMENTO_CONTA); return; }
      const statusSpan = card.querySelector('.pedido-detalhe__status');
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

function linkComSlug(pagina) {
  return SLUG_ESTABELECIMENTO ? `${pagina}?slug=${encodeURIComponent(SLUG_ESTABELECIMENTO)}` : pagina;
}

function aplicarMascaraTelefoneConta(campo) {
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 11);
    if (numeros.length === 0) this.value = '';
    else if (numeros.length <= 2) this.value = '(' + numeros;
    else this.value = '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2);
  });
}

function aplicarMascaraCepConta(campo) {
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 8);
    if (numeros.length <= 5) this.value = numeros;
    else this.value = numeros.substring(0, 5) + '-' + numeros.substring(5);
  });
}

function traduzirStatusConta(status) {
  const mapa = {
    novo: 'Recebido', preparando: 'Em preparo', saiu_entrega: 'Saiu para entrega',
    pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado'
  };
  return mapa[status] || status;
}

function formatarMoedaConta(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor) || 0);
}

document.addEventListener('DOMContentLoaded', iniciarMinhaConta);

async function iniciarMinhaConta() {
  const token = sessionStorage.getItem(CHAVE_TOKEN_CLIENTE_CONTA);
  if (!token) {
    window.location.href = linkComSlug('cliente-login.html');
    return;
  }

  try {
    const resposta = await fetch(`${API_BASE_URL}/clientes/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resposta.ok) {
      sessionStorage.removeItem(CHAVE_TOKEN_CLIENTE_CONTA);
      sessionStorage.removeItem(CHAVE_CONTA_CLIENTE_CONTA);
      window.location.href = linkComSlug('cliente-login.html');
      return;
    }
    CONTA_ATUAL = await resposta.json();
  } catch (erro) {
    document.getElementById('tela-carregando').innerHTML =
      '<p style="padding:20px;text-align:center;">Nao foi possivel carregar sua conta agora. Verifique sua conexao e tente novamente.</p>';
    return;
  }

  preencherDadosConta();
  configurarEventosMinhaConta();

  document.getElementById('tela-carregando').classList.add('oculto');
  document.getElementById('tela-cliente').classList.remove('oculto');
}

function preencherDadosConta() {
  const c = CONTA_ATUAL;
  document.getElementById('conta-nome').textContent = c.nome;
  document.getElementById('conta-campo-nome').value = c.nome || '';
  document.getElementById('conta-campo-sobrenome').value = c.sobrenome || '';
  document.getElementById('conta-campo-email').value = c.email || '';
  document.getElementById('conta-campo-cpf').value = c.cpf || '';
  document.getElementById('conta-campo-telefone').value = c.telefone || '';
  document.getElementById('conta-campo-cep').value = c.cep || '';
  document.getElementById('conta-campo-logradouro').value = c.logradouro || '';
  document.getElementById('conta-campo-numero').value = c.numero || '';
  document.getElementById('conta-campo-bairro').value = c.bairro || '';
  document.getElementById('conta-campo-cidade').value = c.cidade || '';
  document.getElementById('conta-campo-uf').value = c.uf || '';
}

function configurarEventosMinhaConta() {
  document.getElementById('botao-voltar-cardapio').addEventListener('click', () => {
    window.location.href = linkComSlug('index.html');
  });

  document.getElementById('botao-sair-conta').addEventListener('click', () => {
    sessionStorage.removeItem(CHAVE_TOKEN_CLIENTE_CONTA);
    sessionStorage.removeItem(CHAVE_CONTA_CLIENTE_CONTA);
    window.location.href = linkComSlug('index.html');
  });

  document.querySelectorAll('[data-aba-cliente]').forEach(botao => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('[data-aba-cliente]').forEach(b => b.classList.remove('ativo'));
      document.querySelectorAll('.aba-cliente').forEach(a => a.classList.add('oculto'));
      botao.classList.add('ativo');
      document.getElementById(`aba-cliente-${botao.dataset.abaCliente}`).classList.remove('oculto');
      if (INTERVALO_ACOMPANHAMENTO_CONTA) { clearInterval(INTERVALO_ACOMPANHAMENTO_CONTA); INTERVALO_ACOMPANHAMENTO_CONTA = null; }
      if (botao.dataset.abaCliente === 'pedidos') carregarMeusPedidos();
    });
  });

  aplicarMascaraTelefoneConta(document.getElementById('conta-campo-telefone'));
  aplicarMascaraCepConta(document.getElementById('conta-campo-cep'));

  document.getElementById('botao-buscar-cep-conta').addEventListener('click', async () => {
    const cepBruto = document.getElementById('conta-campo-cep').value.replace(/\D/g, '');
    if (cepBruto.length !== 8) return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepBruto}/json/`);
      const dados = await resposta.json();
      if (dados.erro) return;
      document.getElementById('conta-campo-logradouro').value = dados.logradouro || '';
      document.getElementById('conta-campo-bairro').value = dados.bairro || '';
      document.getElementById('conta-campo-cidade').value = dados.localidade || '';
      document.getElementById('conta-campo-uf').value = dados.uf || '';
    } catch (erro) {
      // Sem conexao com o ViaCEP: cliente preenche o endereco manualmente.
    }
  });

  document.getElementById('form-meus-dados').addEventListener('submit', salvarMeusDados);
}

async function salvarMeusDados(evento) {
  evento.preventDefault();
  const mensagem = document.getElementById('conta-mensagem');
  mensagem.classList.add('oculto');

  const corpo = {
    nome: document.getElementById('conta-campo-nome').value.trim(),
    sobrenome: document.getElementById('conta-campo-sobrenome').value.trim(),
    telefone: document.getElementById('conta-campo-telefone').value.trim(),
    cep: document.getElementById('conta-campo-cep').value.trim(),
    logradouro: document.getElementById('conta-campo-logradouro').value.trim(),
    numero: document.getElementById('conta-campo-numero').value.trim(),
    bairro: document.getElementById('conta-campo-bairro').value.trim(),
    cidade: document.getElementById('conta-campo-cidade').value.trim(),
    uf: document.getElementById('conta-campo-uf').value
  };

  const token = sessionStorage.getItem(CHAVE_TOKEN_CLIENTE_CONTA);
  const botao = document.getElementById('botao-salvar-meus-dados');
  botao.disabled = true;

  try {
    const resposta = await fetch(`${API_BASE_URL}/clientes/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo)
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel salvar seus dados.');

    CONTA_ATUAL = dados;
    sessionStorage.setItem(CHAVE_CONTA_CLIENTE_CONTA, JSON.stringify(dados));
    document.getElementById('conta-nome').textContent = dados.nome;
    mensagem.textContent = 'Dados salvos com sucesso!';
    mensagem.style.color = 'var(--cor-sucesso, #2a9d4f)';
    mensagem.classList.remove('oculto');
  } catch (erro) {
    mensagem.textContent = erro.message;
    mensagem.style.color = 'var(--cor-erro, #d62828)';
    mensagem.classList.remove('oculto');
  } finally {
    botao.disabled = false;
  }
}

async function carregarMeusPedidos() {
  const container = document.getElementById('lista-pedidos-cliente');

  if (!SLUG_ESTABELECIMENTO) {
    container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Abra "Minha conta" a partir do cardapio de uma loja para ver seus pedidos dela.</p>';
    return;
  }
  if (!CONTA_ATUAL.telefone) {
    container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Preencha seu telefone em "Meus dados" para ver seu historico.</p>';
    return;
  }

  container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Carregando pedidos...</p>';

  try {
    const pedidos = await buscarPedidosCliente(SLUG_ESTABELECIMENTO, CONTA_ATUAL.telefone);
    if (pedidos.length === 0) {
      container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Voce ainda nao tem pedidos nesta loja.</p>';
      return;
    }
    container.innerHTML = pedidos.map(pedido => `
      <div class="pedido-detalhe" data-pedido-id="${pedido.id}">
        <div class="pedido-detalhe__topo">
          <span class="pedido-detalhe__data">${new Date(pedido.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span class="pedido-detalhe__status">${traduzirStatusConta(pedido.status_pedido)}</span>
        </div>
        <div class="pedido-detalhe__codigo">Pedido #${pedido.id.substring(0, 8)}</div>
        <div class="pedido-detalhe__total">${formatarMoedaConta(pedido.total)}</div>
        <div class="acompanhamento-box oculto" id="acomp-conta-${pedido.id}"></div>
      </div>
    `).join('');

    // Toca no pedido -> expande/recolhe o acompanhamento ao vivo (so um
    // pedido aberto por vez, atualiza a cada 15s ate ser entregue/cancelado).
    container.querySelectorAll('.pedido-detalhe').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-pedido-id');
        const jaSelecionado = card.classList.contains('selecionado');

        container.querySelectorAll('.pedido-detalhe').forEach(c => {
          c.classList.remove('selecionado');
          c.querySelector('.acompanhamento-box').classList.add('oculto');
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
    container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Nao foi possivel carregar seus pedidos agora.</p>';
  }
}
