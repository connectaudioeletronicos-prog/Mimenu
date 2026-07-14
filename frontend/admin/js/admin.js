let ESTADO = {
  estabelecimento: null,
  categorias: [],
  produtos: [],
  promocoes: [],
  arquivosPendentes: { logo: null, banner: null }
};

const DIAS_SEMANA_ADMIN = [
  { chave: 'dom', nome: 'Domingo' }, { chave: 'seg', nome: 'Segunda' },
  { chave: 'ter', nome: 'Terca' }, { chave: 'qua', nome: 'Quarta' },
  { chave: 'qui', nome: 'Quinta' }, { chave: 'sex', nome: 'Sexta' },
  { chave: 'sab', nome: 'Sabado' }
];

document.addEventListener('DOMContentLoaded', iniciarAdmin);

function iniciarAdmin() {
  configurarLogin();
  configurarMenu();
  if (obterToken()) mostrarPainel();
}

function configurarLogin() {
  document.getElementById('form-login').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const erroEl = document.getElementById('login-erro');
    erroEl.classList.add('oculto');
    try {
      const email = document.getElementById('login-email').value.trim();
      const senha = document.getElementById('login-senha').value;
      const resultado = await apiLogin(email, senha);
      salvarSessao(resultado.token, resultado.estabelecimento);
      mostrarPainel();
    } catch (erro) {
      erroEl.textContent = erro.message;
      erroEl.classList.remove('oculto');
    }
  });

  document.getElementById('botao-sair').addEventListener('click', () => {
    limparSessao();
    window.location.reload();
  });
}

async function mostrarPainel() {
  document.getElementById('tela-login').classList.add('oculto');
  document.getElementById('painel').classList.remove('oculto');
  try {
    await carregarTudo();
    preencherFormularios();
    document.getElementById('menu-nome-estabelecimento').textContent = ESTADO.estabelecimento.nome;
    document.getElementById('menu-link-publico').textContent = `/${ESTADO.estabelecimento.slug}`;
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

async function carregarTudo() {
  const [estabelecimento, categorias, produtos, promocoes] = await Promise.all([
    apiBuscarEstabelecimento(),
    apiListarCategorias(),
    apiListarProdutos(),
    apiListarPromocoes()
  ]);
  ESTADO.estabelecimento = estabelecimento;
  ESTADO.categorias = categorias;
  ESTADO.produtos = produtos;
  ESTADO.promocoes = promocoes;
}

function configurarMenu() {
  document.querySelectorAll('.painel__menu-item[data-aba]').forEach(botao => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
      document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
      botao.classList.add('ativo');
      const aba = botao.getAttribute('data-aba');
      document.getElementById(`aba-${aba}`).classList.remove('oculto');
      if (aba === 'pedidos') carregarPedidos();
    });
  });
}

function mostrarToast(mensagem, erro = false) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.className = `toast ${erro ? 'toast--erro' : ''}`;
  toast.classList.remove('oculto');
  setTimeout(() => toast.classList.add('oculto'), 3500);
}

