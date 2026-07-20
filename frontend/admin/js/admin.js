let ESTADO = {
  estabelecimento: null,
  categorias: [],
  produtos: [],
  promocoes: [],
  carrosseis: [],
  vitrines: [],
  funcionarios: [],
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
  configurarLoginFuncionario();
  configurarMenu();
  configurarBotoesOlho();
  configurarEsqueciSenha();
  configurarTrocarSenha();
  configurarFuncionarios();
  if (obterToken()) mostrarPainel();
}

function sessaoAtual() {
  return obterEstabelecimentoSessao() || {};
}

function ehFuncionario() {
  return sessaoAtual().tipo === 'funcionario';
}

function temPermissao(chave) {
  const s = sessaoAtual();
  if (s.cargo === 'proprietario' || s.cargo === 'administrador') return true;
  return Array.isArray(s.permissoes) && s.permissoes.includes(chave);
}

function configurarBotoesOlho() {
  document.querySelectorAll('.botao-olho').forEach(botao => {
    botao.addEventListener('click', () => {
      const input = document.getElementById(botao.getAttribute('data-alvo-senha'));
      if (!input) return;
      const oculta = input.type === 'password';
      input.type = oculta ? 'text' : 'password';
      botao.textContent = oculta ? '🙈' : '👁';
    });
  });
}

function configurarEsqueciSenha() {
  document.getElementById('link-esqueci-senha').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('tela-login').classList.add('oculto');
    document.getElementById('tela-esqueci-senha').classList.remove('oculto');
  });

  document.getElementById('link-voltar-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('tela-esqueci-senha').classList.add('oculto');
    document.getElementById('tela-login').classList.remove('oculto');
  });

  document.getElementById('form-esqueci-senha').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const erroEl = document.getElementById('esqueci-senha-erro');
    const sucessoEl = document.getElementById('esqueci-senha-sucesso');
    erroEl.classList.add('oculto');
    sucessoEl.classList.add('oculto');
    const botao = evento.target.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      const email = document.getElementById('esqueci-email').value.trim();
      await apiSolicitarRecuperacaoSenha(email);
      sucessoEl.textContent = 'Se esse e-mail estiver cadastrado, enviamos um link de recuperacao. Confira sua caixa de entrada (e o spam).';
      sucessoEl.classList.remove('oculto');
    } catch (erro) {
      erroEl.textContent = erro.message;
      erroEl.classList.remove('oculto');
    } finally {
      botao.disabled = false;
    }
  });
}

let EVENTOS_SENHA_CONFIGURADOS = false;
function configurarTrocarSenha() {
  if (EVENTOS_SENHA_CONFIGURADOS) return;
  EVENTOS_SENHA_CONFIGURADOS = true;

  document.getElementById('botao-salvar-senha').addEventListener('click', async () => {
    const botao = document.getElementById('botao-salvar-senha');
    const senhaAtual = document.getElementById('campo-senha-atual').value;
    const novaSenha = document.getElementById('campo-senha-nova').value;
    const confirmar = document.getElementById('campo-senha-confirmar').value;

    if (!senhaAtual || !novaSenha) {
      mostrarToast('Preencha a senha atual e a nova senha.', true);
      return;
    }
    if (novaSenha.length < 6) {
      mostrarToast('A nova senha deve ter pelo menos 6 caracteres.', true);
      return;
    }
    if (novaSenha !== confirmar) {
      mostrarToast('A confirmacao nao corresponde a nova senha.', true);
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
      if (ehFuncionario()) {
        const s = sessaoAtual();
        await apiTrocarSenhaFuncionario(s.funcionarioId, { senhaAtual, novaSenha });
      } else {
        await apiTrocarSenha(senhaAtual, novaSenha);
      }
      document.getElementById('campo-senha-atual').value = '';
      document.getElementById('campo-senha-nova').value = '';
      document.getElementById('campo-senha-confirmar').value = '';
      mostrarToast('Senha alterada com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Alterar senha';
    }
  });
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

  document.getElementById('link-login-funcionario').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('tela-login').classList.add('oculto');
    document.getElementById('tela-login-funcionario').classList.remove('oculto');
  });

  document.getElementById('botao-sair').addEventListener('click', () => {
    limparSessao();
    window.location.reload();
  });
}

function configurarLoginFuncionario() {
  document.getElementById('link-voltar-login-dono').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('tela-login-funcionario').classList.add('oculto');
    document.getElementById('tela-login').classList.remove('oculto');
  });

  document.getElementById('form-login-funcionario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const erroEl = document.getElementById('funcionario-login-erro');
    erroEl.classList.add('oculto');
    try {
      const slug = document.getElementById('funcionario-slug').value.trim();
      const login = document.getElementById('funcionario-login').value.trim();
      const senha = document.getElementById('funcionario-senha').value;
      const resultado = await apiLoginFuncionario(slug, login, senha);
      salvarSessaoFuncionario(resultado.token, resultado.funcionario);
      mostrarPainel();
    } catch (erro) {
      erroEl.textContent = erro.message;
      erroEl.classList.remove('oculto');
    }
  });
}

