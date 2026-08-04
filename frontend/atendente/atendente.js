// ===================================================================
// App do Garçom (pasta/arquivos continuam "atendente" por baixo dos panos).
// Exclusivo para funcionarios com cargo === 'garcom'. Nao mistura com
// caixa/colaborador. Pedidos vao para canal_venda = 'mesa', separado do
// Atendimento balcao do dashboard (canal_venda = 'balcao'), mas ambos
// aparecem no mesmo Caixa/relatorios.
// ===================================================================

const CHAVE_TOKEN = 'garcom_token';
const CHAVE_DADOS = 'garcom_dados';
const CHAVE_COMANDAS = 'garcom_comandas';
const CHAVE_VENDAS_HOJE = 'garcom_vendas_hoje';

let categorias = [];
let produtos = [];
let categoriaSelecionada = null;
let termoBusca = '';

// Comanda atual em edicao. Cada comanda salva localmente tem um id proprio,
// pra o garcom poder atender varias mesas ao mesmo tempo.
let comandaAtual = criarComandaVazia();
let idComandaEmEdicao = null; // se veio de "Salvar comanda" e foi reaberta

function criarComandaVazia() {
  return { id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), mesaCliente: '', itens: [], observacao: '' };
}

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

function obterComandasSalvas() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_COMANDAS)) || []; } catch (e) { return []; }
}
function salvarComandasNoStorage(lista) {
  sessionStorage.setItem(CHAVE_COMANDAS, JSON.stringify(lista));
}
function obterVendasHoje() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_VENDAS_HOJE)) || []; } catch (e) { return []; }
}
function registrarVendaHoje(pedido) {
  const lista = obterVendasHoje();
  lista.unshift({ id: pedido.id, cliente_nome: pedido.cliente_nome, total: parseFloat(pedido.total), forma_pagamento: pedido.forma_pagamento, criado_em: pedido.criado_em });
  sessionStorage.setItem(CHAVE_VENDAS_HOJE, JSON.stringify(lista));
}