function preencherFormularios() {
  const e = ESTADO.estabelecimento;
  document.getElementById('preview-logo').src = e.logo_url || '';
  document.getElementById('preview-banner').src = e.banner_url || '';
  document.getElementById('campo-cor-principal').value = e.cor_principal || '#E63946';
  document.getElementById('campo-cor-secundaria').value = e.cor_secundaria || '#1D3557';
  document.getElementById('campo-cor-botoes').value = e.cor_botoes || '#2A9D8F';
  document.getElementById('campo-fonte').value = e.fonte || 'Poppins';
  selecionarTemaVisual(e.tema || 'classico');
  document.getElementById('campo-nome').value = e.nome || '';
  document.getElementById('campo-apresentacao').value = e.texto_apresentacao || '';
  document.getElementById('campo-whatsapp').value = e.whatsapp || '';
  document.getElementById('campo-telefone').value = e.telefone || '';
  document.getElementById('campo-endereco').value = e.endereco || '';
  document.getElementById('campo-instagram').value = e.instagram || '';
  document.getElementById('campo-facebook').value = e.facebook || '';
  document.getElementById('campo-linkedin').value = e.linkedin || '';
  document.getElementById('campo-email-contato').value = e.email_contato || '';
  montarCamposHorario(e.horario_funcionamento || {});
  document.getElementById('campo-mp-public').value = e.mp_public_key || '';
  document.getElementById('campo-termos-uso').value = e.termos_uso || '';
  document.getElementById('campo-cookies').value = e.cookies || '';
  document.getElementById('campo-politica-privacidade').value = e.politica_privacidade || '';

  renderizarCategoriasAdmin();
  renderizarProdutosAdmin();
  renderizarPromocoesAdmin();
  preencherSelectCategorias();
  preencherSelectProdutosPromocao();

  configurarEventosAparencia();
  configurarEventosInformacoes();
  configurarEventosPagamento();
  configurarEventosPaginasLegais();
  configurarEventosCategorias();
  configurarEventosProdutos();
  configurarEventosPromocoes();
  configurarEventosPedidos();
}

function selecionarTemaVisual(tema) {
  document.querySelectorAll('.tema-opcao').forEach(b => {
    b.classList.toggle('selecionado', b.getAttribute('data-tema') === tema);
  });
}

let EVENTOS_APARENCIA_CONFIGURADOS = false;
function configurarEventosAparencia() {
  if (EVENTOS_APARENCIA_CONFIGURADOS) return;
  EVENTOS_APARENCIA_CONFIGURADOS = true;

  document.getElementById('input-logo').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    ESTADO.arquivosPendentes.logo = arquivo;
    document.getElementById('preview-logo').src = URL.createObjectURL(arquivo);
  });

  document.getElementById('input-banner').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    ESTADO.arquivosPendentes.banner = arquivo;
    document.getElementById('preview-banner').src = URL.createObjectURL(arquivo);
  });

  document.querySelectorAll('.tema-opcao').forEach(botao => {
    botao.addEventListener('click', () => selecionarTemaVisual(botao.getAttribute('data-tema')));
  });

  document.getElementById('botao-salvar-aparencia').addEventListener('click', salvarAparencia);
}

async function salvarAparencia() {
  const botao = document.getElementById('botao-salvar-aparencia');
  botao.disabled = true;
  botao.textContent = 'Salvando...';
  try {
    if (ESTADO.arquivosPendentes.logo) {
      const formData = new FormData();
      formData.append('imagem', ESTADO.arquivosPendentes.logo);
      await apiUploadLogo(formData);
      ESTADO.arquivosPendentes.logo = null;
    }
    if (ESTADO.arquivosPendentes.banner) {
      const formData = new FormData();
      formData.append('imagem', ESTADO.arquivosPendentes.banner);
      await apiUploadBanner(formData);
      ESTADO.arquivosPendentes.banner = null;
    }
    const temaSelecionado = document.querySelector('.tema-opcao.selecionado')?.getAttribute('data-tema') || 'classico';
    await apiAtualizarEstabelecimento({
      cor_principal: document.getElementById('campo-cor-principal').value,
      cor_secundaria: document.getElementById('campo-cor-secundaria').value,
      cor_botoes: document.getElementById('campo-cor-botoes').value,
      fonte: document.getElementById('campo-fonte').value,
      tema: temaSelecionado
    });
    await carregarTudo();
    mostrarToast('Aparencia atualizada com sucesso!');
  } catch (erro) {
    mostrarToast(erro.message, true);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar aparencia';
  }
}