async function mostrarPainel() {
  document.getElementById('tela-login').classList.add('oculto');
  document.getElementById('tela-login-funcionario').classList.add('oculto');
  document.getElementById('painel').classList.remove('oculto');
  try {
    await carregarTudo();
    preencherFormularios();
    const s = sessaoAtual();
    const nomeLoja = (ESTADO.estabelecimento && ESTADO.estabelecimento.nome) || s.estabelecimentoNome || 'Painel';
    document.getElementById('menu-nome-estabelecimento').textContent = nomeLoja;
    document.getElementById('menu-cargo-funcionario').textContent = NOMES_CARGO[s.cargo] || '';
    document.getElementById('menu-nome-funcionario').textContent = ehFuncionario() ? (s.nome || '') : '';
    document.getElementById('menu-link-publico').textContent = s.slug ? `/${s.slug}` : '';
    aplicarVisibilidadeMenu();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

// Busca cada recurso separadamente: se o funcionario nao tiver permissao
// para algum deles (ex: configuracoes da conta), a tela nao quebra inteira,
// so aquela parte fica vazia/oculta.
async function carregarTudo() {
  const resultados = await Promise.allSettled([
    apiBuscarEstabelecimento(),
    apiListarCategorias(),
    apiListarProdutos(),
    apiListarPromocoes(),
    apiListarCarrosseis(),
    apiListarVitrines(),
    apiListarCaixasTexto()
  ]);

  ESTADO.estabelecimento = resultados[0].status === 'fulfilled' ? resultados[0].value : null;
  ESTADO.categorias = resultados[1].status === 'fulfilled' ? resultados[1].value : [];
  ESTADO.produtos = resultados[2].status === 'fulfilled' ? resultados[2].value : [];
  ESTADO.promocoes = resultados[3].status === 'fulfilled' ? resultados[3].value : [];
  ESTADO.carrosseis = resultados[4].status === 'fulfilled' ? resultados[4].value : [];
  ESTADO.vitrines = resultados[5].status === 'fulfilled' ? resultados[5].value : [];
  ESTADO.caixasTexto = resultados[6].status === 'fulfilled' ? resultados[6].value : [];

  if (temPermissao('gerenciar_funcionarios')) {
    try { ESTADO.funcionarios = await apiListarFuncionarios(); } catch { ESTADO.funcionarios = []; }
  }

  atualizarContadoresMenu();
}

// Mostra, ao lado de cada item do menu lateral, a quantidade de itens que
// aquela pagina tem (categorias, produtos, promocoes, carrosseis/vitrines,
// funcionarios) -- assim da pra ver a quantidade sem precisar abrir a pagina.
function atualizarContadoresMenu() {
  const definir = (seletor, valor) => {
    const el = document.querySelector(seletor);
    if (el) el.textContent = valor > 0 ? valor : '';
  };

  definir('[data-menu-contador="categorias"]', (ESTADO.categorias || []).length);
  definir('[data-menu-contador="produtos"]', (ESTADO.produtos || []).length);
  definir('[data-menu-contador="promocoes"]', (ESTADO.promocoes || []).length);
  definir('[data-menu-contador="vitrines"]', (ESTADO.carrosseis || []).length + (ESTADO.vitrines || []).length);
  definir('[data-menu-contador="funcionarios"]', (ESTADO.funcionarios || []).length);

  if (typeof apiContarPedidos === 'function') {
    apiContarPedidos()
      .then(contagem => definir('[data-menu-contador="pedidos"]', contagem.todos || 0))
      .catch(() => {});
  }
}

// Mostra/esconde abas do menu conforme a permissao da sessao atual
function aplicarVisibilidadeMenu() {
  const mapaPermissao = {
    aparencia: 'gerenciar_conta',
    informacoes: 'gerenciar_conta',
    pagamento: 'gerenciar_conta',
    'paginas-legais': 'gerenciar_conta',
    categorias: 'gerenciar_cardapio',
    produtos: 'gerenciar_cardapio',
    promocoes: 'gerenciar_cardapio',
    vitrines: 'gerenciar_cardapio',
    funcionarios: 'gerenciar_funcionarios',
    'caixa-geral': 'ver_caixa_geral'
    // "pedidos" e "senha" ficam sempre visiveis para qualquer sessao logada
  };

  let primeiraVisivel = null;
  document.querySelectorAll('.painel__menu-item[data-aba]').forEach(botao => {
    const aba = botao.getAttribute('data-aba');
    const permissaoNecessaria = mapaPermissao[aba];
    const visivel = !permissaoNecessaria || temPermissao(permissaoNecessaria);
    botao.classList.toggle('oculto', !visivel);
    if (visivel && !primeiraVisivel) primeiraVisivel = aba;
  });

  const abaAtivaAtual = document.querySelector('.painel__menu-item.ativo:not(.oculto)');
  if (!abaAtivaAtual && primeiraVisivel) {
    document.querySelector(`.painel__menu-item[data-aba="${primeiraVisivel}"]`).click();
  }
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
      if (aba === 'caixa-geral') carregarCaixaGeral();
      if (aba === 'funcionarios') renderizarFuncionariosAdmin();
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
  if (e) {
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
  }

  const tentar = (nome, fn) => {
    try { fn(); } catch (erro) { console.error(`Erro ao inicializar "${nome}":`, erro); }
  };

  tentar('categorias', renderizarCategoriasAdmin);
  tentar('produtos', renderizarProdutosAdmin);
  tentar('promocoes', renderizarPromocoesAdmin);
  tentar('select-categorias', preencherSelectCategorias);
  tentar('select-produtos-promocao', preencherSelectProdutosPromocao);

  tentar('eventos-aparencia', configurarEventosAparencia);
  tentar('eventos-informacoes', configurarEventosInformacoes);
  tentar('eventos-pagamento', configurarEventosPagamento);
  tentar('eventos-paginas-legais', configurarEventosPaginasLegais);
  tentar('eventos-categorias', configurarEventosCategorias);
  tentar('eventos-produtos', configurarEventosProdutos);
  tentar('eventos-promocoes', configurarEventosPromocoes);

  tentar('paleta-cores', montarPaletaCores);
  tentar('preview-fonte', configurarPreviewFonte);

  if (typeof renderizarCarrosseisAdmin === 'function') tentar('carrosseis', renderizarCarrosseisAdmin);
  if (typeof renderizarVitrinesAdmin === 'function') tentar('vitrines', renderizarVitrinesAdmin);
  if (typeof renderizarCaixasTextoAdmin === 'function') tentar('caixas-texto', renderizarCaixasTextoAdmin);
  if (typeof configurarEventosCarrosseis === 'function') tentar('eventos-carrosseis', configurarEventosCarrosseis);
  if (typeof configurarEventosVitrines === 'function') tentar('eventos-vitrines', configurarEventosVitrines);
  if (typeof configurarEventosCaixasTexto === 'function') tentar('eventos-caixas-texto', configurarEventosCaixasTexto);
  tentar('eventos-pedidos', configurarEventosPedidos);
  tentar('eventos-caixa-geral', configurarEventosCaixaGeral);
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
// CATEGORIAS COM DRAG AND DROP
// =============================================
let dragSrcCategoriaId = null;

// ===================================================================
// Arrastar-e-soltar universal (Pointer Events) — ao contrario do HTML5
// Drag and Drop nativo, isso funciona em toque de celular e em mouse
// igualmente. Padrao para QUALQUER lista reordenavel do painel.
// Uso: configurarArrastarSoltar(container, '.item', 'data-algo-id', (novaOrdemIds) => {...})
// ===================================================================
let ARRASTAR_ITEM = null;
let ARRASTAR_CONTAINER = null;
let ARRASTAR_INICIO_Y = 0;
let ARRASTAR_LISTENERS_GLOBAIS_PRONTOS = false;

function configurarArrastarSoltar(container, seletorItem, atributoId, aoSoltar) {
  if (!container) return;
  // Guarda os dados de quem chamou direto no elemento -- assim, mesmo que
  // essa funcao seja chamada de novo a cada vez que a lista e re-renderizada,
  // nao precisamos recriar os escutadores globais (document.addEventListener)
  // toda vez, o que evitava perder o evento de soltar o dedo no meio do caminho.
  container._seletorItemArrastar = seletorItem;
  container._atributoIdArrastar = atributoId;
  container._aoSoltarArrastar = aoSoltar;

  container.querySelectorAll(seletorItem).forEach(item => {
    const alca = item.querySelector('.drag-handle');
    if (!alca) return;
    alca.style.touchAction = 'none';
    alca.onpointerdown = (evento) => {
      ARRASTAR_ITEM = item;
      ARRASTAR_CONTAINER = container;
      ARRASTAR_INICIO_Y = evento.clientY;
      item.classList.add('sendo-arrastado');
      try { alca.setPointerCapture(evento.pointerId); } catch (e) { /* alguns navegadores nao suportam, tudo bem ignorar */ }
      evento.preventDefault();
    };
  });

  if (ARRASTAR_LISTENERS_GLOBAIS_PRONTOS) return;
  ARRASTAR_LISTENERS_GLOBAIS_PRONTOS = true;

  document.addEventListener('pointermove', (evento) => {
    if (!ARRASTAR_ITEM || !ARRASTAR_CONTAINER) return;
    ARRASTAR_ITEM.style.transform = `translateY(${evento.clientY - ARRASTAR_INICIO_Y}px)`;

    const seletor = ARRASTAR_CONTAINER._seletorItemArrastar;
    const elemento = document.elementFromPoint(evento.clientX, evento.clientY);
    const itemSobre = elemento && elemento.closest(seletor);
    if (!itemSobre || itemSobre === ARRASTAR_ITEM || itemSobre.parentElement !== ARRASTAR_CONTAINER) return;

    const retangulo = itemSobre.getBoundingClientRect();
    const meio = retangulo.top + retangulo.height / 2;
    if (evento.clientY < meio) {
      ARRASTAR_CONTAINER.insertBefore(ARRASTAR_ITEM, itemSobre);
    } else {
      ARRASTAR_CONTAINER.insertBefore(ARRASTAR_ITEM, itemSobre.nextSibling);
    }
    ARRASTAR_INICIO_Y = evento.clientY;
    ARRASTAR_ITEM.style.transform = '';
  });

  const finalizarArraste = async () => {
    if (!ARRASTAR_ITEM || !ARRASTAR_CONTAINER) return;
    const item = ARRASTAR_ITEM;
    const cont = ARRASTAR_CONTAINER;
    item.classList.remove('sendo-arrastado');
    item.style.transform = '';

    const seletor = cont._seletorItemArrastar;
    const atributo = cont._atributoIdArrastar;
    const callback = cont._aoSoltarArrastar;
    ARRASTAR_ITEM = null;
    ARRASTAR_CONTAINER = null;
    if (!callback) return;

    const novaOrdem = Array.from(cont.querySelectorAll(seletor)).map(el => el.getAttribute(atributo));
    try {
      await callback(novaOrdem);
      if (typeof mostrarToast === 'function') mostrarToast('Nova ordem salva com sucesso!');
    } catch (erro) {
      console.error('Erro ao salvar nova ordem:', erro);
      if (typeof mostrarToast === 'function') {
        mostrarToast('ERRO ao salvar a nova ordem: ' + ((erro && erro.message) || 'motivo desconhecido'), true);
      }
    }
  };

  document.addEventListener('pointerup', finalizarArraste);
  document.addEventListener('pointercancel', finalizarArraste);
}

function renderizarCategoriasAdmin() {
  const lista = document.getElementById('lista-categorias-admin');
  const ativas = ESTADO.categorias.filter(c => c.ativo !== false);
  const desativadas = ESTADO.categorias.filter(c => c.ativo === false);
  document.getElementById('contador-categorias').textContent = `(${ativas.length})`;
  document.getElementById('contador-categorias-desativadas').textContent = `(${desativadas.length})`;

  if (ativas.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma categoria ativa.</div>';
  } else {
    lista.innerHTML = montarItensCategoria([...ativas].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    configurarItensCategoria(lista);
    configurarDragDropCategorias(lista);
  }

  const blocoDesativadas = document.getElementById('bloco-categorias-desativadas');
  blocoDesativadas.innerHTML = desativadas.length === 0
    ? '<div class="lista-vazia">Nenhuma categoria desativada.</div>'
    : montarItensCategoria(desativadas);
  configurarItensCategoria(blocoDesativadas);
}

function montarItensCategoria(categorias) {
  return categorias.map(cat => `
    <div class="item-admin ${cat.ativo === false ? 'item-admin--indisponivel' : ''} item-admin--drag"
         draggable="true" data-categoria-drag-id="${cat.id}" data-categoria-expandir="${cat.id}">
      <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
      <img class="item-admin__imagem" src="${cat.icone_url || ''}" alt="">
      <div class="item-admin__info">
        <div class="item-admin__titulo">${escaparHtmlAdmin(cat.nome)}</div>
        <div class="item-admin__subtitulo">Ordem: ${cat.ordem}</div>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-categoria="${cat.id}">Editar</button>
        <label class="interruptor" title="${cat.ativo === false ? 'Ativar categoria' : 'Desativar categoria'}">
          <input type="checkbox" data-toggle-categoria="${cat.id}" ${cat.ativo !== false ? 'checked' : ''}>
          <span class="interruptor__trilho"></span>
        </label>
        <button class="botao-perigo" data-excluir-categoria="${cat.id}">Excluir</button>
      </div>
    </div>
    <div class="item-admin__descricao-painel oculto" data-descricao-painel-categoria="${cat.id}">
      ${cat.descricao ? escaparHtmlAdmin(cat.descricao) : 'Sem descricao cadastrada.'}
    </div>
  `).join('');
}

function configurarItensCategoria(container) {
  container.querySelectorAll('[data-editar-categoria]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalCategoria(b.getAttribute('data-editar-categoria'));
    });
  });
  container.querySelectorAll('[data-excluir-categoria]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      excluirCategoria(b.getAttribute('data-excluir-categoria'));
    });
  });
  container.querySelectorAll('[data-toggle-categoria]').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => alternarAtivoCategoria(input.getAttribute('data-toggle-categoria'), input.checked));
  });
  container.querySelectorAll('.item-admin[data-categoria-expandir]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('button, label.interruptor, .drag-handle')) return;
      const id = item.getAttribute('data-categoria-expandir');
      const painel = container.querySelector(`[data-descricao-painel-categoria="${id}"]`);
      if (painel) painel.classList.toggle('oculto');
    });
  });
}