// ===================== Chamadas de API =====================
// Reaproveita as mesmas rotas do painel admin (/api/admin/*) -- o token do
// garcom e um JWT normal de funcionario, entao funciona nelas do mesmo jeito.

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
  sessionStorage.removeItem(CHAVE_COMANDAS);
  sessionStorage.removeItem(CHAVE_VENDAS_HOJE);
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

  try {
    const [listaCategorias, listaProdutos] = await Promise.all([
      chamarApi('/categorias'),
      chamarApi('/produtos')
    ]);
    categorias = listaCategorias;
    produtos = listaProdutos;
    renderizarCategorias();
    renderizarProdutos();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

function renderizarCategorias() {
  const container = document.getElementById('lista-categorias');
  const chips = [{ id: null, nome: 'Todas', icone_url: null }, ...categorias];
  container.innerHTML = chips.map(cat => `
    <button type="button" class="categoria-chip ${categoriaSelecionada === cat.id ? 'categoria-chip--ativa' : ''}" data-categoria-id="${cat.id ?? ''}">
      ${cat.icone_url ? `<img src="${cat.icone_url}" class="categoria-chip__icone" style="width:24px;height:24px;border-radius:6px;object-fit:cover;">` : `<span class="categoria-chip__icone">🍽️</span>`}
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
    botao.addEventListener('click', () => adicionarItemNaComanda(botao.dataset.produtoId));
  });
}

document.getElementById('campo-busca-produto').addEventListener('input', (evento) => {
  termoBusca = evento.target.value;
  renderizarProdutos();
});

// ===================== Comanda (carrinho) =====================

function adicionarItemNaComanda(produtoId) {
  const produto = produtos.find(p => p.id === produtoId);
  if (!produto || !produto.disponivel) return;

  const existente = comandaAtual.itens.find(i => i.produto_id === produtoId);
  const temPromo = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco);
  const preco = parseFloat(temPromo ? produto.preco_promocional : produto.preco);

  if (existente) {
    existente.quantidade += 1;
  } else {
    comandaAtual.itens.push({ produto_id: produto.id, nome: produto.nome, preco, foto_url: produto.foto_url, quantidade: 1 });
  }
  renderizarComanda();
  mostrarToast(`${produto.nome} adicionado.`);
}

function alterarQuantidade(produtoId, delta) {
  const item = comandaAtual.itens.find(i => i.produto_id === produtoId);
  if (!item) return;
  item.quantidade += delta;
  if (item.quantidade <= 0) {
    comandaAtual.itens = comandaAtual.itens.filter(i => i.produto_id !== produtoId);
  }
  renderizarComanda();
}

function removerItem(produtoId) {
  comandaAtual.itens = comandaAtual.itens.filter(i => i.produto_id !== produtoId);
  renderizarComanda();
}

function calcularTotalComanda() {
  return comandaAtual.itens.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
}

function renderizarComanda() {
  const lista = document.getElementById('lista-itens-comanda');
  const rotuloMesa = document.getElementById('rotulo-mesa-cliente');
  rotuloMesa.textContent = comandaAtual.mesaCliente || 'Mesa / Cliente';

  if (comandaAtual.itens.length === 0) {
    lista.innerHTML = '<p class="comanda-vazia">Nenhum item adicionado ainda.</p>';
  } else {
    lista.innerHTML = comandaAtual.itens.map(item => `
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

  const total = calcularTotalComanda();
  document.getElementById('comanda-subtotal').textContent = `R$ ${formatarMoeda(total)}`;
  document.getElementById('comanda-total').textContent = `R$ ${formatarMoeda(total)}`;

  const contagem = comandaAtual.itens.reduce((s, i) => s + i.quantidade, 0);
  document.getElementById('flutuante-contagem').textContent = contagem;
  document.getElementById('flutuante-total').textContent = `R$ ${formatarMoeda(total)}`;
  document.getElementById('botao-flutuante-comanda').classList.toggle('oculto', contagem === 0 || window.matchMedia('(min-width: 900px)').matches);
  document.getElementById('painel-comanda').classList.toggle('painel-comanda--aberto', contagem > 0 || window.matchMedia('(min-width: 900px)').matches);
}

document.getElementById('botao-flutuante-comanda').addEventListener('click', () => {
  document.getElementById('painel-comanda').classList.add('painel-comanda--aberto');
  document.getElementById('painel-comanda').scrollIntoView({ behavior: 'smooth' });
});

// ---------- Modal Mesa/Cliente ----------
function abrirModalMesa() {
  document.getElementById('input-mesa-cliente').value = comandaAtual.mesaCliente;
  document.getElementById('fundo-modal-mesa').classList.remove('oculto');
  document.getElementById('modal-mesa').classList.remove('oculto');
}
function fecharModalMesa() {
  document.getElementById('fundo-modal-mesa').classList.add('oculto');
  document.getElementById('modal-mesa').classList.add('oculto');
}
document.getElementById('botao-mesa-cliente').addEventListener('click', abrirModalMesa);
document.getElementById('botao-cancelar-mesa').addEventListener('click', fecharModalMesa);
document.getElementById('botao-confirmar-mesa').addEventListener('click', () => {
  comandaAtual.mesaCliente = document.getElementById('input-mesa-cliente').value.trim();
  fecharModalMesa();
  renderizarComanda();
});

// ---------- Salvar / Limpar comanda ----------
document.getElementById('botao-salvar-comanda').addEventListener('click', () => {
  if (comandaAtual.itens.length === 0) return mostrarToast('Adicione itens antes de salvar.', true);
  if (!comandaAtual.mesaCliente) return abrirModalMesaEDepoisSalvar();

  comandaAtual.observacao = document.getElementById('observacao-comanda').value;
  const lista = obterComandasSalvas();
  const indiceExistente = lista.findIndex(c => c.id === comandaAtual.id);
  if (indiceExistente >= 0) lista[indiceExistente] = comandaAtual; else lista.push(comandaAtual);
  salvarComandasNoStorage(lista);

  mostrarToast(`Comanda "${comandaAtual.mesaCliente}" salva. Você pode atender outra mesa agora.`);
  comandaAtual = criarComandaVazia();
  document.getElementById('observacao-comanda').value = '';
  renderizarComanda();
});

function abrirModalMesaEDepoisSalvar() {
  mostrarToast('Identifique a mesa/cliente antes de salvar.', true);
  abrirModalMesa();
}

document.getElementById('botao-limpar-comanda').addEventListener('click', () => {
  if (comandaAtual.itens.length === 0) return;
  if (!confirm('Limpar todos os itens desse pedido?')) return;
  comandaAtual = criarComandaVazia();
  document.getElementById('observacao-comanda').value = '';
  renderizarComanda();
});

// ===================== Pagamento / Finalizar =====================

let formaPagamentoSelecionada = null;

function abrirModalPagamento() {
  if (comandaAtual.itens.length === 0) return mostrarToast('Adicione itens antes de finalizar.', true);
  formaPagamentoSelecionada = null;
  document.querySelectorAll('.opcao-pagamento').forEach(b => b.classList.remove('opcao-pagamento--selecionada'));
  document.getElementById('aviso-pix').classList.add('oculto');
  document.getElementById('botao-confirmar-pagamento').disabled = true;
  document.getElementById('pagamento-total').textContent = `R$ ${formatarMoeda(calcularTotalComanda())}`;
  document.getElementById('fundo-modal-pagamento').classList.remove('oculto');
  document.getElementById('modal-pagamento').classList.remove('oculto');
}
function fecharModalPagamento() {
  document.getElementById('fundo-modal-pagamento').classList.add('oculto');
  document.getElementById('modal-pagamento').classList.add('oculto');
}
document.getElementById('botao-finalizar-pedido').addEventListener('click', abrirModalPagamento);
document.getElementById('botao-cancelar-pagamento').addEventListener('click', fecharModalPagamento);

document.querySelectorAll('.opcao-pagamento').forEach(botao => {
  botao.addEventListener('click', () => {
    formaPagamentoSelecionada = botao.dataset.forma;
    document.querySelectorAll('.opcao-pagamento').forEach(b => b.classList.remove('opcao-pagamento--selecionada'));
    botao.classList.add('opcao-pagamento--selecionada');
    document.getElementById('aviso-pix').classList.toggle('oculto', formaPagamentoSelecionada !== 'pix');
    document.getElementById('botao-confirmar-pagamento').disabled = false;
  });
});

document.getElementById('botao-confirmar-pagamento').addEventListener('click', async () => {
  if (!formaPagamentoSelecionada) return;
  const nomeMesa = comandaAtual.mesaCliente || 'Mesa sem identificação';
  const corpo = {
    cliente_nome: nomeMesa,
    itens: comandaAtual.itens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
    forma_pagamento: formaPagamentoSelecionada,
    observacoes: document.getElementById('observacao-comanda').value || null,
    canal_venda: 'mesa'
  };

  try {
    const pedido = await chamarApi('/pedidos', { method: 'POST', body: JSON.stringify(corpo) });
    registrarVendaHoje(pedido);

    // Se essa comanda tinha sido salva antes, remove da lista de abertas.
    const lista = obterComandasSalvas().filter(c => c.id !== comandaAtual.id);
    salvarComandasNoStorage(lista);

    fecharModalPagamento();
    mostrarToast(`Pedido de "${nomeMesa}" enviado para a cozinha!`);
    comandaAtual = criarComandaVazia();
    document.getElementById('observacao-comanda').value = '';
    renderizarComanda();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

// ===================== Problema no pagamento (senha supervisor) =====================
// (acessivel pelo menu lateral, dentro de "Comandas abertas")

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

// A chamada de verificacao de senha usa o token do proprio garcom (rota
// fica sob /funcionarios, nao /admin), entao usa fetch direto aqui.
async function verificarSenhaSupervisorReal(login, senha) {
  const token = sessionStorage.getItem(CHAVE_TOKEN);
  const resposta = await fetch(`${API_BASE_URL}/funcionarios/verificar-senha-supervisor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ login, senha })
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel verificar a senha.');
  return dados;
}

document.getElementById('botao-confirmar-supervisor').addEventListener('click', async () => {
  const login = document.getElementById('supervisor-login').value.trim();
  const senha = document.getElementById('supervisor-senha').value;
  const erroEl = document.getElementById('supervisor-erro');
  erroEl.classList.add('oculto');
  if (!login || !senha) {
    erroEl.textContent = 'Informe login e senha.';
    erroEl.classList.remove('oculto');
    return;
  }
  try {
    const resultado = await verificarSenhaSupervisorReal(login, senha);
    fecharModalSupervisor();
    mostrarToast(`Liberado por ${resultado.nome} (${resultado.cargo}).`);
    return resultado;
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
function fecharMenuLateral() {
  document.body.classList.remove('menu-lateral--aberto');
}
document.getElementById('botao-abrir-menu').addEventListener('click', abrirMenuLateral);
document.getElementById('botao-fechar-menu').addEventListener('click', fecharMenuLateral);

document.querySelectorAll('.menu-lateral__item').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.menu-lateral__item').forEach(b => b.classList.remove('menu-lateral__item--ativo'));
    botao.classList.add('menu-lateral__item--ativo');
    renderizarMenuLateral(botao.dataset.menuSecao);
  });
});

function renderizarMenuLateral(secao) {
  const container = document.getElementById('menu-lateral-conteudo');

  if (secao === 'comandas') {
    const comandas = obterComandasSalvas();
    if (comandas.length === 0) {
      container.innerHTML = `
        <p class="ajuda" style="padding:12px 0;">Nenhuma comanda salva no momento.</p>
        <button type="button" class="botao botao-secundario" id="botao-problema-pagamento">⚠️ Problema no pagamento</button>
      `;
    } else {
      container.innerHTML = comandas.map(c => `
        <div class="item-venda-resumo">
          <span>${escaparHtml(c.mesaCliente || 'Sem identificação')} · ${c.itens.reduce((s, i) => s + i.quantidade, 0)} itens</span>
          <button type="button" class="botao-mesa-cliente" data-reabrir-comanda="${c.id}">Abrir</button>
        </div>
      `).join('') + `<button type="button" class="botao botao-secundario" id="botao-problema-pagamento" style="margin-top:12px;">⚠️ Problema no pagamento</button>`;

      container.querySelectorAll('[data-reabrir-comanda]').forEach(botao => {
        botao.addEventListener('click', () => {
          const alvo = comandas.find(c => c.id === botao.dataset.reabrirComanda);
          if (!alvo) return;
          comandaAtual = alvo;
          document.getElementById('observacao-comanda').value = alvo.observacao || '';
          renderizarComanda();
          fecharMenuLateral();
        });
      });
    }
    document.getElementById('botao-problema-pagamento')?.addEventListener('click', abrirModalSupervisor);
  }

  if (secao === 'vendas') {
    const vendas = obterVendasHoje();
    if (vendas.length === 0) {
      container.innerHTML = '<p class="ajuda" style="padding:12px 0;">Nenhuma venda finalizada ainda hoje.</p>';
      return;
    }
    const totalDia = vendas.reduce((s, v) => s + v.total, 0);
    container.innerHTML = `
      <div class="item-venda-resumo"><span><strong>Total de hoje</strong></span><strong>R$ ${formatarMoeda(totalDia)}</strong></div>
    ` + vendas.map(v => `
      <div class="item-venda-resumo">
        <span>${escaparHtml(v.cliente_nome)}</span>
        <strong>R$ ${formatarMoeda(v.total)}</strong>
      </div>
    `).join('');
  }
}

// ===================== Inicializacao =====================

(async function iniciar() {
  const acessouPorLink = await tentarAcessoPorLink();
  const tokenSalvo = sessionStorage.getItem(CHAVE_TOKEN);
  if (acessouPorLink || tokenSalvo) {
    try {
      await mostrarApp();
      renderizarComanda();
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  }
})();
