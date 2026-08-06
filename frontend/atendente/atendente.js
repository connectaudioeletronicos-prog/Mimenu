// ===================================================================
// App do Garcom. Fluxo de comanda: abre uma comanda por mesa/cliente,
// cada rodada de itens vai pra cozinha na hora (nao espera cobranca), e
// so fecha/cobra no final, quando o cliente pede a conta. Historico de
// comandas fechadas fica salvo no servidor (permanente).
// ===================================================================

const CHAVE_TOKEN = 'garcom_token';
const CHAVE_DADOS = 'garcom_dados';

let categorias = [];
let produtos = [];
let categoriaSelecionada = null;
let termoBusca = '';

// Comanda em atendimento agora (null = ainda nao aberta/escolhida nessa tela).
let comandaAtual = { id: null, mesaCliente: '', subtotalEnviado: 0, rodadas: [] };
// Itens dessa rodada (ainda NAO enviados pra cozinha).
let draftItens = [];

// ===================== Utilitarios =====================

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function mostrarToast(mensagem, ehErro) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.toggle('erro-toast', !!ehErro);
  toast.classList.remove('oculto');
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => toast.classList.add('oculto'), 3200);
}

function formatarHora(isoString) {
  if (!isoString) return '-';
  const data = new Date(isoString);
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Monta a "árvore": uma rodada por bloco (com horário), itens dela embaixo.
// Usada tanto no painel da comanda (itens ja enviados) quanto no modal de
// cobranca (conferencia antes de fechar).
function construirArvoreHtml(rodadas) {
  if (!Array.isArray(rodadas) || rodadas.length === 0) {
    return '<p class="ajuda" style="padding:6px 0;">Nenhum item enviado ainda.</p>';
  }
  return rodadas.map(r => `
    <div class="rodada-arvore">
      <div class="rodada-arvore__cabecalho">${formatarHora(r.criado_em)} · R$ ${formatarMoeda(r.subtotal)}</div>
      ${(Array.isArray(r.itens) ? r.itens : []).map(item => `
        <div class="rodada-arvore__item"><span>${item.quantidade}x ${escaparHtml(item.nome)}</span><span>R$ ${formatarMoeda(item.preco * item.quantidade)}</span></div>
      `).join('')}
      ${r.observacoes ? `<div class="rodada-arvore__obs">Obs: ${escaparHtml(r.observacoes)}</div>` : ''}
    </div>
  `).join('');
}

function renderizarItensEnviados() {
  const secao = document.getElementById('secao-itens-enviados');
  if (!comandaAtual.id || !comandaAtual.rodadas || comandaAtual.rodadas.length === 0) {
    secao.classList.add('oculto');
    return;
  }
  secao.classList.remove('oculto');
  document.getElementById('valor-ja-enviado').textContent = `R$ ${formatarMoeda(comandaAtual.subtotalEnviado)}`;
  document.getElementById('arvore-itens-enviados').innerHTML = construirArvoreHtml(comandaAtual.rodadas);
}

document.getElementById('botao-toggle-itens-enviados').addEventListener('click', () => {
  const arvore = document.getElementById('arvore-itens-enviados');
  const seta = document.getElementById('seta-arvore');
  const estaAberta = !arvore.classList.contains('oculto');
  arvore.classList.toggle('oculto', estaAberta);
  seta.textContent = estaAberta ? '▸' : '▾';
});

// ===================== Chamadas de API =====================

async function chamarApi(caminho, opcoes = {}) {
  const token = sessionStorage.getItem(CHAVE_TOKEN);
  const resposta = await fetch(`${API_BASE_URL}/admin${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opcoes.headers || {})
    }
  });
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 401) {
    encerrarSessao();
    throw new Error('Sessao expirada. Entre novamente.');
  }
  if (!resposta.ok) throw new Error(dados.erro || 'Erro ao comunicar com o servidor.');
  return dados;
}

async function chamarApiFuncionarios(caminho, opcoes = {}) {
  const resposta = await fetch(`${API_BASE_URL}/funcionarios${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Erro ao comunicar com o servidor.');
  return dados;
}

// ===================== Sessao / Login =====================

function iniciarSessao(token, funcionario) {
  if (funcionario.cargo !== 'garcom') {
    throw new Error('Este aplicativo e exclusivo para garcons.');
  }
  sessionStorage.setItem(CHAVE_TOKEN, token);
  sessionStorage.setItem(CHAVE_DADOS, JSON.stringify(funcionario));
}

function encerrarSessao() {
  sessionStorage.removeItem(CHAVE_TOKEN);
  sessionStorage.removeItem(CHAVE_DADOS);
  document.getElementById('tela-app').classList.add('oculto');
  document.getElementById('tela-login').classList.remove('oculto');
}

async function tentarAcessoPorLink() {
  const parametros = new URLSearchParams(window.location.search);
  const token = parametros.get('acesso');
  if (!token) return false;
  try {
    const dados = await chamarApiFuncionarios(`/acessar/${token}`);
    iniciarSessao(dados.token, dados.funcionario);
    return true;
  } catch (erro) {
    mostrarToast(erro.message, true);
    return false;
  }
}

document.getElementById('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erroEl = document.getElementById('login-erro');
  erroEl.classList.add('oculto');
  const slug = document.getElementById('login-slug').value.trim();
  const login = document.getElementById('login-usuario').value.trim();
  const senha = document.getElementById('login-senha').value;
  try {
    const dados = await chamarApiFuncionarios('/login', { method: 'POST', body: JSON.stringify({ slug, login, senha }) });
    iniciarSessao(dados.token, dados.funcionario);
    mostrarApp();
  } catch (erro) {
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
  }
});

// Olho de mostrar/ocultar senha -- comeca "fechado" (senha oculta) e vira
// "aberto" (senha visivel) quando clicado. Mesmo par de icones em qualquer
// campo marcado com data-alvo-senha, em qualquer tela do app.
const ICONE_OLHO_FECHADO = '<svg class="icone-olho" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 1 12s4 8 11 8a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
const ICONE_OLHO_ABERTO = '<svg class="icone-olho" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';

document.querySelectorAll('.botao-olho-senha').forEach(botao => {
  botao.addEventListener('click', () => {
    const campo = document.getElementById(botao.dataset.alvoSenha);
    const vaiMostrar = campo.type === 'password';
    campo.type = vaiMostrar ? 'text' : 'password';
    botao.innerHTML = vaiMostrar ? ICONE_OLHO_ABERTO : ICONE_OLHO_FECHADO;
  });
});

// Busca o logo da loja pelo slug assim que o garcom sai do campo, antes
// mesmo de logar (usa a rota publica, nao precisa de sessao). Enquanto nao
// acha nenhum, mostra so um icone generico de prato -- nunca a marca
// "Palatos" (que e a plataforma, nao o restaurante do cliente).
document.getElementById('login-slug').addEventListener('blur', async (evento) => {
  const slug = evento.target.value.trim();
  const imgLogo = document.getElementById('logo-loja-login');
  const iconeGenerico = document.getElementById('logo-login-generico');
  if (!slug) { imgLogo.classList.add('oculto'); iconeGenerico.classList.remove('oculto'); return; }
  try {
    const resposta = await fetch(`${API_BASE_URL}/publico/${slug}`);
    if (!resposta.ok) throw new Error();
    const dados = await resposta.json();
    if (dados.logo_url) {
      imgLogo.src = dados.logo_url;
      imgLogo.classList.remove('oculto');
      iconeGenerico.classList.add('oculto');
    } else {
      imgLogo.classList.add('oculto');
      iconeGenerico.classList.remove('oculto');
    }
  } catch (erro) {
    imgLogo.classList.add('oculto');
    iconeGenerico.classList.remove('oculto');
  }
});

document.getElementById('botao-sair-menu').addEventListener('click', () => {
  fecharMenuLateral();
  encerrarSessao();
});

// ===================== Tela principal =====================

async function mostrarApp() {
  const dados = JSON.parse(sessionStorage.getItem(CHAVE_DADOS));
  document.getElementById('tela-login').classList.add('oculto');
  document.getElementById('tela-app').classList.remove('oculto');
  document.getElementById('saudacao-atendente').textContent = `Olá, ${dados.nome.split(' ')[0]}!`;
  document.getElementById('menu-nome-funcionario').textContent = dados.nome;
  document.getElementById('menu-cargo-funcionario').textContent = 'Garçom';

  const logoHeader = document.getElementById('logo-loja-header');
  if (dados.estabelecimentoLogoUrl) {
    logoHeader.src = dados.estabelecimentoLogoUrl;
    logoHeader.classList.remove('oculto');
  } else {
    logoHeader.classList.add('oculto');
  }

  try {
    const [listaCategorias, listaProdutos] = await Promise.all([
      chamarApi('/categorias'),
      chamarApi('/produtos')
    ]);
    categorias = listaCategorias;
    produtos = listaProdutos;
    renderizarCategorias();
    renderizarProdutos();
    renderizarComanda();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

function renderizarCategorias() {
  const container = document.getElementById('lista-categorias');
  const chips = [{ id: null, nome: 'Todas', icone_url: null }, ...categorias];
  container.innerHTML = chips.map(cat => `
    <button type="button" class="categoria-chip ${categoriaSelecionada === cat.id ? 'categoria-chip--ativa' : ''}" data-categoria-id="${cat.id ?? ''}">
      ${cat.icone_url ? `<img src="${cat.icone_url}" style="width:24px;height:24px;border-radius:6px;object-fit:cover;">` : `<span class="categoria-chip__icone">🍽️</span>`}
      ${escaparHtml(cat.nome)}
    </button>
  `).join('');
  container.querySelectorAll('[data-categoria-id]').forEach(botao => {
    botao.addEventListener('click', () => {
      categoriaSelecionada = botao.dataset.categoriaId || null;
      renderizarCategorias();
      renderizarProdutos();
    });
  });
}

function renderizarProdutos() {
  const container = document.getElementById('grade-produtos');
  const filtrados = produtos.filter(p => {
    const bateCategoria = !categoriaSelecionada || p.categoria_id === categoriaSelecionada;
    const bateBusca = !termoBusca || p.nome.toLowerCase().includes(termoBusca.toLowerCase());
    return bateCategoria && bateBusca;
  });
  if (filtrados.length === 0) {
    container.innerHTML = '<p class="lista-vazia">Nenhum produto encontrado.</p>';
    return;
  }
  container.innerHTML = filtrados.map(p => {
    const temPromo = p.preco_promocional && parseFloat(p.preco_promocional) < parseFloat(p.preco);
    const precoExibido = temPromo ? p.preco_promocional : p.preco;
    return `
      <button type="button" class="produto-card ${!p.disponivel ? 'produto-card__indisponivel' : ''}" data-produto-id="${p.id}" ${!p.disponivel ? 'disabled' : ''}>
        <img class="produto-card__imagem" src="${p.foto_url || '../img/sem-foto.png'}" alt="">
        <div class="produto-card__corpo">
          <div class="produto-card__nome">${escaparHtml(p.nome)}</div>
          <div class="produto-card__preco">R$ ${formatarMoeda(precoExibido)}</div>
        </div>
      </button>
    `;
  }).join('');
  container.querySelectorAll('[data-produto-id]').forEach(botao => {
    botao.addEventListener('click', () => adicionarItemNaRodada(botao.dataset.produtoId));
  });
}

document.getElementById('campo-busca-produto').addEventListener('input', (evento) => {
  termoBusca = evento.target.value;
  renderizarProdutos();
});

// ===================== Rodada atual (itens ainda nao enviados) =====================

function adicionarItemNaRodada(produtoId) {
  const produto = produtos.find(p => p.id === produtoId);
  if (!produto || !produto.disponivel) return;
  const existente = draftItens.find(i => i.produto_id === produtoId);
  const temPromo = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco);
  const preco = parseFloat(temPromo ? produto.preco_promocional : produto.preco);
  if (existente) existente.quantidade += 1;
  else draftItens.push({ produto_id: produto.id, nome: produto.nome, preco, foto_url: produto.foto_url, quantidade: 1 });
  renderizarComanda();
  mostrarToast(`${produto.nome} adicionado.`);
}

function alterarQuantidade(produtoId, delta) {
  const item = draftItens.find(i => i.produto_id === produtoId);
  if (!item) return;
  item.quantidade += delta;
  if (item.quantidade <= 0) draftItens = draftItens.filter(i => i.produto_id !== produtoId);
  renderizarComanda();
}
function removerItem(produtoId) {
  draftItens = draftItens.filter(i => i.produto_id !== produtoId);
  renderizarComanda();
}
function calcularSubtotalRodada() {
  return draftItens.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
}

function renderizarComanda() {
  document.getElementById('rotulo-mesa-cliente').textContent = comandaAtual.mesaCliente || 'Mesa / Cliente';
  renderizarItensEnviados();

  const lista = document.getElementById('lista-itens-comanda');
  if (draftItens.length === 0) {
    lista.innerHTML = '<p class="comanda-vazia">Nenhum item adicionado ainda.</p>';
  } else {
    lista.innerHTML = draftItens.map(item => `
      <div class="item-comanda">
        <img class="item-comanda__imagem" src="${item.foto_url || '../img/sem-foto.png'}" alt="">
        <div class="item-comanda__info">
          <div class="item-comanda__nome">${escaparHtml(item.nome)}</div>
          <div class="item-comanda__preco">R$ ${formatarMoeda(item.preco)}</div>
        </div>
        <div class="item-comanda__qtd">
          <button type="button" data-qtd-menos="${item.produto_id}">−</button>
          <span>${item.quantidade}</span>
          <button type="button" data-qtd-mais="${item.produto_id}">+</button>
        </div>
        <button type="button" class="item-comanda__excluir" data-excluir="${item.produto_id}">🗑️</button>
      </div>
    `).join('');
    lista.querySelectorAll('[data-qtd-mais]').forEach(b => b.addEventListener('click', () => alterarQuantidade(b.dataset.qtdMais, 1)));
    lista.querySelectorAll('[data-qtd-menos]').forEach(b => b.addEventListener('click', () => alterarQuantidade(b.dataset.qtdMenos, -1)));
    lista.querySelectorAll('[data-excluir]').forEach(b => b.addEventListener('click', () => removerItem(b.dataset.excluir)));
  }

  const subtotalRodada = calcularSubtotalRodada();
  document.getElementById('comanda-subtotal').textContent = `R$ ${formatarMoeda(subtotalRodada)}`;

  const contagem = draftItens.reduce((s, i) => s + i.quantidade, 0);
  document.getElementById('flutuante-contagem').textContent = contagem;
  document.getElementById('flutuante-total').textContent = `R$ ${formatarMoeda(subtotalRodada)}`;
  const ehDesktop = window.matchMedia('(min-width: 900px)').matches;
  document.getElementById('botao-flutuante-comanda').classList.toggle('oculto', contagem === 0 || ehDesktop);
  document.getElementById('painel-comanda').classList.toggle('painel-comanda--aberto', contagem > 0 || ehDesktop);
}

document.getElementById('botao-flutuante-comanda').addEventListener('click', () => {
  document.getElementById('painel-comanda').classList.add('painel-comanda--aberto');
  document.getElementById('painel-comanda').scrollIntoView({ behavior: 'smooth' });
});

// ===================== Modal Mesa/Cliente (abrir ou escolher comanda) =====================

async function abrirModalMesa() {
  document.getElementById('input-mesa-cliente').value = '';
  document.getElementById('fundo-modal-mesa').classList.remove('oculto');
  document.getElementById('modal-mesa').classList.remove('oculto');

  const container = document.getElementById('lista-comandas-abertas-modal');
  container.innerHTML = '<p class="ajuda">Carregando...</p>';
  try {
    const abertas = await chamarApi('/comandas?status=aberta');
    if (abertas.length === 0) {
      container.innerHTML = '<p class="ajuda">Nenhuma comanda aberta no momento.</p>';
    } else {
      container.innerHTML = abertas.map(c => `
        <div class="item-comanda-modal">
          <span>${escaparHtml(c.mesa_cliente)} · aberta às ${formatarHora(c.aberta_em)} · R$ ${formatarMoeda(c.subtotal)}</span>
          <button type="button" data-selecionar-comanda="${c.id}">Abrir</button>
        </div>
      `).join('');
      container.querySelectorAll('[data-selecionar-comanda]').forEach(botao => {
        botao.addEventListener('click', () => selecionarComanda(botao.dataset.selecionarComanda, fecharModalMesa));
      });
    }
  } catch (erro) {
    container.innerHTML = `<p class="erro">${escaparHtml(erro.message)}</p>`;
  }
}

// Troca pra outra comanda (ou define uma recem-criada) buscando o detalhe
// completo dela no servidor -- assim o painel sempre mostra TODOS os itens
// ja enviados pra cozinha antes de ele adicionar mais coisa ou cobrar,
// nunca so um numero de subtotal sem explicacao.
function definirComandaAtual(comanda) {
  if (draftItens.length > 0 && !confirm('Você tem itens dessa rodada ainda não enviados pra cozinha. Descartar e trocar de comanda?')) {
    return false;
  }
  draftItens = [];
  comandaAtual = {
    id: comanda.id,
    mesaCliente: comanda.mesa_cliente,
    subtotalEnviado: parseFloat(comanda.subtotal) || 0,
    rodadas: comanda.rodadas || []
  };
  renderizarComanda();
  return true;
}

async function selecionarComanda(id, aoTerminar) {
  try {
    const comanda = await chamarApi(`/comandas/${id}`);
    if (!definirComandaAtual(comanda)) return;
    if (aoTerminar) aoTerminar();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

document.getElementById('botao-mesa-cliente').addEventListener('click', abrirModalMesa);
function fecharModalMesa() {
  document.getElementById('fundo-modal-mesa').classList.add('oculto');
  document.getElementById('modal-mesa').classList.add('oculto');
}
document.getElementById('botao-cancelar-mesa').addEventListener('click', fecharModalMesa);
document.getElementById('botao-confirmar-mesa').addEventListener('click', async () => {
  const mesaCliente = document.getElementById('input-mesa-cliente').value.trim();
  if (!mesaCliente) return mostrarToast('Informe a mesa ou o nome do cliente.', true);
  try {
    const nova = await chamarApi('/comandas', { method: 'POST', body: JSON.stringify({ mesa_cliente: mesaCliente }) });
    if (!definirComandaAtual({ ...nova, rodadas: [] })) return;
    fecharModalMesa();
    mostrarToast(`Comanda "${mesaCliente}" aberta.`);
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

// ===================== Enviar rodada pra cozinha =====================

document.getElementById('botao-enviar-cozinha').addEventListener('click', async () => {
  if (!comandaAtual.id) { mostrarToast('Identifique a mesa/cliente antes de enviar.', true); return abrirModalMesa(); }
  if (draftItens.length === 0) return mostrarToast('Adicione itens antes de enviar.', true);

  try {
    const novoPedido = await chamarApi(`/comandas/${comandaAtual.id}/itens`, {
      method: 'POST',
      body: JSON.stringify({
        itens: draftItens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
        observacoes: document.getElementById('observacao-comanda').value || null
      })
    });
    comandaAtual.subtotalEnviado += calcularSubtotalRodada();
    comandaAtual.rodadas.push(novoPedido);
    draftItens = [];
    document.getElementById('observacao-comanda').value = '';
    renderizarComanda();
    mostrarToast(`Rodada enviada pra cozinha! (Mesa: ${comandaAtual.mesaCliente})`);
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

document.getElementById('botao-limpar-comanda').addEventListener('click', () => {
  if (draftItens.length === 0) return;
  if (!confirm('Limpar os itens dessa rodada (ainda não enviados)?')) return;
  draftItens = [];
  renderizarComanda();
});

// ===================== Cobrar / Fechar comanda =====================

let formaPagamentoSelecionada = null;

document.getElementById('botao-cobrar-comanda').addEventListener('click', () => {
  if (!comandaAtual.id) { mostrarToast('Escolha uma comanda primeiro.', true); return abrirModalMesa(); }
  if (draftItens.length > 0) return mostrarToast('Envie a rodada atual pra cozinha antes de cobrar.', true);
  if (comandaAtual.subtotalEnviado <= 0) return mostrarToast('Essa comanda ainda não tem nenhum item enviado.', true);

  formaPagamentoSelecionada = null;
  document.querySelectorAll('.opcao-pagamento').forEach(b => b.classList.remove('opcao-pagamento--selecionada'));
  document.getElementById('botao-confirmar-pagamento').disabled = true;
  document.getElementById('pagamento-mesa-nome').textContent = comandaAtual.mesaCliente;
  document.getElementById('arvore-conferencia-pagamento').innerHTML = construirArvoreHtml(comandaAtual.rodadas);
  document.getElementById('input-gorjeta').value = '0';
  atualizarTotalPagamento();
  aplicarBloqueioFormasPagamento();
  document.getElementById('fundo-modal-pagamento').classList.remove('oculto');
  document.getElementById('modal-pagamento').classList.remove('oculto');
});

function atualizarTotalPagamento() {
  const gorjeta = parseFloat(document.getElementById('input-gorjeta').value) || 0;
  const total = comandaAtual.subtotalEnviado + gorjeta;
  document.getElementById('pagamento-total').textContent = `R$ ${formatarMoeda(total)}`;
}
document.getElementById('input-gorjeta').addEventListener('input', atualizarTotalPagamento);

// Enquanto a loja nao configurar a chave de pagamento (Configuracoes >
// Pagamento), so "Dinheiro" fica clicavel -- Pix/Credito/Debito ficam
// visivelmente desabilitados, com aviso do motivo. O servidor tambem
// bloqueia isso por conta propria (essa checagem aqui e so pra nao deixar
// o garcom perder tempo escolhendo algo que vai ser recusado).
function aplicarBloqueioFormasPagamento() {
  const dados = JSON.parse(sessionStorage.getItem(CHAVE_DADOS) || '{}');
  const configurado = !!dados.pagamentoConfigurado;
  document.querySelectorAll('.opcao-pagamento').forEach(botao => {
    const bloqueado = !configurado && botao.dataset.forma !== 'dinheiro';
    botao.disabled = bloqueado;
    botao.classList.toggle('opcao-pagamento--bloqueada', bloqueado);
  });
  document.getElementById('aviso-pagamento-nao-configurado').classList.toggle('oculto', configurado);
}

function fecharModalPagamento() {
  document.getElementById('fundo-modal-pagamento').classList.add('oculto');
  document.getElementById('modal-pagamento').classList.add('oculto');
}
document.getElementById('botao-cancelar-pagamento').addEventListener('click', fecharModalPagamento);
document.querySelectorAll('.opcao-pagamento').forEach(botao => {
  botao.addEventListener('click', () => {
    formaPagamentoSelecionada = botao.dataset.forma;
    document.querySelectorAll('.opcao-pagamento').forEach(b => b.classList.remove('opcao-pagamento--selecionada'));
    botao.classList.add('opcao-pagamento--selecionada');
    document.getElementById('botao-confirmar-pagamento').disabled = false;
  });
});

document.getElementById('botao-confirmar-pagamento').addEventListener('click', async () => {
  if (!formaPagamentoSelecionada) return;
  const gorjeta = parseFloat(document.getElementById('input-gorjeta').value) || 0;
  const mesaCliente = comandaAtual.mesaCliente;
  const comandaId = comandaAtual.id;

  try {
    const resposta = await chamarApi(`/comandas/${comandaId}/fechar`, {
      method: 'POST',
      body: JSON.stringify({ forma_pagamento: formaPagamentoSelecionada, gorjeta })
    });
    fecharModalPagamento();

    if (resposta.pagamento) {
      abrirModalPix(comandaId, resposta.pagamento, mesaCliente);
    } else {
      mostrarToast(`Comanda "${mesaCliente}" fechada e paga!`);
      comandaAtual = { id: null, mesaCliente: '', subtotalEnviado: 0, rodadas: [] };
      renderizarComanda();
    }
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

// ===================== Modal Pix (QR + acompanhamento) =====================

let intervaloChecagemPix = null;

function abrirModalPix(comandaId, pagamento, mesaCliente) {
  document.getElementById('pix-qr-imagem').src = `data:image/png;base64,${pagamento.qr_code_base64}`;
  document.getElementById('pix-copia-cola').value = pagamento.qr_code || '';
  const statusEl = document.getElementById('pix-status');
  statusEl.textContent = 'Aguardando confirmação do pagamento...';
  statusEl.className = 'pix-status';
  document.getElementById('fundo-modal-pix').classList.remove('oculto');
  document.getElementById('modal-pix').classList.remove('oculto');

  clearInterval(intervaloChecagemPix);
  intervaloChecagemPix = setInterval(async () => {
    try {
      const comanda = await chamarApi(`/comandas/${comandaId}`);
      if (comanda.status === 'fechada' && comanda.status_pagamento === 'pago') {
        clearInterval(intervaloChecagemPix);
        statusEl.textContent = '✅ Pagamento confirmado!';
        statusEl.className = 'pix-status pix-status--pago';
        comandaAtual = { id: null, mesaCliente: '', subtotalEnviado: 0, rodadas: [] };
        renderizarComanda();
        setTimeout(fecharModalPix, 1800);
      } else if (comanda.status_pagamento === 'recusado') {
        clearInterval(intervaloChecagemPix);
        statusEl.textContent = '❌ Pagamento recusado. Tente outra forma de pagamento.';
        statusEl.className = 'pix-status pix-status--recusado';
      }
    } catch (erro) { /* tenta de novo no proximo ciclo */ }
  }, 4000);

  window._comandaPixEmAndamento = comandaId;
}
function fecharModalPix() {
  clearInterval(intervaloChecagemPix);
  document.getElementById('fundo-modal-pix').classList.add('oculto');
  document.getElementById('modal-pix').classList.add('oculto');
}
document.getElementById('botao-cancelar-pix').addEventListener('click', fecharModalPix);
document.getElementById('botao-copiar-pix').addEventListener('click', () => {
  const campo = document.getElementById('pix-copia-cola');
  campo.select();
  navigator.clipboard?.writeText(campo.value).catch(() => {});
  mostrarToast('Código copiado.');
});
document.getElementById('botao-confirmar-pix-manual').addEventListener('click', () => {
  fecharModalPix();
  abrirModalSupervisor();
});

// ===================== Problema no pagamento (senha supervisor) =====================

function abrirModalSupervisor() {
  document.getElementById('supervisor-login').value = '';
  document.getElementById('supervisor-senha').value = '';
  document.getElementById('supervisor-erro').classList.add('oculto');
  document.getElementById('fundo-modal-supervisor').classList.remove('oculto');
  document.getElementById('modal-supervisor').classList.remove('oculto');
}
function fecharModalSupervisor() {
  document.getElementById('fundo-modal-supervisor').classList.add('oculto');
  document.getElementById('modal-supervisor').classList.add('oculto');
}
document.getElementById('botao-cancelar-supervisor').addEventListener('click', fecharModalSupervisor);
document.getElementById('botao-confirmar-supervisor').addEventListener('click', async () => {
  const login = document.getElementById('supervisor-login').value.trim();
  const senha = document.getElementById('supervisor-senha').value;
  const erroEl = document.getElementById('supervisor-erro');
  erroEl.classList.add('oculto');
  if (!login || !senha) { erroEl.textContent = 'Informe login e senha.'; erroEl.classList.remove('oculto'); return; }

  const comandaId = window._comandaPixEmAndamento;
  if (!comandaId) { erroEl.textContent = 'Nenhuma comanda pendente encontrada.'; erroEl.classList.remove('oculto'); return; }

  try {
    await chamarApi(`/comandas/${comandaId}/confirmar-manual`, { method: 'POST', body: JSON.stringify({ login, senha }) });
    fecharModalSupervisor();
    mostrarToast('Comanda confirmada como paga manualmente.');
    if (comandaAtual.id === comandaId) comandaAtual = { id: null, mesaCliente: '', subtotalEnviado: 0, rodadas: [] };
    renderizarComanda();
  } catch (erro) {
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
  }
});

// ===================== Menu lateral (drawer) =====================

function abrirMenuLateral() {
  document.body.classList.add('menu-lateral--aberto');
  renderizarMenuLateral('comandas');
}
function fecharMenuLateral() { document.body.classList.remove('menu-lateral--aberto'); }
document.getElementById('botao-abrir-menu').addEventListener('click', abrirMenuLateral);
document.getElementById('botao-fechar-menu').addEventListener('click', fecharMenuLateral);
document.querySelectorAll('.menu-lateral__item').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.menu-lateral__item').forEach(b => b.classList.remove('menu-lateral__item--ativo'));
    botao.classList.add('menu-lateral__item--ativo');
    renderizarMenuLateral(botao.dataset.menuSecao);
  });
});

async function renderizarMenuLateral(secao) {
  const container = document.getElementById('menu-lateral-conteudo');
  container.innerHTML = '<p class="ajuda">Carregando...</p>';

  if (secao === 'comandas') {
    try {
      const abertas = await chamarApi('/comandas?status=aberta');
      if (abertas.length === 0) {
        container.innerHTML = '<p class="ajuda" style="padding:12px 0;">Nenhuma comanda aberta no momento.</p>';
      } else {
        container.innerHTML = abertas.map(c => `
          <div class="item-venda-resumo">
            <span>${escaparHtml(c.mesa_cliente)} · aberta às ${formatarHora(c.aberta_em)} · R$ ${formatarMoeda(c.subtotal)}</span>
            <button type="button" class="botao-mesa-cliente" data-abrir-comanda="${c.id}">Abrir</button>
          </div>
        `).join('');
        container.querySelectorAll('[data-abrir-comanda]').forEach(botao => {
          botao.addEventListener('click', () => selecionarComanda(botao.dataset.abrirComanda, fecharMenuLateral));
        });
      }
    } catch (erro) {
      container.innerHTML = `<p class="erro">${escaparHtml(erro.message)}</p>`;
    }
  }

  if (secao === 'historico') {
    try {
      const fechadas = await chamarApi('/comandas?status=fechada&limite=50');
      if (fechadas.length === 0) {
        container.innerHTML = '<p class="ajuda" style="padding:12px 0;">Nenhuma comanda fechada ainda.</p>';
      } else {
        container.innerHTML = fechadas.map(c => `
          <div class="item-venda-resumo">
            <span>${escaparHtml(c.mesa_cliente)} · fechada às ${formatarHora(c.fechada_em)}</span>
            <button type="button" class="botao-mesa-cliente" data-ver-historico="${c.id}">R$ ${formatarMoeda(c.total)}</button>
          </div>
        `).join('');
        container.querySelectorAll('[data-ver-historico]').forEach(botao => {
          botao.addEventListener('click', () => abrirDetalheHistorico(botao.dataset.verHistorico));
        });
      }
    } catch (erro) {
      container.innerHTML = `<p class="erro">${escaparHtml(erro.message)}</p>`;
    }
  }
}

// ===================== Detalhe do histórico =====================

async function abrirDetalheHistorico(comandaId) {
  const conteudo = document.getElementById('historico-conteudo');
  document.getElementById('historico-titulo').textContent = 'Carregando...';
  conteudo.innerHTML = '';
  document.getElementById('fundo-modal-historico').classList.remove('oculto');
  document.getElementById('modal-historico').classList.remove('oculto');

  try {
    const comanda = await chamarApi(`/comandas/${comandaId}`);
    document.getElementById('historico-titulo').textContent = comanda.mesa_cliente;

    const formasLegenda = { dinheiro: 'Dinheiro', pix: 'PIX', cartao_credito: 'Cartão Crédito', cartao_debito: 'Cartão Débito' };
    conteudo.innerHTML = `
      <div class="historico-linha"><span>Aberta em</span><span>${formatarHora(comanda.aberta_em)}</span></div>
      <div class="historico-linha"><span>Fechada em</span><span>${formatarHora(comanda.fechada_em)}</span></div>
      <div class="historico-linha"><span>Forma de pagamento</span><span>${formasLegenda[comanda.forma_pagamento] || comanda.forma_pagamento || '-'}</span></div>
      <div class="historico-linha"><span>Subtotal (pedidos)</span><span>R$ ${formatarMoeda(comanda.subtotal)}</span></div>
      <div class="historico-linha"><span>Gorjeta / Caixinha</span><span>R$ ${formatarMoeda(comanda.gorjeta)}</span></div>
      <div class="historico-linha"><strong>Total</strong><strong>R$ ${formatarMoeda(comanda.total)}</strong></div>
      <div class="titulo-secao" style="margin-top:14px;">Itens pedidos</div>
      ${(comanda.rodadas || []).map(rodada => `
        <div class="historico-rodada">
          <div class="historico-rodada__hora">${formatarHora(rodada.criado_em)}</div>
          ${(Array.isArray(rodada.itens) ? rodada.itens : []).map(item => `
            <div class="historico-linha" style="border:none;padding:2px 0;">
              <span>${item.quantidade}x ${escaparHtml(item.nome)}</span>
              <span>R$ ${formatarMoeda(item.preco * item.quantidade)}</span>
            </div>
          `).join('')}
          ${rodada.observacoes ? `<div class="ajuda" style="margin-top:4px;">Obs: ${escaparHtml(rodada.observacoes)}</div>` : ''}
        </div>
      `).join('')}
    `;
  } catch (erro) {
    conteudo.innerHTML = `<p class="erro">${escaparHtml(erro.message)}</p>`;
  }
}
document.getElementById('botao-fechar-historico').addEventListener('click', () => {
  document.getElementById('fundo-modal-historico').classList.add('oculto');
  document.getElementById('modal-historico').classList.add('oculto');
});

// ===================== Inicializacao =====================

(async function iniciar() {
  const acessouPorLink = await tentarAcessoPorLink();
  const tokenSalvo = sessionStorage.getItem(CHAVE_TOKEN);
  if (acessouPorLink || tokenSalvo) {
    try { await mostrarApp(); } catch (erro) { mostrarToast(erro.message, true); }
  }
})();