async function alternarAtivoCategoria(id, ativo) {
  try {
    const fd = new FormData();
    fd.append('ativo', ativo);
    await apiAtualizarCategoria(id, fd);
    await carregarTudo();
    renderizarCategoriasAdmin();
    mostrarToast(ativo ? 'Categoria ativada.' : 'Categoria desativada.');
  } catch (erro) {
    mostrarToast(erro.message, true);
    renderizarCategoriasAdmin();
  }
}

function configurarDragDropCategorias(lista) {
  lista.querySelectorAll('.item-admin--drag[data-categoria-drag-id]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcCategoriaId = item.getAttribute('data-categoria-drag-id');
      item.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      lista.querySelectorAll('.item-admin--drag').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      lista.querySelectorAll('.item-admin--drag').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-categoria-drag-id');
      if (dragSrcCategoriaId === targetId) return;

      const ordenadas = [...ESTADO.categorias].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const indiceSrc = ordenadas.findIndex(c => c.id === dragSrcCategoriaId);
      const indiceTarget = ordenadas.findIndex(c => c.id === targetId);
      if (indiceSrc === -1 || indiceTarget === -1) return;

      const reordenadas = [...ordenadas];
      const [movida] = reordenadas.splice(indiceSrc, 1);
      reordenadas.splice(indiceTarget, 0, movida);

      try {
        await Promise.all(reordenadas.map((c, i) => {
          if (c.ordem !== i) {
            const fd = new FormData();
            fd.append('nome', c.nome);
            fd.append('ordem', i);
            return apiAtualizarCategoria(c.id, fd);
          }
        }).filter(Boolean));
        await carregarTudo();
        renderizarCategoriasAdmin();
        mostrarToast('Ordem das categorias atualizada!');
      } catch (erro) {
        mostrarToast('Erro ao reordenar categorias.', true);
      }
    });
  });
}