function montarCamposHorario(horarios) {
  const container = document.getElementById('horarios-semana');
  container.innerHTML = DIAS_SEMANA_ADMIN.map(dia => {
    const valor = horarios[dia.chave];
    const fechado = !valor || valor.toLowerCase() === 'fechado';
    const [abertura, fechamento] = (!fechado ? valor.split('-') : ['18:00', '23:00']);
    return `
      <div class="horario-dia" data-dia="${dia.chave}">
        <span class="horario-dia__nome">${dia.nome}</span>
        <input type="time" class="horario-abertura" value="${abertura}" ${fechado ? 'disabled' : ''}>
        <span>ate</span>
        <input type="time" class="horario-fechamento" value="${fechamento}" ${fechado ? 'disabled' : ''}>
        <label><input type="checkbox" class="horario-fechado" ${fechado ? 'checked' : ''}> Fechado</label>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.horario-fechado').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const linha = e.target.closest('.horario-dia');
      linha.querySelectorAll('input[type="time"]').forEach(input => input.disabled = e.target.checked);
    });
  });
}

function coletarHorarios() {
  const horarios = {};
  document.querySelectorAll('#horarios-semana .horario-dia').forEach(linha => {
    const dia = linha.getAttribute('data-dia');
    const fechado = linha.querySelector('.horario-fechado').checked;
    if (fechado) {
      horarios[dia] = 'fechado';
    } else {
      const abertura = linha.querySelector('.horario-abertura').value;
      const fechamento = linha.querySelector('.horario-fechamento').value;
      horarios[dia] = `${abertura}-${fechamento}`;
    }
  });
  return horarios;
}

let EVENTOS_INFORMACOES_CONFIGURADOS = false;
function configurarEventosInformacoes() {
  if (EVENTOS_INFORMACOES_CONFIGURADOS) return;
  EVENTOS_INFORMACOES_CONFIGURADOS = true;

  document.getElementById('botao-salvar-informacoes').addEventListener('click', async () => {
    const botao = document.getElementById('botao-salvar-informacoes');
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
      await apiAtualizarEstabelecimento({
        nome: document.getElementById('campo-nome').value.trim(),
        texto_apresentacao: document.getElementById('campo-apresentacao').value.trim(),
        whatsapp: document.getElementById('campo-whatsapp').value.trim(),
        telefone: document.getElementById('campo-telefone').value.trim(),
        endereco: document.getElementById('campo-endereco').value.trim(),
        instagram: document.getElementById('campo-instagram').value.trim(),
        facebook: document.getElementById('campo-facebook').value.trim(),
        linkedin: document.getElementById('campo-linkedin').value.trim(),
        email_contato: document.getElementById('campo-email-contato').value.trim(),
        horario_funcionamento: coletarHorarios()
      });
      await carregarTudo();
      document.getElementById('menu-nome-estabelecimento').textContent = ESTADO.estabelecimento.nome;
      mostrarToast('Informacoes salvas com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar informacoes';
    }
  });
}

let EVENTOS_PAGAMENTO_CONFIGURADOS = false;
function configurarEventosPagamento() {
  if (EVENTOS_PAGAMENTO_CONFIGURADOS) return;
  EVENTOS_PAGAMENTO_CONFIGURADOS = true;

  document.getElementById('botao-salvar-pagamento').addEventListener('click', async () => {
    const botao = document.getElementById('botao-salvar-pagamento');
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
      const token = document.getElementById('campo-mp-token').value.trim();
      const publicKey = document.getElementById('campo-mp-public').value.trim();
      const dados = {};
      if (token) dados.mp_access_token = token;
      if (publicKey) dados.mp_public_key = publicKey;
      await apiAtualizarEstabelecimento(dados);
      document.getElementById('campo-mp-token').value = '';
      mostrarToast('Credenciais de pagamento salvas!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar credenciais';
    }
  });
}

// =============================================
// PAGINAS LEGAIS
// =============================================
let EVENTOS_PAGINAS_LEGAIS_CONFIGURADOS = false;
function configurarEventosPaginasLegais() {
  if (EVENTOS_PAGINAS_LEGAIS_CONFIGURADOS) return;
  EVENTOS_PAGINAS_LEGAIS_CONFIGURADOS = true;

  document.getElementById('botao-salvar-paginas-legais').addEventListener('click', async () => {
    const botao = document.getElementById('botao-salvar-paginas-legais');
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
      await apiAtualizarEstabelecimento({
        termos_uso: document.getElementById('campo-termos-uso').value.trim(),
        cookies: document.getElementById('campo-cookies').value.trim(),
        politica_privacidade: document.getElementById('campo-politica-privacidade').value.trim()
      });
      mostrarToast('Paginas legais salvas com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar paginas legais';
    }
  });
}

// =============================================
// CATEGORIAS
// =============================================

function renderizarCategoriasAdmin() {
  const lista = document.getElementById('lista-categorias-admin');
  if (ESTADO.categorias.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma categoria cadastrada ainda.</div>';
    return;
  }

  const ordenadas = [...ESTADO.categorias].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  lista.innerHTML = ordenadas.map((cat, indice) => `
    <div class="item-admin" data-categoria-id="${cat.id}">
      <div class="item-admin__mover">
        <button data-mover-categoria-cima="${cat.id}" ${indice === 0 ? 'disabled' : ''} title="Mover para cima">▲</button>
        <button data-mover-categoria-baixo="${cat.id}" ${indice === ordenadas.length - 1 ? 'disabled' : ''} title="Mover para baixo">▼</button>
      </div>
      <img class="item-admin__imagem" src="${cat.icone_url || ''}" alt="">
      <div class="item-admin__info">
        <div class="item-admin__titulo">${escaparHtmlAdmin(cat.nome)}</div>
        <div class="item-admin__subtitulo">Posicao: ${indice + 1} de ${ordenadas.length}</div>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-categoria="${cat.id}">Editar</button>
        <button class="botao-perigo" data-excluir-categoria="${cat.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-editar-categoria]').forEach(b => {
    b.addEventListener('click', () => abrirModalCategoria(b.getAttribute('data-editar-categoria')));
  });
  lista.querySelectorAll('[data-excluir-categoria]').forEach(b => {
    b.addEventListener('click', () => excluirCategoria(b.getAttribute('data-excluir-categoria')));
  });
  lista.querySelectorAll('[data-mover-categoria-cima]').forEach(b => {
    b.addEventListener('click', () => moverCategoria(b.getAttribute('data-mover-categoria-cima'), -1));
  });
  lista.querySelectorAll('[data-mover-categoria-baixo]').forEach(b => {
    b.addEventListener('click', () => moverCategoria(b.getAttribute('data-mover-categoria-baixo'), 1));
  });
}

