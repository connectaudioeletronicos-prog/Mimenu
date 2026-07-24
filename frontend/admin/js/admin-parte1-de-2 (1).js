// Captura qualquer erro nao tratado (incluindo dentro de Promises) e ao
// menos deixa no console (F12) -- sem isso, um erro dentro de uma funcao
// async sem try/catch proprio falha em silencio pro usuario, sem deixar
// nenhuma pista de diagnostico.
window.addEventListener('error', (evento) => {
  console.error('Erro nao tratado no painel:', evento.error || evento.message);
});
window.addEventListener('unhandledrejection', (evento) => {
  console.error('Promise rejeitada sem tratamento no painel:', evento.reason);
});

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
  try {
    configurarLogin();
    configurarLoginFuncionario();
    configurarMenu();
    configurarBotoesOlho();
    configurarEsqueciSenha();
    configurarTrocarSenha();
    configurarFuncionarios();
    if (obterToken()) mostrarPainel();
  } catch (erro) {
    // Se algo aqui quebrar, ao menos fica registrado no console (F12) em
    // vez de travar a pagina inteira em silencio sem nenhuma pista.
    console.error('Erro ao iniciar o painel administrativo:', erro);
  }
}

// =============================================
// AVISOS SONOROS DO DASHBOARD
// Campainha: toca quando um pedido novo chega.
// Bip: toca quando a cozinha marca um pedido como pronto.
// Gerados via Web Audio API (nao depende de nenhum arquivo de audio).
// =============================================
let AUDIO_CTX_DASHBOARD = null;

function obterAudioCtxDashboard() {
  if (!AUDIO_CTX_DASHBOARD) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    AUDIO_CTX_DASHBOARD = new AudioCtor();
  }
  if (AUDIO_CTX_DASHBOARD.state === 'suspended') AUDIO_CTX_DASHBOARD.resume();
  return AUDIO_CTX_DASHBOARD;
}

// A maioria dos navegadores so libera audio depois de uma interacao do
// usuario. Esse listener "destrava" o contexto de audio no primeiro clique
// em qualquer lugar do painel, pra os avisos sonoros ja funcionarem depois.
document.addEventListener('click', () => { try { obterAudioCtxDashboard(); } catch (e) {} }, { once: true });

function tocarTomDashboard(frequencia, duracaoMs, tipoOnda, volume, atrasoSegundos) {
  const ctx = obterAudioCtxDashboard();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = tipoOnda || 'sine';
  osc.frequency.value = frequencia;
  ganho.gain.value = volume;
  osc.connect(ganho).connect(ctx.destination);
  const inicio = ctx.currentTime + (atrasoSegundos || 0);
  osc.start(inicio);
  ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracaoMs / 1000);
  osc.stop(inicio + duracaoMs / 1000 + 0.02);
}

// Campainha (pedido novo recebido): dois tons, tipo "ding-dong".
function tocarCampainhaPedidoNovo() {
  tocarTomDashboard(880, 260, 'sine', 0.45, 0);
  tocarTomDashboard(659, 340, 'sine', 0.45, 0.3);
}

// Bip (cozinha marcou o pedido como pronto): tres bips curtos e agudos.
function tocarBipPedidoPronto() {
  tocarTomDashboard(1046, 120, 'square', 0.35, 0);
  tocarTomDashboard(1046, 120, 'square', 0.35, 0.18);
  tocarTomDashboard(1046, 160, 'square', 0.35, 0.36);
}

// =============================================
// MONITORAMENTO DE PEDIDOS (poll) -- dispara os avisos sonoros acima
// assim que detecta um pedido novo ou um pedido marcado como pronto.
// =============================================
let INTERVALO_MONITORAMENTO_PEDIDOS = null;
let PRIMEIRA_VERIFICACAO_PEDIDOS = true;
const PEDIDOS_NOVOS_ALERTADOS = new Set();
const PEDIDOS_PRONTOS_ALERTADOS = new Set();

function iniciarMonitoramentoPedidos() {
  if (INTERVALO_MONITORAMENTO_PEDIDOS) return;
  verificarNovidadesPedidos();
  INTERVALO_MONITORAMENTO_PEDIDOS = setInterval(verificarNovidadesPedidos, 15000);
}

async function verificarNovidadesPedidos() {
  try {
    const pedidos = await apiListarPedidos('');
    let tocarCampainha = false;
    let tocarBip = false;

    pedidos.forEach(pedido => {
      if (pedido.status_pedido === 'novo' && !PEDIDOS_NOVOS_ALERTADOS.has(pedido.id)) {
        PEDIDOS_NOVOS_ALERTADOS.add(pedido.id);
        if (!PRIMEIRA_VERIFICACAO_PEDIDOS) tocarCampainha = true;
      }
      if (pedido.status_pedido === 'pronto' && !PEDIDOS_PRONTOS_ALERTADOS.has(pedido.id)) {
        PEDIDOS_PRONTOS_ALERTADOS.add(pedido.id);
        if (!PRIMEIRA_VERIFICACAO_PEDIDOS) tocarBip = true;
      }
    });

    if (tocarCampainha) tocarCampainhaPedidoNovo();
    if (tocarBip) tocarBipPedidoPronto();
    PRIMEIRA_VERIFICACAO_PEDIDOS = false;

    atualizarContagemPedidos();
    const abaPedidos = document.getElementById('aba-pedidos');
    if (abaPedidos && !abaPedidos.classList.contains('oculto')) carregarPedidos();
  } catch (erro) {
    // Silencioso: uma falha pontual no monitoramento nao deve incomodar o usuario.
  }
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
    iniciarMonitoramentoPedidos();
  } catch (erro) {
    console.error('Erro ao carregar o painel:', erro);
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
    construtor: 'gerenciar_cardapio',
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

  document.getElementById('botao-novo-pedido-manual')?.classList.toggle('oculto', !temPermissao('criar_pedidos'));
}

function configurarMenu() {
  document.getElementById('botao-novo-pedido-manual')?.addEventListener('click', abrirModalNovoPedido);
  document.getElementById('botao-confirmar-novo-pedido')?.addEventListener('click', confirmarNovoPedidoManual);

  document.querySelectorAll('.painel__menu-item[data-aba]').forEach(botao => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
      document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
      botao.classList.add('ativo');
      const aba = botao.getAttribute('data-aba');
      document.getElementById(`aba-${aba}`).classList.remove('oculto');
      if (aba === 'pedidos') carregarPedidos();
      if (aba === 'caixa-geral') carregarCaixaGeral();
      if (aba === 'funcionarios') {
        mostrarVistaEquipe();
        renderizarFuncionariosAdmin();
        carregarEquipeOperacional();
      }
      if (aba === 'construtor') renderizarConstrutorPagina();
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
}

function abrirModalCategoriasDesativadas() {
  const desativadas = ESTADO.categorias.filter(c => c.ativo === false);
  document.getElementById('titulo-modal-desativados').textContent = 'Categorias desativadas';
  const conteudo = document.getElementById('lista-desativados-modal');
  conteudo.innerHTML = desativadas.length === 0
    ? '<div class="lista-vazia">Nenhuma categoria desativada.</div>'
    : montarItensCategoria(desativadas);
  configurarItensCategoria(conteudo);
  document.getElementById('modal-desativados').classList.remove('oculto');
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
    if (!document.getElementById('modal-desativados').classList.contains('oculto') &&
        document.getElementById('titulo-modal-desativados').textContent === 'Categorias desativadas') {
      abrirModalCategoriasDesativadas();
    }
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
  document.getElementById('botao-ver-categorias-desativadas')?.addEventListener('click', abrirModalCategoriasDesativadas);

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