let EVENTOS_CATEGORIAS_CONFIGURADOS = false;
function configurarEventosCategorias() {
  if (EVENTOS_CATEGORIAS_CONFIGURADOS) return;
  EVENTOS_CATEGORIAS_CONFIGURADOS = true;

  document.getElementById('botao-nova-categoria')?.addEventListener('click', () => abrirModalCategoria(null));
  document.getElementById('botao-alternar-categorias-desativadas')?.addEventListener('click', () => {
    document.getElementById('bloco-categorias-desativadas').classList.toggle('oculto');
  });

  document.getElementById('form-categoria').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('categoria-id').value;
    const formData = new FormData();
    formData.append('nome', document.getElementById('categoria-nome').value.trim());
    formData.append('descricao', document.getElementById('categoria-descricao').value.trim());
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
  document.getElementById('categoria-descricao').value = categoria?.descricao || '';
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
// PRODUTOS COM DRAG AND DROP
// =============================================
let dragSrcProdutoId = null;

let FILTRO_CATEGORIA_PRODUTOS = null;

function renderizarProdutosAdmin() {
  const lista = document.getElementById('lista-produtos-admin');
  const chip = document.getElementById('chip-filtro-categoria');

  const produtosFiltrados = FILTRO_CATEGORIA_PRODUTOS
    ? ESTADO.produtos.filter(p => p.categoria_id === FILTRO_CATEGORIA_PRODUTOS)
    : ESTADO.produtos;

  document.getElementById('contador-produtos').textContent = `(${produtosFiltrados.length})`;

  if (FILTRO_CATEGORIA_PRODUTOS) {
    const categoria = ESTADO.categorias.find(c => c.id === FILTRO_CATEGORIA_PRODUTOS);
    document.getElementById('chip-filtro-categoria-nome').textContent = categoria ? categoria.nome : 'categoria';
    chip.classList.remove('oculto');
  } else {
    chip.classList.add('oculto');
  }

  if (produtosFiltrados.length === 0) {
    lista.innerHTML = `<div class="lista-vazia">${FILTRO_CATEGORIA_PRODUTOS ? 'Nenhum produto nesta categoria.' : 'Nenhum produto cadastrado ainda.'}</div>`;
  } else {
    const ordenados = [...produtosFiltrados].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

    lista.innerHTML = ordenados.map(p => `
      <div class="item-admin item-admin--drag ${!p.disponivel ? 'item-admin--indisponivel' : ''}"
           draggable="true" data-produto-drag-id="${p.id}" data-produto-expandir="${p.id}">
        <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
        <img class="item-admin__imagem" src="${p.foto_url || ''}" alt="">
        <div class="item-admin__info">
          <div class="item-admin__titulo">${escaparHtmlAdmin(p.nome)}</div>
          <div class="item-admin__subtitulo">${p.categoria_nome || 'Sem categoria'} - ${formatarMoedaAdmin(p.preco)}${p.estoque !== null && p.estoque !== undefined ? ` - Estoque: ${p.estoque}` : ''}</div>
        </div>
        <div class="item-admin__acoes">
          <button data-editar-produto="${p.id}">Editar</button>
          <label class="interruptor" title="${p.disponivel ? 'Desativar produto' : 'Ativar produto'}">
            <input type="checkbox" data-toggle-disponivel="${p.id}" ${p.disponivel ? 'checked' : ''}>
            <span class="interruptor__trilho"></span>
          </label>
          <button class="botao-perigo" data-excluir-produto="${p.id}">Excluir</button>
        </div>
      </div>
      <div class="item-admin__descricao-painel oculto" data-descricao-painel="${p.id}">
        ${p.descricao ? escaparHtmlAdmin(p.descricao) : 'Sem descricao cadastrada.'}
      </div>
    `).join('');

    lista.querySelectorAll('[data-editar-produto]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirModalProdutoAdmin(b.getAttribute('data-editar-produto'));
      });
    });
    lista.querySelectorAll('[data-excluir-produto]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        excluirProduto(b.getAttribute('data-excluir-produto'));
      });
    });
    lista.querySelectorAll('[data-toggle-disponivel]').forEach(input => {
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('change', () => {
        alternarDisponibilidadeProduto(input.getAttribute('data-toggle-disponivel'), input.checked);
      });
    });
    lista.querySelectorAll('.item-admin[data-produto-expandir]').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('button, label.interruptor, .drag-handle')) return;
        const id = item.getAttribute('data-produto-expandir');
        const painel = lista.querySelector(`[data-descricao-painel="${id}"]`);
        if (painel) painel.classList.toggle('oculto');
      });
    });

    configurarDragDropProdutos(lista);
  }

  renderizarProdutosDesativadosAdmin();
}

function renderizarProdutosDesativadosAdmin() {
  const lista = document.getElementById('lista-desativados-admin');
  const mensagemVazia = document.getElementById('mensagem-sem-desativados');
  const desativados = ESTADO.produtos.filter(p => !p.disponivel);
  document.getElementById('contador-desativados').textContent = `(${desativados.length})`;

  if (desativados.length === 0) {
    lista.innerHTML = '';
    mensagemVazia.classList.remove('oculto');
    return;
  }
  mensagemVazia.classList.add('oculto');

  lista.innerHTML = desativados.map(p => `
    <div class="produtos-sidebar__item">
      <img src="${p.foto_url || ''}" alt="">
      <div class="produtos-sidebar__item-info">
        <div class="produtos-sidebar__item-nome">${escaparHtmlAdmin(p.nome)}</div>
        <div class="produtos-sidebar__item-sub">${p.categoria_nome || 'Sem categoria'} - ${formatarMoedaAdmin(p.preco)}${p.estoque !== null && p.estoque !== undefined ? `<br>Qtd. restante: ${p.estoque}` : ''}</div>
      </div>
      <label class="interruptor" title="Ativar produto">
        <input type="checkbox" data-toggle-disponivel="${p.id}">
        <span class="interruptor__trilho"></span>
      </label>
    </div>
  `).join('');

  lista.querySelectorAll('[data-toggle-disponivel]').forEach(input => {
    input.addEventListener('change', () => {
      alternarDisponibilidadeProduto(input.getAttribute('data-toggle-disponivel'), input.checked);
    });
  });
}

async function alternarDisponibilidadeProduto(id, disponivel) {
  try {
    const fd = new FormData();
    fd.append('disponivel', disponivel);
    await apiAtualizarProduto(id, fd);
    await carregarTudo();
    renderizarProdutosAdmin();
    mostrarToast(disponivel ? 'Produto ativado.' : 'Produto desativado.');
  } catch (erro) {
    mostrarToast(erro.message, true);
    renderizarProdutosAdmin();
  }
}

function configurarDragDropProdutos(lista) {
  lista.querySelectorAll('.item-admin--drag[data-produto-drag-id]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcProdutoId = item.getAttribute('data-produto-drag-id');
      item.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      lista.querySelectorAll('.item-admin--drag').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      lista.querySelectorAll('.item-admin--drag').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-produto-drag-id');
      if (dragSrcProdutoId === targetId) return;

      const ordenados = [...ESTADO.produtos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const indiceSrc = ordenados.findIndex(p => p.id === dragSrcProdutoId);
      const indiceTarget = ordenados.findIndex(p => p.id === targetId);
      if (indiceSrc === -1 || indiceTarget === -1) return;

      const reordenados = [...ordenados];
      const [movido] = reordenados.splice(indiceSrc, 1);
      reordenados.splice(indiceTarget, 0, movido);

      try {
        await Promise.all(reordenados.map((p, i) => {
          if (p.ordem !== i) {
            const fd = new FormData();
            fd.append('ordem', i);
            return apiAtualizarProduto(p.id, fd);
          }
        }).filter(Boolean));
        await carregarTudo();
        renderizarProdutosAdmin();
        mostrarToast('Ordem dos produtos atualizada!');
      } catch (erro) {
        mostrarToast('Erro ao reordenar produtos.', true);
      }
    });
  });
}

let EVENTOS_PRODUTOS_CONFIGURADOS = false;