async function moverCategoria(id, direcao) {
  const ordenadas = [...ESTADO.categorias].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const indice = ordenadas.findIndex(c => c.id === id);
  const indiceAlvo = indice + direcao;
  if (indice === -1 || indiceAlvo < 0 || indiceAlvo >= ordenadas.length) return;

  const atual = ordenadas[indice];
  const vizinha = ordenadas[indiceAlvo];

  try {
    const fd1 = new FormData();
    fd1.append('nome', atual.nome);
    fd1.append('ordem', indiceAlvo);
    const fd2 = new FormData();
    fd2.append('nome', vizinha.nome);
    fd2.append('ordem', indice);

    await Promise.all([apiAtualizarCategoria(atual.id, fd1), apiAtualizarCategoria(vizinha.id, fd2)]);
    await carregarTudo();
    renderizarCategoriasAdmin();
    mostrarToast('Ordem atualizada!');
  } catch (erro) {
    mostrarToast('Erro ao reordenar categoria.', true);
  }
}

let EVENTOS_CATEGORIAS_CONFIGURADOS = false;
function configurarEventosCategorias() {
  if (EVENTOS_CATEGORIAS_CONFIGURADOS) return;
  EVENTOS_CATEGORIAS_CONFIGURADOS = true;

  document.getElementById('botao-nova-categoria').addEventListener('click', () => abrirModalCategoria(null));

  document.getElementById('form-categoria').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('categoria-id').value;
    const formData = new FormData();
    formData.append('nome', document.getElementById('categoria-nome').value.trim());
    formData.append('ordem', ESTADO.categorias.length);
    const arquivo = document.getElementById('categoria-icone').files[0];
    if (arquivo) formData.append('imagem', arquivo);

    try {
      if (id) {
        await apiAtualizarCategoria(id, formData);
      } else {
        await apiCriarCategoria(formData);
      }
      fecharModaisAdmin();
      await carregarTudo();
      renderizarCategoriasAdmin();
      preencherSelectCategorias();
      mostrarToast('Categoria salva com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

function abrirModalCategoria(id) {
  const categoria = id ? ESTADO.categorias.find(c => c.id === id) : null;
  document.getElementById('titulo-modal-categoria').textContent = categoria ? 'Editar categoria' : 'Nova categoria';
  document.getElementById('categoria-id').value = id || '';
  document.getElementById('categoria-nome').value = categoria ? categoria.nome : '';
  document.getElementById('categoria-icone').value = '';
  document.getElementById('modal-categoria').classList.remove('oculto');
}

async function excluirCategoria(id) {
  if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;
  try {
    await apiExcluirCategoria(id);
    await carregarTudo();
    renderizarCategoriasAdmin();
    preencherSelectCategorias();
    mostrarToast('Categoria excluida.');
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

function preencherSelectCategorias() {
  const select = document.getElementById('produto-categoria');
  select.innerHTML = '<option value="">Sem categoria</option>' +
    ESTADO.categorias.map(c => `<option value="${c.id}">${escaparHtmlAdmin(c.nome)}</option>`).join('');
}

// =============================================
// PRODUTOS
// =============================================

function renderizarProdutosAdmin() {
  const lista = document.getElementById('lista-produtos-admin');
  if (ESTADO.produtos.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhum produto cadastrado ainda.</div>';
    return;
  }

  const ordenados = [...ESTADO.produtos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  lista.innerHTML = ordenados.map((p, indice) => `
    <div class="item-admin ${!p.disponivel ? 'item-admin--indisponivel' : ''}" data-produto-id="${p.id}">
      <div class="item-admin__mover">
        <button data-mover-produto-cima="${p.id}" ${indice === 0 ? 'disabled' : ''} title="Mover para cima">▲</button>
        <button data-mover-produto-baixo="${p.id}" ${indice === ordenados.length - 1 ? 'disabled' : ''} title="Mover para baixo">▼</button>
      </div>
      <img class="item-admin__imagem" src="${p.foto_url || ''}" alt="">
      <div class="item-admin__info">
        <div class="item-admin__titulo">${escaparHtmlAdmin(p.nome)} ${!p.disponivel ? '(indisponivel)' : ''}</div>
        <div class="item-admin__subtitulo">${p.categoria_nome || 'Sem categoria'} - ${formatarMoedaAdmin(p.preco)} - Posicao: ${indice + 1} de ${ordenados.length}</div>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-produto="${p.id}">Editar</button>
        <button class="botao-perigo" data-excluir-produto="${p.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-editar-produto]').forEach(b => {
    b.addEventListener('click', () => abrirModalProdutoAdmin(b.getAttribute('data-editar-produto')));
  });
  lista.querySelectorAll('[data-excluir-produto]').forEach(b => {
    b.addEventListener('click', () => excluirProduto(b.getAttribute('data-excluir-produto')));
  });
  lista.querySelectorAll('[data-mover-produto-cima]').forEach(b => {
    b.addEventListener('click', () => moverProduto(b.getAttribute('data-mover-produto-cima'), -1));
  });
  lista.querySelectorAll('[data-mover-produto-baixo]').forEach(b => {
    b.addEventListener('click', () => moverProduto(b.getAttribute('data-mover-produto-baixo'), 1));
  });
}

async function moverProduto(id, direcao) {
  const ordenados = [...ESTADO.produtos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const indice = ordenados.findIndex(p => p.id === id);
  const indiceAlvo = indice + direcao;
  if (indice === -1 || indiceAlvo < 0 || indiceAlvo >= ordenados.length) return;

  const atual = ordenados[indice];
  const vizinho = ordenados[indiceAlvo];

  try {
    const fd1 = new FormData();
    fd1.append('ordem', indiceAlvo);
    const fd2 = new FormData();
    fd2.append('ordem', indice);

    await Promise.all([apiAtualizarProduto(atual.id, fd1), apiAtualizarProduto(vizinho.id, fd2)]);
    await carregarTudo();
    renderizarProdutosAdmin();
    mostrarToast('Ordem atualizada!');
  } catch (erro) {
    mostrarToast('Erro ao reordenar produto.', true);
  }
}

let EVENTOS_PRODUTOS_CONFIGURADOS = false;
function configurarEventosProdutos() {
  if (EVENTOS_PRODUTOS_CONFIGURADOS) return;
  EVENTOS_PRODUTOS_CONFIGURADOS = true;

  document.getElementById('botao-novo-produto').addEventListener('click', () => abrirModalProdutoAdmin(null));

  document.getElementById('form-produto').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('produto-id').value;
    const formData = new FormData();
    formData.append('categoria_id', document.getElementById('produto-categoria').value);
    formData.append('nome', document.getElementById('produto-nome').value.trim());
    formData.append('codigo', document.getElementById('produto-codigo').value.trim());
    formData.append('descricao', document.getElementById('produto-descricao').value.trim());
    formData.append('preco', document.getElementById('produto-preco').value);
    formData.append('preco_promocional', document.getElementById('produto-preco-promo').value || '');
    formData.append('disponivel', document.getElementById('produto-disponivel').checked);
    const arquivo = document.getElementById('produto-foto').files[0];
    if (arquivo) formData.append('imagem', arquivo);

    try {
      if (id) {
        await apiAtualizarProduto(id, formData);
      } else {
        await apiCriarProduto(formData);
      }
      fecharModaisAdmin();
      await carregarTudo();
      renderizarProdutosAdmin();
      preencherSelectProdutosPromocao();
      mostrarToast('Produto salvo com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

function abrirModalProdutoAdmin(id) {
  const produto = id ? ESTADO.produtos.find(p => p.id === id) : null;
  document.getElementById('titulo-modal-produto').textContent = produto ? 'Editar produto' : 'Novo produto';
  document.getElementById('produto-id').value = id || '';
  document.getElementById('produto-categoria').value = produto?.categoria_id || '';
  document.getElementById('produto-nome').value = produto?.nome || '';
  document.getElementById('produto-codigo').value = produto?.codigo || '';
  document.getElementById('produto-descricao').value = produto?.descricao || '';
  document.getElementById('produto-preco').value = produto?.preco || '';
  document.getElementById('produto-preco-promo').value = produto?.preco_promocional || '';
  document.getElementById('produto-disponivel').checked = produto ? produto.disponivel : true;
  document.getElementById('produto-foto').value = '';
  document.getElementById('modal-produto-admin').classList.remove('oculto');
}

async function excluirProduto(id) {
  if (!confirm('Tem certeza que deseja excluir este produto?')) return;
  try {
    await apiExcluirProduto(id);
    await carregarTudo();
    renderizarProdutosAdmin();
    preencherSelectProdutosPromocao();
    mostrarToast('Produto excluido.');
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

// =============================================
// PROMOCOES
// =============================================

function renderizarPromocoesAdmin() {
  const lista = document.getElementById('lista-promocoes-admin');
  if (ESTADO.promocoes.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma promocao cadastrada ainda.</div>';
    return;
  }

  const ordenadas = [...ESTADO.promocoes].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  lista.innerHTML = ordenadas.map((promo, indice) => `
    <div class="item-admin" data-promocao-id="${promo.id}">
      <div class="item-admin__mover">
        <button data-mover-promocao-cima="${promo.id}" ${indice === 0 ? 'disabled' : ''} title="Mover para cima">▲</button>
        <button data-mover-promocao-baixo="${promo.id}" ${indice === ordenadas.length - 1 ? 'disabled' : ''} title="Mover para baixo">▼</button>
      </div>
      <img class="item-admin__imagem" src="${promo.imagem_url || ''}" alt="">
      <div class="item-admin__info">
        <div class="item-admin__titulo">${escaparHtmlAdmin(promo.titulo)}</div>
        <div class="item-admin__subtitulo">${promo.ativo ? 'Ativa' : 'Inativa'} - Posicao: ${indice + 1} de ${ordenadas.length}</div>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-promocao="${promo.id}">Editar</button>
        <button class="botao-perigo" data-excluir-promocao="${promo.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-editar-promocao]').forEach(b => {
    b.addEventListener('click', () => abrirModalPromocao(b.getAttribute('data-editar-promocao')));
  });
  lista.querySelectorAll('[data-excluir-promocao]').forEach(b => {
    b.addEventListener('click', () => excluirPromocao(b.getAttribute('data-excluir-promocao')));
  });
  lista.querySelectorAll('[data-mover-promocao-cima]').forEach(b => {
    b.addEventListener('click', () => moverPromocao(b.getAttribute('data-mover-promocao-cima'), -1));
  });
  lista.querySelectorAll('[data-mover-promocao-baixo]').forEach(b => {
    b.addEventListener('click', () => moverPromocao(b.getAttribute('data-mover-promocao-baixo'), 1));
  });
}

async function moverPromocao(id, direcao) {
  const ordenadas = [...ESTADO.promocoes].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const indice = ordenadas.findIndex(p => p.id === id);
  const indiceAlvo = indice + direcao;
  if (indice === -1 || indiceAlvo < 0 || indiceAlvo >= ordenadas.length) return;

  const atual = ordenadas[indice];
  const vizinha = ordenadas[indiceAlvo];

  try {
    // So enviamos "ordem" -- o backend preserva produto_id/datas quando o campo nao vem na requisicao.
    const fd1 = new FormData();
    fd1.append('ordem', indiceAlvo);
    const fd2 = new FormData();
    fd2.append('ordem', indice);

    await Promise.all([apiAtualizarPromocao(atual.id, fd1), apiAtualizarPromocao(vizinha.id, fd2)]);
    await carregarTudo();
    renderizarPromocoesAdmin();
    mostrarToast('Ordem atualizada!');
  } catch (erro) {
    mostrarToast('Erro ao reordenar promocao.', true);
  }
}

let EVENTOS_PROMOCOES_CONFIGURADOS = false;
function configurarEventosPromocoes() {
  if (EVENTOS_PROMOCOES_CONFIGURADOS) return;
  EVENTOS_PROMOCOES_CONFIGURADOS = true;

  document.getElementById('botao-nova-promocao').addEventListener('click', () => abrirModalPromocao(null));

  document.getElementById('form-promocao').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('promocao-id').value;
    const formData = new FormData();
    formData.append('titulo', document.getElementById('promocao-titulo').value.trim());
    formData.append('descricao', document.getElementById('promocao-descricao').value.trim());
    formData.append('produto_id', document.getElementById('promocao-produto').value);
    const arquivo = document.getElementById('promocao-imagem').files[0];
    if (arquivo) formData.append('imagem', arquivo);

    try {
      if (id) {
        await apiAtualizarPromocao(id, formData);
      } else {
        await apiCriarPromocao(formData);
      }
      fecharModaisAdmin();
      await carregarTudo();
      renderizarPromocoesAdmin();
      mostrarToast('Promocao salva com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

function abrirModalPromocao(id) {
  const promocao = id ? ESTADO.promocoes.find(p => p.id === id) : null;
  document.getElementById('titulo-modal-promocao').textContent = promocao ? 'Editar promocao' : 'Nova promocao';
  document.getElementById('promocao-id').value = id || '';
  document.getElementById('promocao-titulo').value = promocao?.titulo || '';
  document.getElementById('promocao-descricao').value = promocao?.descricao || '';
  document.getElementById('promocao-produto').value = promocao?.produto_id || '';
  document.getElementById('promocao-imagem').value = '';
  document.getElementById('modal-promocao').classList.remove('oculto');
}

async function excluirPromocao(id) {
  if (!confirm('Tem certeza que deseja excluir esta promocao?')) return;
  try {
    await apiExcluirPromocao(id);
    await carregarTudo();
    renderizarPromocoesAdmin();
    mostrarToast('Promocao excluida.');
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

function preencherSelectProdutosPromocao() {
  const select = document.getElementById('promocao-produto');
  select.innerHTML = '<option value="">Nenhum</option>' +
    ESTADO.produtos.map(p => `<option value="${p.id}">${escaparHtmlAdmin(p.nome)}</option>`).join('');
}

let FILTRO_STATUS_PEDIDO = '';

function configurarEventosPedidos() {
  document.querySelectorAll('.filtro-pedidos__botao').forEach(botao => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.filtro-pedidos__botao').forEach(b => b.classList.remove('ativo'));
      botao.classList.add('ativo');
      FILTRO_STATUS_PEDIDO = botao.getAttribute('data-status');
      carregarPedidos();
    });
  });
}

async function carregarPedidos() {
  const lista = document.getElementById('lista-pedidos-admin');
  lista.innerHTML = '<div class="lista-vazia">Carregando...</div>';
  try {
    const pedidos = await apiListarPedidos(FILTRO_STATUS_PEDIDO);
    renderizarPedidosAdmin(pedidos);
  } catch (erro) {
    lista.innerHTML = '<div class="lista-vazia">Erro ao carregar pedidos.</div>';
  }
}

const STATUS_PEDIDO_LABEL = {
  novo: 'Novo', preparando: 'Preparando', saiu_entrega: 'Saiu para entrega',
  entregue: 'Entregue', cancelado: 'Cancelado'
};

function renderizarPedidosAdmin(pedidos) {
  const lista = document.getElementById('lista-pedidos-admin');
  if (pedidos.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhum pedido encontrado.</div>';
    return;
  }

  lista.innerHTML = pedidos.map(pedido => {
    const itens = pedido.itens.map(i => `${i.quantidade}x ${escaparHtmlAdmin(i.nome)}`).join(', ');
    const data = new Date(pedido.criado_em).toLocaleString('pt-BR');
    return `
      <div class="item-admin" style="align-items: flex-start;">
        <div class="item-admin__info">
          <div class="item-admin__titulo">
            ${escaparHtmlAdmin(pedido.cliente_nome)}
            <span class="badge-status badge-status--${pedido.status_pedido}">${STATUS_PEDIDO_LABEL[pedido.status_pedido]}</span>
          </div>
          <div class="item-admin__subtitulo">${itens}</div>
          <div class="item-admin__subtitulo">${data} - ${formatarMoedaAdmin(pedido.total)} - ${pedido.forma_pagamento.toUpperCase()} (${pedido.status_pagamento})</div>
          <div class="item-admin__subtitulo">Tel: ${escaparHtmlAdmin(pedido.cliente_telefone)}</div>
        </div>
        <select class="campo-select" style="width:auto;" data-mudar-status="${pedido.id}">
          ${Object.entries(STATUS_PEDIDO_LABEL).map(([valor, label]) =>
            `<option value="${valor}" ${pedido.status_pedido === valor ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>
    `;
  }).join('');

  lista.querySelectorAll('[data-mudar-status]').forEach(select => {
    select.addEventListener('change', async () => {
      try {
        await apiAtualizarStatusPedido(select.getAttribute('data-mudar-status'), select.value);
        mostrarToast('Status do pedido atualizado.');
        carregarPedidos();
      } catch (erro) {
        mostrarToast(erro.message, true);
      }
    });
  });
}

document.querySelectorAll('[data-fechar-modal-admin]').forEach(el => {
  el.addEventListener('click', fecharModaisAdmin);
});

function fecharModaisAdmin() {
  document.querySelectorAll('.modal-admin').forEach(m => m.classList.add('oculto'));
}

function formatarMoedaAdmin(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor) || 0);
}

function escaparHtmlAdmin(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}