function configurarEventosProdutos() {
  if (EVENTOS_PRODUTOS_CONFIGURADOS) return;
  EVENTOS_PRODUTOS_CONFIGURADOS = true;

  document.getElementById('botao-novo-produto')?.addEventListener('click', () => abrirModalProdutoAdmin(null));
  document.getElementById('botao-filtro-categorias')?.addEventListener('click', abrirModalFiltroCategorias);
  document.getElementById('botao-limpar-filtro-categoria')?.addEventListener('click', () => {
    FILTRO_CATEGORIA_PRODUTOS = null;
    renderizarProdutosAdmin();
  });

  document.getElementById('botao-ler-codigo-barras')?.addEventListener('click', abrirLeitorCodigoBarras);
  document.querySelectorAll('[data-fechar-leitor-codigo-barras]').forEach(el => {
    el.addEventListener('click', fecharLeitorCodigoBarras);
  });

  document.getElementById('form-produto')?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('produto-id').value;
    const categoriaSelecionada = document.getElementById('produto-categoria').value;
    const formData = new FormData();
    formData.append('categoria_id', categoriaSelecionada);
    formData.append('nome', document.getElementById('produto-nome').value.trim());
    formData.append('codigo', document.getElementById('produto-codigo').value.trim());
    formData.append('descricao', document.getElementById('produto-descricao').value.trim());
    formData.append('preco', document.getElementById('produto-preco').value);
    formData.append('preco_promocional', document.getElementById('produto-preco-promo').value || '');
    formData.append('estoque', document.getElementById('produto-estoque').value || '');
    formData.append('disponivel', document.getElementById('produto-disponivel').checked);
    const arquivo = document.getElementById('produto-foto').files[0];
    if (arquivo) formData.append('imagem', arquivo);

    try {
      if (id) {
        await apiAtualizarProduto(id, formData);
      } else {
        await apiCriarProduto(formData);
      }
      await carregarTudo();
      renderizarProdutosAdmin();
      preencherSelectProdutosPromocao();
      mostrarToast('Produto salvo com sucesso!');
      fecharModaisAdmin();
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

function abrirModalFiltroCategorias() {
  const lista = document.getElementById('lista-categorias-filtro');
  const categorias = [...ESTADO.categorias].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const botaoTodas = `<button data-filtro-categoria-id="" class="${!FILTRO_CATEGORIA_PRODUTOS ? 'ativa' : ''}">Todas as categorias</button>`;
  const botoesCategorias = categorias.map(c => `
    <button data-filtro-categoria-id="${c.id}" class="${FILTRO_CATEGORIA_PRODUTOS === c.id ? 'ativa' : ''}">${escaparHtmlAdmin(c.nome)}</button>
  `).join('');

  lista.innerHTML = botaoTodas + botoesCategorias;

  lista.querySelectorAll('[data-filtro-categoria-id]').forEach(b => {
    b.addEventListener('click', () => {
      const idCategoria = b.getAttribute('data-filtro-categoria-id');
      FILTRO_CATEGORIA_PRODUTOS = idCategoria || null;
      renderizarProdutosAdmin();
      fecharModaisAdmin();
    });
  });

  document.getElementById('modal-filtro-categorias').classList.remove('oculto');
}

function abrirModalProdutoAdmin(id) {
  const produto = id ? ESTADO.produtos.find(p => p.id === id) : null;
  document.getElementById('titulo-modal-produto').textContent = produto ? 'Editar produto' : 'Novo produto';
  document.getElementById('produto-id').value = id || '';
  document.getElementById('produto-categoria').value = produto?.categoria_id || FILTRO_CATEGORIA_PRODUTOS || '';
  document.getElementById('produto-nome').value = produto?.nome || '';
  document.getElementById('produto-codigo').value = produto?.codigo || '';
  document.getElementById('produto-descricao').value = produto?.descricao || '';
  document.getElementById('produto-preco').value = produto?.preco || '';
  document.getElementById('produto-preco-promo').value = produto?.preco_promocional || '';
  document.getElementById('produto-estoque').value = (produto && produto.estoque !== null && produto.estoque !== undefined) ? produto.estoque : '';
  document.getElementById('produto-disponivel').checked = produto ? produto.disponivel : true;
  document.getElementById('produto-foto').value = '';
  document.getElementById('modal-produto-admin').classList.remove('oculto');
  document.getElementById('produto-nome').focus();
}

// =============================================
// LEITOR DE CODIGO DE BARRAS (camera)
// =============================================
let LEITOR_CODIGO_BARRAS = null;

async function abrirLeitorCodigoBarras() {
  const modal = document.getElementById('modal-leitor-codigo-barras');
  const erroEl = document.getElementById('leitor-codigo-barras-erro');
  erroEl.classList.add('oculto');
  modal.classList.remove('oculto');

  if (typeof ZXingBrowser === 'undefined' && typeof ZXing === 'undefined') {
    erroEl.textContent = 'Nao foi possivel carregar o leitor de codigo de barras. Verifique sua conexao com a internet.';
    erroEl.classList.remove('oculto');
    return;
  }

  try {
    const Leitor = (window.ZXingBrowser && window.ZXingBrowser.BrowserMultiFormatReader) || window.ZXing.BrowserMultiFormatReader;
    LEITOR_CODIGO_BARRAS = new Leitor();
    const videoEl = document.getElementById('video-leitor-codigo-barras');

    LEITOR_CODIGO_BARRAS.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoEl,
      (resultado, erro) => {
        if (resultado) {
          processarCodigoBarrasLido(resultado.getText());
        }
      }
    );
  } catch (erro) {
    erroEl.textContent = 'Nao foi possivel acessar a camera. Verifique as permissoes do navegador.';
    erroEl.classList.remove('oculto');
  }
}

function fecharLeitorCodigoBarras() {
  if (LEITOR_CODIGO_BARRAS) {
    try { LEITOR_CODIGO_BARRAS.reset(); } catch (e) { /* ignora */ }
    LEITOR_CODIGO_BARRAS = null;
  }
  document.getElementById('modal-leitor-codigo-barras').classList.add('oculto');
}

async function processarCodigoBarrasLido(codigo) {
  fecharLeitorCodigoBarras();

  const produtoExistente = ESTADO.produtos.find(p => p.codigo && p.codigo === codigo);
  if (produtoExistente) {
    const editar = confirm(`Ja existe um produto cadastrado com este codigo de barras: "${produtoExistente.nome}". Deseja abrir esse produto para editar?`);
    if (editar) {
      abrirModalProdutoAdmin(produtoExistente.id);
      return;
    }
  }

  document.getElementById('produto-codigo').value = codigo;
  mostrarToast('Codigo de barras lido: ' + codigo);

  // Tenta buscar dados do produto (nome/foto) numa base externa. Enquanto a
  // conexao nao estiver configurada (ver funcao abaixo), isso simplesmente
  // nao faz nada e o lojista preenche o resto manualmente, como ja acontecia.
  const dadosExternos = await buscarProdutoExternoPorCodigoBarras(codigo);
  if (dadosExternos) {
    if (dadosExternos.nome && !document.getElementById('produto-nome').value) {
      document.getElementById('produto-nome').value = dadosExternos.nome;
    }
    mostrarToast('Dados do produto preenchidos automaticamente.');
  }
}

// =============================================
// BUSCA EXTERNA DE PRODUTO POR CODIGO DE BARRAS
// =============================================
// Ainda NAO esta conectado a nenhuma API externa (de proposito -- ver
// conversa com o Claude). Assim que voce tiver uma chave de API, e so
// preencher CHAVE_API_CATALOGO_PRODUTOS abaixo e descomentar o bloco fetch.
//
// Opcao gratuita para comecar (sugerida): DotCompany, catalogo com 1,89
// milhao de produtos brasileiros. 25 consultas/dia de graca sem cadastro,
// e criando conta gratis (usa CNPJ) voce ganha 50 creditos de teste +
// chave "dc_test_" com uso ilimitado em modo sandbox (nunca cobra).
// Cadastro: https://erp.dotcompany.com.br/auth/register
// Documentacao interativa (testa no navegador): https://erp.dotcompany.com.br/api/v1/docs
// Depois de criar a conta e pegar a chave, me manda o endpoint exato que
// aparecer na documentacao (pode mudar) que eu conecto aqui em 2 minutos.
const CHAVE_API_CATALOGO_PRODUTOS = ''; // cole aqui a chave "dc_test_..." ou "dc_live_..." quando tiver

async function buscarProdutoExternoPorCodigoBarras(codigo) {
  if (!CHAVE_API_CATALOGO_PRODUTOS) return null;

  try {
    // Exemplo (confirme o endpoint exato na documentacao antes de usar):
    // const resposta = await fetch(`https://erp.dotcompany.com.br/api/v1/catalogo/buscar?q=${codigo}`, {
    //   headers: { Authorization: `Bearer ${CHAVE_API_CATALOGO_PRODUTOS}` }
    // });
    // const dados = await resposta.json();
    // if (dados.sucesso && dados.produto) {
    //   return { nome: dados.produto.nome, imagem_url: dados.produto.imagem_url };
    // }
    return null;
  } catch (erro) {
    console.error('Erro ao buscar produto na base externa:', erro);
    return null;
  }
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
// PROMOCOES COM DRAG AND DROP
// =============================================
let dragSrcPromocaoId = null;

function renderizarPromocoesAdmin() {
  const lista = document.getElementById('lista-promocoes-admin');
  const ativas = ESTADO.promocoes.filter(p => p.ativo !== false);
  const desativadas = ESTADO.promocoes.filter(p => p.ativo === false);
  document.getElementById('contador-promocoes').textContent = `(${ativas.length})`;
  document.getElementById('contador-promocoes-desativadas').textContent = `(${desativadas.length})`;

  if (ativas.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma promocao ativa.</div>';
  } else {
    lista.innerHTML = montarItensPromocao([...ativas].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    configurarItensPromocao(lista);
    configurarDragDropPromocoes(lista);
  }

  const blocoDesativadas = document.getElementById('bloco-promocoes-desativadas');
  blocoDesativadas.innerHTML = desativadas.length === 0
    ? '<div class="lista-vazia">Nenhuma promocao desativada.</div>'
    : montarItensPromocao(desativadas);
  configurarItensPromocao(blocoDesativadas);
}

function montarItensPromocao(promocoes) {
  return promocoes.map(promo => {
    const produtoVinculado = promo.produto_id ? ESTADO.produtos.find(p => p.id === promo.produto_id) : null;
    return `
    <div class="item-admin item-admin--drag ${promo.ativo === false ? 'item-admin--indisponivel' : ''}" draggable="true" data-promocao-drag-id="${promo.id}" data-promocao-expandir="${promo.id}">
      <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
      <img class="item-admin__imagem" src="${promo.imagem_url || ''}" alt="">
      <div class="item-admin__info">
        <div class="item-admin__titulo">${escaparHtmlAdmin(promo.titulo)}</div>
        <div class="item-admin__subtitulo">${produtoVinculado ? formatarMoedaAdmin(produtoVinculado.preco) : ''}</div>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-promocao="${promo.id}">Editar</button>
        <label class="interruptor" title="${promo.ativo === false ? 'Ativar promocao' : 'Desativar promocao'}">
          <input type="checkbox" data-toggle-promocao="${promo.id}" ${promo.ativo !== false ? 'checked' : ''}>
          <span class="interruptor__trilho"></span>
        </label>
        <button class="botao-perigo" data-excluir-promocao="${promo.id}">Excluir</button>
      </div>
    </div>
    <div class="item-admin__descricao-painel oculto" data-descricao-painel-promocao="${promo.id}">
      ${promo.descricao ? escaparHtmlAdmin(promo.descricao) : 'Sem descricao cadastrada.'}
    </div>
  `;
  }).join('');
}

function configurarItensPromocao(container) {
  container.querySelectorAll('[data-editar-promocao]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalPromocao(b.getAttribute('data-editar-promocao'));
    });
  });
  container.querySelectorAll('[data-excluir-promocao]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      excluirPromocao(b.getAttribute('data-excluir-promocao'));
    });
  });
  container.querySelectorAll('[data-toggle-promocao]').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => alternarAtivoPromocao(input.getAttribute('data-toggle-promocao'), input.checked));
  });
  container.querySelectorAll('.item-admin[data-promocao-expandir]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('button, label.interruptor, .drag-handle')) return;
      const id = item.getAttribute('data-promocao-expandir');
      const painel = container.querySelector(`[data-descricao-painel-promocao="${id}"]`);
      if (painel) painel.classList.toggle('oculto');
    });
  });
}

async function alternarAtivoPromocao(id, ativo) {
  try {
    const fd = new FormData();
    fd.append('ativo', ativo);
    await apiAtualizarPromocao(id, fd);
    await carregarTudo();
    renderizarPromocoesAdmin();
    mostrarToast(ativo ? 'Promocao ativada.' : 'Promocao desativada.');
  } catch (erro) {
    mostrarToast(erro.message, true);
    renderizarPromocoesAdmin();
  }
}

function configurarDragDropPromocoes(lista) {
  lista.querySelectorAll('.item-admin--drag[data-promocao-drag-id]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcPromocaoId = item.getAttribute('data-promocao-drag-id');
      item.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      lista.querySelectorAll('.item-admin--drag').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      lista.querySelectorAll('.item-admin--drag').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-promocao-drag-id');
      if (dragSrcPromocaoId === targetId) return;

      const ordenadas = [...ESTADO.promocoes].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const indiceSrc = ordenadas.findIndex(p => p.id === dragSrcPromocaoId);
      const indiceTarget = ordenadas.findIndex(p => p.id === targetId);
      if (indiceSrc === -1 || indiceTarget === -1) return;

      const reordenadas = [...ordenadas];
      const [movida] = reordenadas.splice(indiceSrc, 1);
      reordenadas.splice(indiceTarget, 0, movida);

      try {
        // So enviamos "ordem" -- o backend preserva produto_id/datas quando o campo nao vem na requisicao.
        await Promise.all(reordenadas.map((p, i) => {
          if (p.ordem !== i) {
            const fd = new FormData();
            fd.append('ordem', i);
            return apiAtualizarPromocao(p.id, fd);
          }
        }).filter(Boolean));
        await carregarTudo();
        renderizarPromocoesAdmin();
        mostrarToast('Ordem das promocoes atualizada!');
      } catch (erro) {
        mostrarToast('Erro ao reordenar promocoes.', true);
      }
    });
  });
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
  atualizarContagemPedidos();
}

async function atualizarContagemPedidos() {
  try {
    const contagem = await apiContarPedidos();
    document.querySelectorAll('[data-contador]').forEach(span => {
      const chave = span.getAttribute('data-contador');
      const valor = contagem[chave] || 0;
      span.textContent = `(${valor})`;
    });
  } catch (erro) {
    // Silencioso: se a contagem falhar, os botoes de filtro continuam funcionando normalmente.
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
    const itens = pedido.itens
      ? pedido.itens.map(i => `${i.quantidade}x ${escaparHtmlAdmin(i.nome)}`).join(', ')
      : 'Itens nao disponiveis';
    const valorLinha = pedido.total === null
      ? 'Valor oculto (sem permissao)'
      : `${formatarMoedaAdmin(pedido.total)} - ${pedido.forma_pagamento.toUpperCase()} (${pedido.status_pagamento})`;
    const data = new Date(pedido.criado_em).toLocaleString('pt-BR');
    return `
      <div class="item-admin" style="align-items: flex-start;">
        <div class="item-admin__info">
          <div class="item-admin__titulo">
            ${escaparHtmlAdmin(pedido.cliente_nome)}
            <span class="badge-status badge-status--${pedido.status_pedido}">${STATUS_PEDIDO_LABEL[pedido.status_pedido]}</span>
          </div>
          <div class="item-admin__subtitulo">${itens}</div>
          <div class="item-admin__subtitulo">${data} - ${valorLinha}</div>
          <div class="item-admin__subtitulo">Tel: ${escaparHtmlAdmin(pedido.cliente_telefone)}</div>
        </div>
        <select class="campo-select" style="width:auto;" data-mudar-status="${pedido.id}">
          ${Object.entries(STATUS_PEDIDO_LABEL)
            .filter(([valor]) => valor !== 'cancelado' || temPermissao('cancelar_pedidos'))
            .map(([valor, label]) =>
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

// =============================================
// CAIXA GERAL
// =============================================
function configurarEventosCaixaGeral() {
  const botao = document.getElementById('botao-filtrar-caixa');
  if (botao) botao.addEventListener('click', carregarCaixaGeral);
}

async function carregarCaixaGeral() {
  const resumo = document.getElementById('resumo-caixa-geral');
  const lista = document.getElementById('lista-caixa-geral');
  if (!resumo || !lista) return;

  resumo.innerHTML = '';
  lista.innerHTML = '<div class="lista-vazia">Carregando...</div>';

  try {
    const dataInicio = document.getElementById('caixa-data-inicio').value;
    const dataFim = document.getElementById('caixa-data-fim').value;
    const dados = await apiObterCaixaGeral(dataInicio, dataFim);
    renderizarCaixaGeral(dados);
  } catch (erro) {
    lista.innerHTML = '<div class="lista-vazia">Erro ao carregar o caixa geral.</div>';
  }
}

function renderizarCaixaGeral(dados) {
  const resumo = document.getElementById('resumo-caixa-geral');
  const lista = document.getElementById('lista-caixa-geral');

  resumo.innerHTML = `
    <div class="resumo-caixa-geral__cartao">
      <div class="resumo-caixa-geral__rotulo">Total de entregas concluidas</div>
      <div class="resumo-caixa-geral__valor">${dados.quantidade}</div>
    </div>
    <div class="resumo-caixa-geral__cartao">
      <div class="resumo-caixa-geral__rotulo">Valor total</div>
      <div class="resumo-caixa-geral__valor">${formatarMoedaAdmin(dados.total_geral)}</div>
    </div>
    ${Object.entries(dados.total_por_tipo || {}).map(([tipo, valor]) => `
      <div class="resumo-caixa-geral__cartao">
        <div class="resumo-caixa-geral__rotulo">Total (${tipo})</div>
        <div class="resumo-caixa-geral__valor">${formatarMoedaAdmin(valor)}</div>
      </div>
    `).join('')}
  `;

  if (!dados.pedidos || dados.pedidos.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma entrega concluida no periodo.</div>';
    return;
  }

  lista.innerHTML = dados.pedidos.map(pedido => {
    const data = new Date(pedido.criado_em).toLocaleString('pt-BR');
    return `
      <div class="item-admin">
        <div class="item-admin__info">
          <div class="item-admin__titulo">${escaparHtmlAdmin(pedido.cliente_nome)}</div>
          <div class="item-admin__subtitulo">${data} - ${pedido.forma_pagamento.toUpperCase()} - ${pedido.tipo_pedido || 'entrega'}</div>
        </div>
        <div class="item-admin__titulo">${formatarMoedaAdmin(pedido.total)}</div>
      </div>
    `;
  }).join('');
}

// =============================================
// FUNCIONARIOS
// =============================================
const NOMES_CARGO = {
  proprietario: 'Proprietario', administrador: 'Administrador', gerente: 'Gerente', caixa: 'Caixa',
  garcom: 'Garcom', colaborador: 'Colaborador'
};

let dragSrcFuncionarioId = null;

function renderizarFuncionariosAdmin() {
  const lista = document.getElementById('lista-funcionarios-admin');
  if (!ESTADO.funcionarios || ESTADO.funcionarios.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhum funcionario cadastrado ainda.</div>';
    return;
  }

  const ordenados = [...ESTADO.funcionarios].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  lista.innerHTML = ordenados.map(f => `
    <div class="item-admin" data-funcionario-drag-id="${f.id}">
      <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
      <div class="item-admin__info">
        <div class="item-admin__titulo">${escaparHtmlAdmin(f.nome)} ${!f.ativo ? '(inativo)' : ''}</div>
        <div class="item-admin__subtitulo">${NOMES_CARGO[f.cargo] || f.cargo} - ${escaparHtmlAdmin(f.email)}</div>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-funcionario="${f.id}">Editar</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-editar-funcionario]').forEach(b => {
    b.addEventListener('click', () => abrirModalEditarFuncionario(b.getAttribute('data-editar-funcionario')));
  });

  configurarDragDropFuncionarios(lista);
}

function configurarDragDropFuncionarios(lista) {
  lista.querySelectorAll('.item-admin[data-funcionario-drag-id] .drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', (evento) => {
      evento.preventDefault();
      const item = handle.closest('.item-admin[data-funcionario-drag-id]');
      const indiceOrigem = Array.from(lista.children).indexOf(item);
      item.classList.add('sendo-arrastado');

      const aoMover = (ev) => {
        const elementoAlvo = document.elementFromPoint(ev.clientX, ev.clientY);
        const itemAlvo = elementoAlvo ? elementoAlvo.closest('.item-admin[data-funcionario-drag-id]') : null;
        if (itemAlvo && itemAlvo !== item) {
          const indiceAlvo = Array.from(lista.children).indexOf(itemAlvo);
          const indiceAtual = Array.from(lista.children).indexOf(item);
          if (indiceAlvo < indiceAtual) lista.insertBefore(item, itemAlvo);
          else lista.insertBefore(item, itemAlvo.nextSibling);
        }
      };

      const aoSoltar = async () => {
        document.removeEventListener('pointermove', aoMover);
        document.removeEventListener('pointerup', aoSoltar);
        item.classList.remove('sendo-arrastado');

        const novaOrdemIds = Array.from(lista.children).map(el => el.getAttribute('data-funcionario-drag-id'));
        const indiceFinal = novaOrdemIds.indexOf(item.getAttribute('data-funcionario-drag-id'));
        if (indiceFinal === indiceOrigem) return;

        try {
          await Promise.all(novaOrdemIds.map((id, i) => {
            const f = ESTADO.funcionarios.find(x => x.id === id);
            if (f && f.ordem !== i) return apiAtualizarFuncionario(id, { ordem: i });
          }).filter(Boolean));
          ESTADO.funcionarios = await apiListarFuncionarios();
          renderizarFuncionariosAdmin();
          mostrarToast('Ordem atualizada!');
        } catch (erro) {
          mostrarToast(erro.message || 'Erro ao reordenar funcionarios.', true);
          ESTADO.funcionarios = await apiListarFuncionarios();
          renderizarFuncionariosAdmin();
        }
      };

      document.addEventListener('pointermove', aoMover);
      document.addEventListener('pointerup', aoSoltar);
    });
  });
}

function alternarCaixasAdministrador(selectId, grupoId) {
  const select = document.getElementById(selectId);
  const grupo = document.getElementById(grupoId);
  const atualizar = () => {
    const ehAdmin = select.value === 'administrador';
    grupo.classList.toggle('desabilitada', ehAdmin);
    grupo.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = ehAdmin; });
  };
  select.addEventListener('change', atualizar);
  atualizar();
}

function coletarPermissoesMarcadas(grupoId) {
  return Array.from(document.querySelectorAll(`#${grupoId} input[type="checkbox"]:checked`)).map(cb => cb.value);
}

let EVENTOS_FUNCIONARIOS_CONFIGURADOS = false;
// Mascaras padronizadas -- mesmo formato usado no checkout do cliente final:
// telefone "(99) 999999999" e CPF "999.999.999-99".
function aplicarMascaraTelefoneAdmin(campo) {
  if (!campo || campo.dataset.mascara) return;
  campo.dataset.mascara = '1';
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 11);
    if (numeros.length === 0) this.value = '';
    else if (numeros.length <= 2) this.value = '(' + numeros;
    else this.value = '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2);
  });
}

function aplicarMascaraCpfAdmin(campo) {
  if (!campo || campo.dataset.mascara) return;
  campo.dataset.mascara = '1';
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 11);
    let valor = numeros;
    if (numeros.length > 3) valor = numeros.substring(0, 3) + '.' + numeros.substring(3);
    if (numeros.length > 6) valor = valor.substring(0, 7) + '.' + numeros.substring(6);
    if (numeros.length > 9) valor = valor.substring(0, 11) + '-' + numeros.substring(9);
    this.value = valor;
  });
}

function configurarFuncionarios() {
  if (EVENTOS_FUNCIONARIOS_CONFIGURADOS) return;
  EVENTOS_FUNCIONARIOS_CONFIGURADOS = true;

  alternarCaixasAdministrador('func-cargo', 'grupo-permissoes-funcionario');
  alternarCaixasAdministrador('edit-func-cargo', 'edit-grupo-permissoes');

  aplicarMascaraTelefoneAdmin(document.getElementById('func-telefone'));
  aplicarMascaraTelefoneAdmin(document.getElementById('edit-func-telefone'));
  aplicarMascaraTelefoneAdmin(document.getElementById('edit-func-celular'));
  aplicarMascaraCpfAdmin(document.getElementById('edit-func-cpf'));

  document.querySelectorAll('.botao-marcar-todas').forEach(botao => {
    botao.addEventListener('click', () => {
      const grupoId = botao.getAttribute('data-alvo-permissoes');
      const caixas = document.querySelectorAll(`#${grupoId} input[type="checkbox"]`);
      const todasMarcadas = Array.from(caixas).every(cb => cb.checked);
      caixas.forEach(cb => { cb.checked = !todasMarcadas; });
    });
  });

  document.getElementById('form-novo-funcionario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = evento.target.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      await apiCriarFuncionario({
        nome: document.getElementById('func-nome').value.trim(),
        email: document.getElementById('func-email').value.trim(),
        username: document.getElementById('func-username').value.trim() || null,
        telefone: document.getElementById('func-telefone').value.trim() || null,
        senha: document.getElementById('func-senha').value,
        cargo: document.getElementById('func-cargo').value,
        permissoes: coletarPermissoesMarcadas('grupo-permissoes-funcionario')
      });
      evento.target.reset();
      ESTADO.funcionarios = await apiListarFuncionarios();
      renderizarFuncionariosAdmin();
      mostrarToast('Funcionario cadastrado com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    } finally {
      botao.disabled = false;
    }
  });

  document.getElementById('botao-salvar-edicao-funcionario').addEventListener('click', async () => {
    const id = document.getElementById('edit-func-id').value;
    try {
      await apiAtualizarFuncionario(id, {
        nome: document.getElementById('edit-func-nome').value.trim(),
        email: document.getElementById('edit-func-email').value.trim(),
        telefone: document.getElementById('edit-func-telefone').value.trim() || null,
        cargo: document.getElementById('edit-func-cargo').value,
        ativo: document.getElementById('edit-func-ativo').checked,
        permissoes: coletarPermissoesMarcadas('edit-grupo-permissoes')
      });
      ESTADO.funcionarios = await apiListarFuncionarios();
      renderizarFuncionariosAdmin();
      fecharModaisAdmin();
      mostrarToast('Funcionario atualizado com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });

  document.getElementById('botao-salvar-cadastro-completo-funcionario').addEventListener('click', async () => {
    const id = document.getElementById('edit-func-id').value;
    try {
      await apiAtualizarCadastroCompletoFuncionario(id, {
        celular: document.getElementById('edit-func-celular').value.trim(),
        telefone: document.getElementById('edit-func-telefone').value.trim() || null,
        data_nascimento: document.getElementById('edit-func-nascimento').value || null,
        rg: document.getElementById('edit-func-rg').value.trim() || null,
        cpf: document.getElementById('edit-func-cpf').value.trim() || null
      });
      mostrarToast('Cadastro completo salvo com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });

  document.getElementById('botao-resetar-senha-funcionario').addEventListener('click', async () => {
    const id = document.getElementById('edit-func-id').value;
    const novaSenha = prompt('Digite a nova senha para esse funcionario (minimo 6 caracteres):');
    if (!novaSenha) return;
    if (novaSenha.length < 6) { mostrarToast('A senha deve ter pelo menos 6 caracteres.', true); return; }
    try {
      await apiTrocarSenhaFuncionario(id, { novaSenha });
      mostrarToast('Senha redefinida com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });

  document.getElementById('botao-excluir-funcionario').addEventListener('click', async () => {
    const id = document.getElementById('edit-func-id').value;
    const nome = document.getElementById('edit-func-nome').value;
    if (!confirm(`Tem certeza que deseja excluir "${nome}" definitivamente? Essa acao nao pode ser desfeita.`)) return;

    const senha = prompt('Digite SUA senha (administrador) para confirmar a exclusao:');
    if (!senha) return;

    try {
      await apiExcluirFuncionario(id, senha);
      ESTADO.funcionarios = await apiListarFuncionarios();
      renderizarFuncionariosAdmin();
      fecharModaisAdmin();
      mostrarToast('Funcionario excluido com sucesso.');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

function abrirModalEditarFuncionario(id) {
  const f = ESTADO.funcionarios.find(x => x.id === id);
  if (!f) return;
  document.getElementById('edit-func-id').value = f.id;
  document.getElementById('edit-func-nome').value = f.nome;
  document.getElementById('edit-func-email').value = f.email;
  document.getElementById('edit-func-telefone').value = f.telefone || '';
  document.getElementById('edit-func-cargo').value = f.cargo;
  document.getElementById('edit-func-ativo').checked = f.ativo;

  const grupo = document.getElementById('edit-grupo-permissoes');
  grupo.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = (f.permissoes || []).includes(cb.value);
  });
  grupo.classList.toggle('desabilitada', f.cargo === 'administrador');

  // O bloco de cadastro completo (dados pessoais sensiveis) so aparece
  // para quem esta logado como proprietario ou administrador.
  const cargoSessao = sessaoAtual().cargo;
  const podeVerCadastroCompleto = cargoSessao === 'proprietario' || cargoSessao === 'administrador';
  const blocoCompleto = document.getElementById('bloco-cadastro-completo-funcionario');
  blocoCompleto.classList.toggle('oculto', !podeVerCadastroCompleto);
  if (podeVerCadastroCompleto) {
    document.getElementById('edit-func-celular').value = f.celular || '';
    document.getElementById('edit-func-nascimento').value = f.data_nascimento ? f.data_nascimento.substring(0, 10) : '';
    document.getElementById('edit-func-rg').value = f.rg || '';
    document.getElementById('edit-func-cpf').value = f.cpf || '';
  }

  document.getElementById('modal-editar-funcionario').classList.remove('oculto');
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

// ===================================================================
// Paleta de cores padrao da marca (Mimenu) - codigos exatos respeitados
// ===================================================================
const PALETA_CORES_PADRAO = ['#0E7C3F', '#FFC107', '#212121', '#EBEBEB', '#90907F', '#374156', '#E63946', '#1D3557', '#D6249F'];
let PALETA_CORES_CONFIGURADA = false;

function montarPaletaCores() {
  if (PALETA_CORES_CONFIGURADA) return;
  PALETA_CORES_CONFIGURADA = true;

  document.querySelectorAll('.paleta-cores').forEach(container => {
    const alvoId = container.getAttribute('data-paleta-para');
    container.innerHTML = PALETA_CORES_PADRAO.map(hex => `
      <button type="button" class="paleta-cores__swatch" style="background:${hex}" data-hex="${hex}" title="${hex}"></button>
    `).join('');
    container.querySelectorAll('.paleta-cores__swatch').forEach(botao => {
      botao.addEventListener('click', () => {
        const input = document.getElementById(alvoId);
        input.value = botao.getAttribute('data-hex');
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('change'));
      });
    });
  });
}

// ===================================================================
// Preview ao vivo da fonte escolhida na aba Aparencia
// ===================================================================
let FONTE_PREVIEW_CONFIGURADA = false;

function configurarPreviewFonte() {
  if (FONTE_PREVIEW_CONFIGURADA) return;
  FONTE_PREVIEW_CONFIGURADA = true;

  const select = document.getElementById('campo-fonte');
  const preview = document.getElementById('fonte-preview');

  function atualizar() {
    const fonte = select.value || 'Poppins';
    preview.style.fontFamily = `'${fonte}', sans-serif`;
    if (FONTES_GOOGLE_ADMIN[fonte] && !document.getElementById(`fonte-link-${fonte}`)) {
      const link = document.createElement('link');
      link.id = `fonte-link-${fonte}`;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${FONTES_GOOGLE_ADMIN[fonte]}&display=swap`;
      document.head.appendChild(link);
    }
  }

  select.addEventListener('change', atualizar);
  atualizar();
}

const FONTES_GOOGLE_ADMIN = {
  'Poppins': 'Poppins:wght@400;600;700;800',
  'Playfair Display': 'Playfair+Display:wght@500;700;800',
  'Roboto': 'Roboto:wght@400;500;700;900',
  'Montserrat': 'Montserrat:wght@400;600;700;800',
  'Lato': 'Lato:wght@400;700;900',
  'Inter': 'Inter:wght@400;500;600;700;800',
  'Nunito': 'Nunito:wght@400;600;700;800',
  'Quicksand': 'Quicksand:wght@400;600;700',
  'Raleway': 'Raleway:wght@400;600;700;800',
  'Work Sans': 'Work+Sans:wght@400;500;600;700',
  'DM Sans': 'DM+Sans:wght@400;500;700',
  'Merriweather': 'Merriweather:wght@400;700;900',
  'Oswald': 'Oswald:wght@400;500;600;700'
};
