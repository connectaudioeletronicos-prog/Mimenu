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
  arquivosPendentes: { logo: null, logoApps: null, banner: null }
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

// Badge de alerta de estoque -- roda em paralelo ao monitoramento de
// pedidos, so que num intervalo mais espacado (nao e algo tao urgente
// quanto pedido novo). Atualiza o contador vermelho no menu mesmo que o
// lojista nunca abra a tela de Estoque.
let INTERVALO_MONITORAMENTO_ESTOQUE = null;
function iniciarMonitoramentoAlertasEstoque() {
  if (INTERVALO_MONITORAMENTO_ESTOQUE) return;
  atualizarContadoresMenu();
  INTERVALO_MONITORAMENTO_ESTOQUE = setInterval(atualizarContadoresMenu, 60000);
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

// Icones de olho (SVG, sem emoji) usados no toggle de mostrar/ocultar
// senha em toda a tela de login -- antes usava o emoji de macaquinho
// (🙈) quando a senha ficava visivel, que o Lima nao gostou. Agora e
// sempre um icone de olho: aberto = senha oculta (clique pra mostrar),
// fechado/riscado = senha visivel (clique pra ocultar).
const ICONE_OLHO_ABERTO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONE_OLHO_FECHADO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function configurarBotoesOlho() {
  document.querySelectorAll('.botao-olho').forEach(botao => {
    botao.addEventListener('click', () => {
      const input = document.getElementById(botao.getAttribute('data-alvo-senha'));
      if (!input) return;
      const oculta = input.type === 'password';
      input.type = oculta ? 'text' : 'password';
      botao.innerHTML = oculta ? ICONE_OLHO_FECHADO : ICONE_OLHO_ABERTO;
      botao.setAttribute('aria-label', oculta ? 'Ocultar senha' : 'Mostrar senha');
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
      const dados = await apiSolicitarRecuperacaoSenha(email);
      sucessoEl.textContent = dados.mensagem || 'Um e-mail de recuperacao de senha foi enviado para seu e-mail cadastrado.';
      sucessoEl.classList.remove('oculto');
    } catch (erro) {
      erroEl.textContent = erro.message || 'Nao foi possivel enviar o e-mail de recuperacao de senha, por favor entrar em contato com o suporte.';
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
    iniciarMonitoramentoAlertasEstoque();
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

  // Badge de alerta de estoque -- conta quantas notificacoes (esgotado /
  // proximo do limite) chegaram nas ultimas 24h, pra aparecer direto no
  // menu sem precisar entrar na tela de Estoque pra descobrir. Antes disso
  // o alerta so existia "escondido" dentro do Painel do Estoque.
  if (temPermissao('gerenciar_estoque') && typeof apiEstoqueNotificacoes === 'function') {
    apiEstoqueNotificacoes()
      .then(lista => {
        const ha24h = Date.now() - 24 * 60 * 60 * 1000;
        const recentes = (lista || []).filter(n => new Date(n.criado_em).getTime() > ha24h);
        document.querySelectorAll('[data-menu-contador="estoque-alertas"], [data-menu-contador="estoque-alertas-config"]').forEach(el => {
          el.textContent = recentes.length > 0 ? recentes.length : '';
          el.classList.toggle('painel__menu-contador--alerta', recentes.length > 0);
        });
      })
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
    'caixa-geral': 'ver_caixa_geral',
    atendimento: 'criar_pedidos',
    configuracoes: 'gerenciar_conta',
    reservas: 'gerenciar_conta',
    estoque: 'gerenciar_estoque'
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
  if (!abaAtivaAtual) {
    // Se recarregou a pagina (F5) ainda logado, volta pra ultima aba usada
    // -- so cai na "primeiraVisivel" (padrao) se nunca tiver navegado antes
    // ou se a aba salva nao existir/nao estiver mais visivel (permissao mudou).
    const ultimaAba = sessionStorage.getItem('admin_ultima_aba');
    const botaoUltimaAba = ultimaAba && document.querySelector(`.painel__menu-item[data-aba="${ultimaAba}"]:not(.oculto)`);
    if (botaoUltimaAba) {
      botaoUltimaAba.click();
    } else if (primeiraVisivel) {
      document.querySelector(`.painel__menu-item[data-aba="${primeiraVisivel}"]`).click();
    }
  }

  document.getElementById('botao-novo-pedido-manual')?.classList.toggle('oculto', !temPermissao('criar_pedidos'));

  // Reservas so aparece se o lojista tiver ligado o recurso em Configuracoes.
  const reservaAtiva = ESTADO.estabelecimento && ESTADO.estabelecimento.reserva_mesa_ativa;
  document.getElementById('menu-item-reservas')?.classList.toggle('oculto', !(reservaAtiva && temPermissao('gerenciar_conta')));
}

function configurarMenu() {
  document.getElementById('botao-novo-pedido-manual')?.addEventListener('click', () => {
    document.querySelector('.painel__menu-item[data-aba="atendimento"]')?.click();
  });
  document.getElementById('botao-confirmar-novo-pedido')?.addEventListener('click', confirmarNovoPedidoManual);

  function ativarAba(botao) {
    document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    botao.classList.add('ativo');
    const aba = botao.getAttribute('data-aba');
    // Lembra qual aba estava aberta -- se a pagina recarregar (F5) ainda
    // logado, volta direto pra essa aba em vez de reiniciar do zero.
    sessionStorage.setItem('admin_ultima_aba', aba);
    document.getElementById(`aba-${aba}`).classList.remove('oculto');
    if (aba === 'pedidos') carregarPedidos();
    if (aba === 'caixa-geral') carregarCaixaGeral();
    if (aba === 'atendimento') abrirModalNovoPedido();
    if (aba === 'configuracoes') carregarConfiguracoes();
    if (aba === 'reservas') carregarReservas();
    if (aba === 'pagamento') abrirPainelPagamento();
    if (aba === 'funcionarios') {
      mostrarVistaEquipe();
      renderizarFuncionariosAdmin();
      carregarEquipeOperacional();
    }
    if (aba === 'construtor') renderizarConstrutorPagina();
  }

  document.querySelectorAll('.painel__menu-item[data-aba]').forEach(botao => {
    botao.addEventListener('click', () => {
      const aba = botao.getAttribute('data-aba');
      // Atendimento fica protegido por senha INDIVIDUAL (Caixa/Gerente/
      // Administrador -- nunca a senha geral do proprietario) -- pede de
      // novo toda vez que a pagina e recarregada (nao fica "lembrado" de
      // sessao pra sessao, so dentro da mesma navegacao). Isso vale
      // SEMPRE, mesmo pro proprietario: toda venda feita pelo Atendimento
      // precisa ficar amarrada a um login individual rastreavel, senao
      // nao da pra saber quem vendeu o que (e a venda fica "orfa", sem
      // aparecer em historico de caixa nenhum). Se o proprietario quiser
      // operar o Atendimento, ele usa o login de um funcionario Caixa/
      // Gerente/Administrador nesse gate -- a MESMA regra de sempre.
      if (aba === 'atendimento' && !atendimentoAutenticado) {
        abrirGateAtendimento(botao, ativarAba);
        return;
      }
      ativarAba(botao);
    });
  });
}

// Quem esta autenticado na sessao de Atendimento agora (null = ainda nao
// autenticou nessa navegacao). So Caixa/Gerente/Administrador passam pelo
// verificar-senha-atendimento -- cada um usa a PROPRIA senha, nunca a do
// proprietario, pra saber sempre quem lancou cada pedido dali.
let atendimentoAutenticado = null;
let gateAtendimentoModoProprietario = false;

function abrirGateAtendimento(botaoAlvo, ativarAba) {
  document.getElementById('input-atendimento-login').value = '';
  document.getElementById('input-atendimento-senha').value = '';
  document.getElementById('input-atendimento-senha-proprietario').value = '';
  document.getElementById('erro-gate-atendimento').classList.add('oculto');
  document.getElementById('fundo-modal-gate-atendimento').classList.remove('oculto');
  document.getElementById('modal-gate-atendimento').classList.remove('oculto');

  // Botao "Sou o Proprietario" so faz sentido se quem esta logado no
  // dashboard agora e realmente o proprietario (funcionario nenhum pode
  // se passar por ele -- a rota no backend tambem recusa).
  const ehProprietarioLogado = sessaoAtual().cargo === 'proprietario';
  document.getElementById('botao-alternar-gate-proprietario').classList.toggle('oculto', !ehProprietarioLogado);

  gateAtendimentoModoProprietario = false;
  aplicarModoGateAtendimento();
  document.getElementById('input-atendimento-login').focus();

  const confirmar = async () => {
    const erroEl = document.getElementById('erro-gate-atendimento');
    erroEl.classList.add('oculto');

    if (gateAtendimentoModoProprietario) {
      const senhaProprietario = document.getElementById('input-atendimento-senha-proprietario').value;
      if (!senhaProprietario) { erroEl.textContent = 'Informe sua senha.'; erroEl.classList.remove('oculto'); return; }
      try {
        await apiVerificarSenhaAtendimentoProprietario(senhaProprietario);
        atendimentoAutenticado = { id: 'proprietario', nome: 'Proprietário', cargo: 'proprietario' };
        document.getElementById('fundo-modal-gate-atendimento').classList.add('oculto');
        document.getElementById('modal-gate-atendimento').classList.add('oculto');
        document.getElementById('atendimento-autenticado-como').textContent = `👑 Proprietário`;
        ativarAba(botaoAlvo);
      } catch (erro) {
        erroEl.textContent = erro.message;
        erroEl.classList.remove('oculto');
      }
      return;
    }

    const login = document.getElementById('input-atendimento-login').value.trim();
    const senha = document.getElementById('input-atendimento-senha').value;
    if (!login || !senha) { erroEl.textContent = 'Informe login e senha.'; erroEl.classList.remove('oculto'); return; }
    try {
      const resultado = await apiVerificarSenhaAtendimento(login, senha);
      atendimentoAutenticado = { id: resultado.id, nome: resultado.nome, cargo: resultado.cargo };
      document.getElementById('fundo-modal-gate-atendimento').classList.add('oculto');
      document.getElementById('modal-gate-atendimento').classList.add('oculto');
      const cargoLegenda = { administrador: 'Administrador', gerente: 'Gerente', caixa: 'Caixa' };
      document.getElementById('atendimento-autenticado-como').textContent = `👤 ${resultado.nome} (${cargoLegenda[resultado.cargo] || resultado.cargo})`;
      ativarAba(botaoAlvo);
    } catch (erro) {
      erroEl.textContent = erro.message;
      erroEl.classList.remove('oculto');
    }
  };
  document.getElementById('botao-confirmar-gate-atendimento').onclick = confirmar;
  document.getElementById('botao-cancelar-gate-atendimento').onclick = () => {
    document.getElementById('fundo-modal-gate-atendimento').classList.add('oculto');
    document.getElementById('modal-gate-atendimento').classList.add('oculto');
  };
}

function aplicarModoGateAtendimento() {
  document.getElementById('gate-atendimento-modo-funcionario').classList.toggle('oculto', gateAtendimentoModoProprietario);
  document.getElementById('gate-atendimento-modo-proprietario').classList.toggle('oculto', !gateAtendimentoModoProprietario);
  document.getElementById('gate-atendimento-descricao').textContent = gateAtendimentoModoProprietario
    ? 'Digite sua senha de proprietário de novo — cada troca de atendente exige a senha na hora, mesmo pra você.'
    : 'Caixa, Gerente ou Administrador — digite sua própria senha (não é a senha do proprietário).';
  document.getElementById('botao-alternar-gate-proprietario').textContent = gateAtendimentoModoProprietario
    ? '👤 Sou Caixa / Gerente / Administrador'
    : '👑 Sou o Proprietário';
}

document.getElementById('botao-alternar-gate-proprietario')?.addEventListener('click', () => {
  gateAtendimentoModoProprietario = !gateAtendimentoModoProprietario;
  document.getElementById('erro-gate-atendimento').classList.add('oculto');
  aplicarModoGateAtendimento();
});

document.getElementById('botao-trocar-atendente-atendimento')?.addEventListener('click', () => {
  atendimentoAutenticado = null;
  abrirGateAtendimento(document.querySelector('.painel__menu-item[data-aba="atendimento"]'), (botao) => {
    document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
    botao.classList.add('ativo');
  });
});

// ===================== "Comanda Garçom" dentro do Atendimento =====================
// Mesma capacidade do cargo Caixa no app do garcom (ver mesas abertas de
// qualquer garcom e cobrar), só que acessada aqui de dentro do dashboard,
// pra quem autenticou no gate acima.
document.getElementById('botao-comanda-garcom')?.addEventListener('click', abrirPainelComandaGarcom);

async function abrirPainelComandaGarcom() {
  document.getElementById('fundo-modal-comanda-garcom').classList.remove('oculto');
  document.getElementById('modal-comanda-garcom').classList.remove('oculto');
  await carregarListaComandaGarcom();
}

// So mostra comandas EM ABERTO -- essa tela e so pra dar baixa em
// pagamento pendente. Comanda ja cobrada nao tem o que fazer aqui; quem
// quiser conferir cobrancas ja feitas usa Equipe -> Historico do
// funcionario, que tem o registro completo e permanente.
async function carregarListaComandaGarcom() {
  const container = document.getElementById('lista-comanda-garcom-abertas');
  container.innerHTML = '<p class="aba__descricao">Carregando...</p>';
  try {
    const abertas = await apiListarComandasAbertas();
    container.innerHTML = abertas.length === 0
      ? '<p class="aba__descricao">Nenhuma mesa aberta no momento.</p>'
      : abertas.map(c => `
        <div class="comanda-movimentacao">
          <div class="comanda-movimentacao__cabecalho">
            <span class="comanda-movimentacao__mesa">${escaparHtmlAdmin(c.mesa_cliente)}</span>
            <span style="font-size:0.78rem;color:var(--admin-cor-texto-claro);">${escaparHtmlAdmin(c.funcionario_nome || '-')}</span>
          </div>
          <div class="comanda-movimentacao__rodape">
            <span>Aberta às ${formatarHoraAdmin(c.aberta_em)}</span>
            <span class="comanda-movimentacao__total">R$ ${formatarMoedaAdmin(c.subtotal)}</span>
            <button type="button" class="comanda-movimentacao__corrigir" data-cobrar-comanda-garcom="${c.id}" data-total="${c.subtotal}" data-mesa="${escaparHtmlAdmin(c.mesa_cliente)}">💳 Cobrar</button>
          </div>
        </div>
      `).join('');
    container.querySelectorAll('[data-cobrar-comanda-garcom]').forEach(botao => {
      botao.addEventListener('click', () => abrirCobrancaComandaGarcom(botao.dataset.cobrarComandaGarcom, parseFloat(botao.dataset.total), botao.dataset.mesa));
    });
  } catch (erro) {
    container.innerHTML = `<p class="erro-form">${escaparHtmlAdmin(erro.message)}</p>`;
  }
}

const formasPagamentoLegendaAdmin = { dinheiro: '💵 Dinheiro', pix: '📱 PIX', cartao_credito: '💳 Crédito', cartao_debito: '💳 Débito' };

let cobrancaComandaAtualId = null;
let cobrancaComandaAtualSubtotal = 0;
let cobrancaFormaSelecionada = null;

function abrirCobrancaComandaGarcom(comandaId, subtotal, mesa) {
  cobrancaComandaAtualId = comandaId;
  cobrancaComandaAtualSubtotal = subtotal;
  cobrancaFormaSelecionada = null;
  document.getElementById('cobranca-comanda-mesa').textContent = mesa || '';
  document.getElementById('cobranca-comanda-total').textContent = `R$ ${formatarMoedaAdmin(subtotal)}`;
  document.getElementById('input-cobranca-gorjeta').value = '0';
  document.querySelectorAll('.opcao-pagamento-admin').forEach(b => b.classList.remove('opcao-pagamento-admin--selecionada'));
  document.getElementById('botao-confirmar-cobranca-comanda').disabled = true;
  document.getElementById('fundo-modal-cobranca-comanda').classList.remove('oculto');
  document.getElementById('modal-cobranca-comanda').classList.remove('oculto');
}

function fecharModalCobrancaComanda() {
  document.getElementById('fundo-modal-cobranca-comanda').classList.add('oculto');
  document.getElementById('modal-cobranca-comanda').classList.add('oculto');
}
document.getElementById('botao-fechar-cobranca-comanda')?.addEventListener('click', fecharModalCobrancaComanda);

document.querySelectorAll('.opcao-pagamento-admin').forEach(botao => {
  botao.addEventListener('click', () => {
    cobrancaFormaSelecionada = botao.dataset.forma;
    document.querySelectorAll('.opcao-pagamento-admin').forEach(b => b.classList.remove('opcao-pagamento-admin--selecionada'));
    botao.classList.add('opcao-pagamento-admin--selecionada');
    document.getElementById('botao-confirmar-cobranca-comanda').disabled = false;
  });
});

document.getElementById('botao-confirmar-cobranca-comanda')?.addEventListener('click', async () => {
  if (!cobrancaFormaSelecionada || !cobrancaComandaAtualId) return;
  const gorjeta = parseFloat(document.getElementById('input-cobranca-gorjeta').value) || 0;
  try {
    await apiFecharComandaNoCaixa(cobrancaComandaAtualId, { forma_pagamento: cobrancaFormaSelecionada, gorjeta });
    fecharModalCobrancaComanda();
    mostrarToast(`Comanda cobrada — R$ ${formatarMoedaAdmin(cobrancaComandaAtualSubtotal + gorjeta)}`);
    carregarListaComandaGarcom();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

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
    document.getElementById('preview-logo-apps').src = e.logo_apps_url || '';
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
    const campoCartaoPresencial = document.getElementById('campo-cartao-online-presencial');
    if (campoCartaoPresencial) campoCartaoPresencial.checked = !!e.cartao_online_presencial;
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

// Atualiza a amostra de texto da aba Aparencia para a fonte escolhida,
// tanto ao carregar a pagina quanto quando o lojista troca a fonte no
// seletor. Essa funcao faltava no arquivo (so era chamada, nunca
// definida) e isso quebrava a inicializacao do restante do painel.
let EVENTOS_PREVIEW_FONTE_CONFIGURADOS = false;
function configurarPreviewFonte() {
  const select = document.getElementById('campo-fonte');
  const preview = document.getElementById('fonte-preview');
  if (!select || !preview) return;

  const aplicarPreview = () => {
    preview.style.fontFamily = `"${select.value}", sans-serif`;
  };
  aplicarPreview();

  if (!EVENTOS_PREVIEW_FONTE_CONFIGURADOS) {
    EVENTOS_PREVIEW_FONTE_CONFIGURADOS = true;
    select.addEventListener('change', aplicarPreview);
  }
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

  document.getElementById('input-logo-apps').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    ESTADO.arquivosPendentes.logoApps = arquivo;
    document.getElementById('preview-logo-apps').src = URL.createObjectURL(arquivo);
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
    if (ESTADO.arquivosPendentes.logoApps) {
      const formData = new FormData();
      formData.append('imagem', ESTADO.arquivosPendentes.logoApps);
      await apiUploadLogoApps(formData);
      ESTADO.arquivosPendentes.logoApps = null;
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

  const campoCartaoPresencial = document.getElementById('campo-cartao-online-presencial');
  if (campoCartaoPresencial) {
    campoCartaoPresencial.onchange = async () => {
      try {
        await apiAtualizarEstabelecimento({ cartao_online_presencial: campoCartaoPresencial.checked });
        if (ESTADO.estabelecimento) ESTADO.estabelecimento.cartao_online_presencial = campoCartaoPresencial.checked;
        mostrarToast(campoCartaoPresencial.checked
          ? 'Cartão online no atendimento ativado.'
          : 'Cartão online no atendimento desativado — voltou a ser só registro manual.');
      } catch (erro) {
        mostrarToast(erro.message, true);
        campoCartaoPresencial.checked = !campoCartaoPresencial.checked;
      }
    };
  }

  // Protecao por senha da propria tela de Pagamentos (mesmo esquema do
  // Controle de Estoque) -- ativar/desativar exige confirmar a senha de
  // login atual, pra ninguem ligar/desligar essa protecao so clicando.
  const checkboxSenhaPagamento = document.getElementById('config-pagamento-senha-protegida');
  if (checkboxSenhaPagamento) {
    checkboxSenhaPagamento.checked = !!(ESTADO.estabelecimento && ESTADO.estabelecimento.pagamento_senha_protegida);
    checkboxSenhaPagamento.addEventListener('change', async () => {
      const senha = prompt('Confirme sua senha de acesso para alterar essa configuração:');
      if (!senha) { checkboxSenhaPagamento.checked = !checkboxSenhaPagamento.checked; return; }
      try {
        await apiPagamentoAlternarSenha(checkboxSenhaPagamento.checked, senha);
        ESTADO.estabelecimento.pagamento_senha_protegida = checkboxSenhaPagamento.checked;
        mostrarToast(checkboxSenhaPagamento.checked ? 'Proteção por senha ativada.' : 'Proteção por senha desativada.');
      } catch (erro) {
        checkboxSenhaPagamento.checked = !checkboxSenhaPagamento.checked;
        mostrarToast(erro.message, true);
      }
    });
  }

  document.getElementById('pagamento-senha-confirmar')?.addEventListener('click', async () => {
    const senha = document.getElementById('pagamento-senha-input').value;
    const erro = document.getElementById('pagamento-senha-erro');
    if (!senha) return;
    try {
      const resultado = await apiPagamentoVerificarSenha(senha);
      if (resultado.valido) {
        PAGAMENTO_DESBLOQUEADO = true;
        document.getElementById('pagamento-bloqueado').classList.add('oculto');
        document.getElementById('pagamento-conteudo').classList.remove('oculto');
      }
    } catch (e) {
      erro.textContent = e.message || 'Senha incorreta.';
      erro.classList.remove('oculto');
    }
  });
}

// Reseta a cada carregamento de pagina -- igual ESTOQUE_DESBLOQUEADO.
let PAGAMENTO_DESBLOQUEADO = false;

function abrirPainelPagamento() {
  const precisaSenha = ESTADO.estabelecimento && ESTADO.estabelecimento.pagamento_senha_protegida;
  const bloqueio = document.getElementById('pagamento-bloqueado');
  const conteudo = document.getElementById('pagamento-conteudo');
  if (!bloqueio || !conteudo) return;

  if (precisaSenha && !PAGAMENTO_DESBLOQUEADO) {
    bloqueio.classList.remove('oculto');
    conteudo.classList.add('oculto');
    document.getElementById('pagamento-senha-input').value = '';
    document.getElementById('pagamento-senha-erro').classList.add('oculto');
  } else {
    bloqueio.classList.add('oculto');
    conteudo.classList.remove('oculto');
  }
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

  // Leitor de codigo de barras FISICO (USB ou Bluetooth) -- esses leitores
  // funcionam em "modo teclado": eles digitam os numeros no campo com foco
  // e mandam um Enter no final, sem precisar de nenhum driver ou conexao
  // especial. So precisamos escutar esse Enter no campo de codigo e disparar
  // a mesma busca que o leitor por camera usa.
  document.getElementById('produto-codigo')?.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault(); // impede o Enter de submeter o formulario do produto
    const codigo = evento.target.value.trim();
    if (codigo) processarCodigoBarrasLido(codigo);
  });

  document.getElementById('produto-controla-estoque')?.addEventListener('change', (evento) => {
    document.getElementById('produto-estoque-avancado').classList.toggle('oculto', !evento.target.checked);
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
    formData.append('controla_estoque', document.getElementById('produto-controla-estoque').checked);
    formData.append('estoque_minimo', document.getElementById('produto-estoque-minimo').value || '0');
    formData.append('custo_compra', document.getElementById('produto-custo-compra').value || '');
    formData.append('fornecedor_id', document.getElementById('produto-fornecedor').value || '');
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

  const controlaEstoque = !!(produto && produto.controla_estoque);
  document.getElementById('produto-controla-estoque').checked = controlaEstoque;
  document.getElementById('produto-estoque-avancado').classList.toggle('oculto', !controlaEstoque);
  document.getElementById('produto-estoque-minimo').value = (produto && produto.estoque_minimo !== null && produto.estoque_minimo !== undefined) ? produto.estoque_minimo : 0;
  document.getElementById('produto-custo-compra').value = (produto && produto.custo_compra !== null && produto.custo_compra !== undefined) ? produto.custo_compra : '';

  if (typeof preencherSelectFornecedorProduto === 'function') {
    preencherSelectFornecedorProduto(produto?.fornecedor_id || '');
  }

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

  // Busca dados do produto (nome, preco sugerido, marca, conteudo da
  // embalagem) na base Cosmos, atraves do backend (o token da API fica
  // so' no servidor -- ver produtoController.js/consultarCodigoBarras).
  const dadosExternos = await buscarProdutoExternoPorCodigoBarras(codigo);
  if (dadosExternos && dadosExternos.encontrado) {
    if (dadosExternos.nome && !document.getElementById('produto-nome').value) {
      document.getElementById('produto-nome').value = dadosExternos.nome;
    }
    // Preco do Cosmos e' uma MEDIA de mercado, nao o preco da loja -- so
    // preenche como sugestao inicial se o lojista ainda nao digitou nada,
    // ele revisa e ajusta antes de salvar.
    if (dadosExternos.preco_sugerido && !document.getElementById('produto-preco').value) {
      document.getElementById('produto-preco').value = Number(dadosExternos.preco_sugerido).toFixed(2);
    }
    const descricaoAtual = document.getElementById('produto-descricao');
    if (!descricaoAtual.value.trim()) {
      const partesDescricao = [dadosExternos.marca, dadosExternos.conteudo_embalagem].filter(Boolean);
      if (partesDescricao.length) descricaoAtual.value = partesDescricao.join(' · ');
    }
    mostrarToast('Dados do produto preenchidos automaticamente (confira antes de salvar).');
  }
}

// =============================================
// BUSCA EXTERNA DE PRODUTO POR CODIGO DE BARRAS (Cosmos/Bluesoft)
// =============================================
// A consulta de verdade acontece no BACKEND (rota
// GET /admin/produtos/consulta-codigo-barras/:codigo), que guarda o token
// da API com seguranca em variavel de ambiente (COSMOS_API_TOKEN). Aqui no
// frontend so' chamamos essa rota -- nunca a API externa direto, pra nao
// expor o token no codigo publico do GitHub Pages.
async function buscarProdutoExternoPorCodigoBarras(codigo) {
  try {
    return await apiConsultarCodigoBarras(codigo);
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
}

function abrirModalPromocoesDesativadas() {
  const desativadas = ESTADO.promocoes.filter(p => p.ativo === false);
  document.getElementById('titulo-modal-desativados').textContent = 'Promocoes desativadas';
  const conteudo = document.getElementById('lista-desativados-modal');
  conteudo.innerHTML = desativadas.length === 0
    ? '<div class="lista-vazia">Nenhuma promocao desativada.</div>'
    : montarItensPromocao(desativadas);
  configurarItensPromocao(conteudo);
  document.getElementById('modal-desativados').classList.remove('oculto');
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
    if (!document.getElementById('modal-desativados').classList.contains('oculto') &&
        document.getElementById('titulo-modal-desativados').textContent === 'Promocoes desativadas') {
      abrirModalPromocoesDesativadas();
    }
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
  document.getElementById('botao-ver-promocoes-desativadas')?.addEventListener('click', abrirModalPromocoesDesativadas);

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
  novo: 'Novo', preparando: 'Preparando', pronto: 'Pronto', saiu_entrega: 'Saiu para entrega',
  entregue: 'Entregue', cancelado: 'Cancelado'
};

// Cada status so avanca pro proximo passo especifico do fluxo (nunca um
// dropdown livre): aceitar -> preparar; cozinha marca pronto; admin
// confirma e o sistema ja atribui ao proximo entregador da fila; entregador
// marca como entregue. Cozinha e entregador so recebem o botao do proprio
// passo, mesmo que tenham a permissao geral de mudar status.
function construirAcoesStatusPedido(pedido) {
  const s = sessaoAtual();

  if (s.cargo === 'cozinha') {
    if (pedido.status_pedido === 'preparando') {
      return `<button type="button" class="botao-primario" data-marcar-pronto="${pedido.id}">Marcar como pronto</button>`;
    }
    return '';
  }

  if (s.cargo === 'entregador') {
    if (pedido.status_pedido === 'saiu_entrega' && pedido.entregador_id === s.funcionarioId) {
      return `<button type="button" class="botao-primario" data-marcar-entregue="${pedido.id}">Marcar como entregue</button>`;
    }
    return '';
  }

  if (!temPermissao('mudar_status_pedidos') && !temPermissao('cancelar_pedidos')) return '';

  const ehEntrega = pedido.tipo_pedido === 'entrega';
  const PROXIMO_PASSO = {
    novo: ['preparando', 'Aceitar pedido (enviar p/ cozinha)'],
    preparando: ['pronto', 'Marcar como pronto'],
    // Mesa/balcao/retirada: ninguem "entrega" pra ninguem, e so marcar
    // que o cliente ja recebeu/retirou. Pedido de entrega de verdade nao
    // tem botao aqui pra esse passo -- vai automatico pro entregador da
    // fila assim que fica pronto (ou o gestor atribui manualmente, no
    // seletor logo abaixo).
    pronto: ehEntrega ? null : ['entregue', 'Marcar como finalizado'],
    saiu_entrega: ['entregue', 'Marcar como entregue']
  };

  let html = '';
  const passo = PROXIMO_PASSO[pedido.status_pedido];
  if (passo && temPermissao('mudar_status_pedidos')) {
    const [novoStatus, rotulo] = passo;
    html += `<button type="button" class="botao-primario" data-mudar-status="${pedido.id}" data-novo-status="${novoStatus}">${rotulo}</button>`;
  } else if (ehEntrega && pedido.status_pedido === 'pronto') {
    // Antes mostrava "aguardando entregador aceitar" sempre que o pedido
    // era de entrega e estava pronto -- mesmo quando NENHUM entregador
    // tinha sido chamado de verdade (fila vazia/ninguem elegivel). Isso
    // escondia exatamente o problema: parecia que o sistema estava
    // "tentando" quando na real ninguem foi avisado. Agora reflete o
    // status_convite_entrega/entregador_nome reais do pedido.
    if (pedido.status_convite_entrega === 'pendente' && pedido.entregador_nome) {
      html += `<span style="font-size:0.85rem;color:var(--admin-cor-texto-claro);">🛵 Aguardando <strong>${escaparHtmlAdmin(pedido.entregador_nome)}</strong> aceitar</span>`;
    } else {
      html += `<span style="font-size:0.85rem;color:#b45309;">⚠️ Nenhum entregador disponível na fila agora</span>`;
    }
  }
  if (!['entregue', 'cancelado'].includes(pedido.status_pedido) && temPermissao('cancelar_pedidos')) {
    html += ` <button type="button" class="botao-secundario" data-cancelar-pedido="${pedido.id}">Cancelar</button>`;
  }

  return html;
}

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
      ? 'Valor oculto'
      : `${formatarMoedaAdmin(pedido.total)} - ${pedido.forma_pagamento.toUpperCase()} (${pedido.status_pagamento})`;
    const data = new Date(pedido.criado_em).toLocaleString('pt-BR');
    const linhaEntregador = pedido.entregador_nome
      ? `<div class="item-admin__subtitulo">Entregador: ${escaparHtmlAdmin(pedido.entregador_nome)}</div>` : '';
    const linhaTelefone = pedido.cliente_telefone && pedido.tipo_pedido !== 'balcao'
      ? `<div class="item-admin__subtitulo">Tel: ${escaparHtmlAdmin(pedido.cliente_telefone)}</div>` : '';
    const linhaTipo = pedido.tipo_pedido === 'balcao'
      ? '<div class="item-admin__subtitulo">🧾 Balcao/Mesa</div>' : '';
    return `
      <div class="item-admin" style="align-items: flex-start;">
        <div class="item-admin__info">
          <div class="item-admin__titulo">
            ${escaparHtmlAdmin(pedido.cliente_nome)}
            <span class="badge-status badge-status--${pedido.status_pedido}">${pedido.status_pedido === 'entregue' && pedido.tipo_pedido !== 'entrega' ? 'Finalizado' : STATUS_PEDIDO_LABEL[pedido.status_pedido]}</span>
          </div>
          <div class="item-admin__subtitulo">Pedido #${pedido.id.substring(0, 8)}</div>
          <div class="item-admin__subtitulo">${itens}</div>
          <div class="item-admin__subtitulo">${data} - ${valorLinha}</div>
          ${linhaTelefone}
          ${linhaTipo}
          ${linhaEntregador}
        </div>
        <div class="acoes-status-pedido">${construirAcoesStatusPedido(pedido)}</div>
      </div>
    `;
  }).join('');

  lista.querySelectorAll('[data-mudar-status]').forEach(botao => {
    botao.addEventListener('click', () => executarMudancaStatusPedido(botao.getAttribute('data-mudar-status'), botao.getAttribute('data-novo-status')));
  });
  lista.querySelectorAll('[data-marcar-pronto]').forEach(botao => {
    botao.addEventListener('click', () => executarMudancaStatusPedido(botao.getAttribute('data-marcar-pronto'), 'pronto'));
  });
  lista.querySelectorAll('[data-marcar-entregue]').forEach(botao => {
    botao.addEventListener('click', () => executarMudancaStatusPedido(botao.getAttribute('data-marcar-entregue'), 'entregue'));
  });
  lista.querySelectorAll('[data-cancelar-pedido]').forEach(botao => {
    botao.addEventListener('click', () => {
      if (!confirm('Cancelar este pedido?')) return;
      executarMudancaStatusPedido(botao.getAttribute('data-cancelar-pedido'), 'cancelado');
    });
  });
}

async function executarMudancaStatusPedido(id, novoStatus) {
  try {
    await apiAtualizarStatusPedido(id, novoStatus);
    mostrarToast('Status do pedido atualizado.');
    carregarPedidos();
    if (novoStatus === 'pronto' || novoStatus === 'preparando') carregarEquipeOperacional();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

// =============================================
// NOVO PEDIDO MANUAL (balcao/mesa) -- uso do garcom/atendimento.
// =============================================
let filtroAtendimentoAtual = 'todos';
let buscaAtendimentoAtual = '';
// carrinho do Novo Pedido: { produto_id: quantidade } -- substitui os
// inputs soltos de antes (um <input type=number> por linha da lista).
let novoPedidoCarrinho = {};

function produtosFiltradosAtendimento() {
  const disponiveis = (ESTADO.produtos || []).filter(p => p.disponivel);
  if (filtroAtendimentoAtual === 'todos') return disponiveis;

  if (filtroAtendimentoAtual === 'promocoes') {
    const idsComPromocaoAtiva = new Set(
      (ESTADO.promocoes || []).filter(promo => promo.ativo && promo.produto_id).map(promo => promo.produto_id)
    );
    return disponiveis.filter(p => idsComPromocaoAtiva.has(p.id));
  }

  if (filtroAtendimentoAtual === 'vitrines') {
    const idsEmVitrine = new Set(
      (ESTADO.vitrines || []).filter(v => v.ativo && v.produto_id).map(v => v.produto_id)
    );
    return disponiveis.filter(p => idsEmVitrine.has(p.id));
  }

  if (filtroAtendimentoAtual.startsWith('categoria:')) {
    const categoriaId = filtroAtendimentoAtual.replace('categoria:', '');
    return disponiveis.filter(p => p.categoria_id === categoriaId);
  }

  return disponiveis;
}

function renderizarFiltrosCategoriaAtendimento() {
  const container = document.getElementById('botoes-filtro-categorias-atendimento');
  if (!container) return;
  container.innerHTML = (ESTADO.categorias || []).map(c => `
    <button type="button" class="botao-secundario" data-filtro-atendimento="categoria:${c.id}">${escaparHtmlAdmin(c.nome)}</button>
  `).join('');
  container.querySelectorAll('[data-filtro-atendimento]').forEach(botao => {
    botao.addEventListener('click', () => selecionarFiltroAtendimento(botao));
  });
}

function selecionarFiltroAtendimento(botao) {
  document.querySelectorAll('[data-filtro-atendimento]').forEach(b => b.classList.remove('ativo'));
  botao.classList.add('ativo');
  filtroAtendimentoAtual = botao.getAttribute('data-filtro-atendimento');
  // So re-renderiza a grade (categoria/promo/vitrine mudou) -- NAO chama
  // abrirModalNovoPedido() de novo, que zerava o carrinho e a mesa/comanda
  // ja preenchidos so por ter clicado num filtro diferente.
  renderizarGradeNovoPedido();
}

function abrirModalNovoPedido() {
  document.getElementById('novo-pedido-cliente').value = '';
  document.getElementById('novo-pedido-observacoes').value = '';
  document.getElementById('novo-pedido-forma-pagamento').value = 'dinheiro';
  document.getElementById('novo-pedido-enviar-entrega').checked = false;
  document.getElementById('novo-pedido-busca').value = '';
  buscaAtendimentoAtual = '';
  novoPedidoCarrinho = {};
  renderizarFiltrosCategoriaAtendimento();
  renderizarGradeNovoPedido();
  renderizarCarrinhoNovoPedido();
}

function produtosFiltradosAtendimentoComBusca() {
  const base = produtosFiltradosAtendimento();
  if (!buscaAtendimentoAtual.trim()) return base;
  const termo = buscaAtendimentoAtual.trim().toLowerCase();
  return base.filter(p => p.nome.toLowerCase().includes(termo));
}

function renderizarGradeNovoPedido() {
  const disponiveis = produtosFiltradosAtendimentoComBusca();
  const grade = document.getElementById('novo-pedido-itens-produtos');

  if (disponiveis.length === 0) {
    grade.innerHTML = '<div class="lista-vazia">Nenhum produto encontrado.</div>';
    return;
  }

  grade.innerHTML = disponiveis.map(p => {
    const preco = p.preco_promocional && parseFloat(p.preco_promocional) < parseFloat(p.preco)
      ? parseFloat(p.preco_promocional) : parseFloat(p.preco);
    const qtd = novoPedidoCarrinho[p.id] || 0;
    const indisponivel = p.disponivel === false;
    return `
      <div class="produto-card-atendimento">
        <div class="produto-card-atendimento__imagem-wrap">
          <img class="produto-card-atendimento__imagem ${indisponivel ? 'produto-card-atendimento__indisponivel' : ''}"
               src="${p.foto_url || ''}" onerror="this.style.visibility='hidden'" data-descricao-produto="${p.id}">
          ${qtd > 0 ? `<div class="produto-card-atendimento__badge-qtd">${qtd}</div>` : ''}
        </div>
        <div class="produto-card-atendimento__corpo">
          <div class="produto-card-atendimento__nome" data-descricao-produto="${p.id}">${escaparHtmlAdmin(p.nome)}${indisponivel ? ' (indisponível)' : ''}</div>
          <div class="produto-card-atendimento__preco">${formatarMoedaAdmin(preco)}</div>
          ${indisponivel ? '' : `
          <div class="produto-card-atendimento__acoes">
            <button type="button" class="produto-card-atendimento__botao-qtd" data-novo-pedido-menos="${p.id}" ${qtd === 0 ? 'style="visibility:hidden;"' : ''}>−</button>
            <input type="number" min="0" class="produto-card-atendimento__input-qtd" data-novo-pedido-input="${p.id}" value="${qtd}">
            <button type="button" class="produto-card-atendimento__botao-qtd" data-novo-pedido-mais="${p.id}">+</button>
          </div>`}
        </div>
      </div>
    `;
  }).join('');

  grade.querySelectorAll('[data-novo-pedido-mais]').forEach(b => b.addEventListener('click', () => alterarQtdNovoPedido(b.getAttribute('data-novo-pedido-mais'), 1)));
  grade.querySelectorAll('[data-novo-pedido-menos]').forEach(b => b.addEventListener('click', () => alterarQtdNovoPedido(b.getAttribute('data-novo-pedido-menos'), -1)));
  grade.querySelectorAll('[data-novo-pedido-input]').forEach(input => input.addEventListener('input', () => {
    const id = input.getAttribute('data-novo-pedido-input');
    const v = Math.max(0, parseInt(input.value, 10) || 0);
    if (v === 0) delete novoPedidoCarrinho[id]; else novoPedidoCarrinho[id] = v;
    renderizarGradeNovoPedido();
    renderizarCarrinhoNovoPedido();
  }));
  grade.querySelectorAll('[data-descricao-produto]').forEach(el => el.addEventListener('click', () => abrirDescricaoProdutoAtendimento(el.getAttribute('data-descricao-produto'))));
}

function alterarQtdNovoPedido(produtoId, delta) {
  const atual = novoPedidoCarrinho[produtoId] || 0;
  const novo = Math.max(0, atual + delta);
  if (novo === 0) delete novoPedidoCarrinho[produtoId]; else novoPedidoCarrinho[produtoId] = novo;
  renderizarGradeNovoPedido();
  renderizarCarrinhoNovoPedido();
}

function abrirDescricaoProdutoAtendimento(produtoId) {
  const p = (ESTADO.produtos || []).find(x => x.id === produtoId);
  if (!p) return;
  const preco = p.preco_promocional && parseFloat(p.preco_promocional) < parseFloat(p.preco)
    ? parseFloat(p.preco_promocional) : parseFloat(p.preco);
  document.getElementById('modal-descricao-produto-conteudo').innerHTML = `
    ${p.foto_url ? `<img src="${p.foto_url}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;margin-bottom:12px;">` : ''}
    <h3 style="margin:0 0 6px;">${escaparHtmlAdmin(p.nome)}</h3>
    <p class="aba__descricao">${escaparHtmlAdmin(p.descricao || 'Sem descrição cadastrada.')}</p>
    <div style="font-weight:800;color:var(--admin-cor-primaria-escura);font-size:1.05rem;">${formatarMoedaAdmin(preco)}</div>
  `;
  document.getElementById('fundo-modal-descricao-produto').classList.remove('oculto');
  document.getElementById('modal-descricao-produto').classList.remove('oculto');
}

function renderizarCarrinhoNovoPedido() {
  const container = document.getElementById('novo-pedido-carrinho-lista');
  const ids = Object.keys(novoPedidoCarrinho);
  if (ids.length === 0) {
    container.innerHTML = '<div class="lista-vazia">Nenhum item adicionado ainda.</div>';
  } else {
    container.innerHTML = ids.map(id => {
      const p = (ESTADO.produtos || []).find(x => x.id === id);
      if (!p) return '';
      const preco = p.preco_promocional && parseFloat(p.preco_promocional) < parseFloat(p.preco)
        ? parseFloat(p.preco_promocional) : parseFloat(p.preco);
      const qtd = novoPedidoCarrinho[id];
      return `<div class="carrinho-atendimento__item"><span>${qtd}x ${escaparHtmlAdmin(p.nome)}</span><span>${formatarMoedaAdmin(preco * qtd)}</span></div>`;
    }).join('');
  }
  atualizarTotalNovoPedido();
}

document.getElementById('novo-pedido-busca')?.addEventListener('input', (e) => {
  buscaAtendimentoAtual = e.target.value;
  renderizarGradeNovoPedido();
});

document.querySelectorAll('[data-filtro-atendimento]').forEach(botao => {
  botao.addEventListener('click', () => selecionarFiltroAtendimento(botao));
});

function atualizarTotalNovoPedido() {
  let total = 0;
  Object.keys(novoPedidoCarrinho).forEach(id => {
    const p = (ESTADO.produtos || []).find(x => x.id === id);
    if (!p) return;
    const preco = p.preco_promocional && parseFloat(p.preco_promocional) < parseFloat(p.preco)
      ? parseFloat(p.preco_promocional) : parseFloat(p.preco);
    total += preco * novoPedidoCarrinho[id];
  });
  document.getElementById('novo-pedido-total').textContent = `Total: ${formatarMoedaAdmin(total)}`;
}

async function confirmarNovoPedidoManual() {
  const clienteNome = document.getElementById('novo-pedido-cliente').value.trim();
  if (!clienteNome) { mostrarToast('Informe o número da mesa ou comanda.', true); return; }

  const itens = Object.keys(novoPedidoCarrinho).map(produto_id => ({ produto_id, quantidade: novoPedidoCarrinho[produto_id] }));
  if (itens.length === 0) { mostrarToast('Adicione pelo menos um item ao pedido.', true); return; }

  const botao = document.getElementById('botao-confirmar-novo-pedido');
  botao.disabled = true;
  try {
    await apiCriarPedidoManual({
      cliente_nome: clienteNome,
      itens,
      forma_pagamento: document.getElementById('novo-pedido-forma-pagamento').value,
      observacoes: document.getElementById('novo-pedido-observacoes').value.trim() || null,
      enviar_entrega: document.getElementById('novo-pedido-enviar-entrega').checked,
      lancado_por_funcionario_id: atendimentoAutenticado?.id || null,
      lancado_por_funcionario_nome: atendimentoAutenticado?.nome || null
    });
    mostrarToast('Pedido lancado! Ja esta em preparo.');
    abrirModalNovoPedido();
    carregarPedidos();
  } catch (erro) {
    mostrarToast(erro.message, true);
  } finally {
    botao.disabled = false;
  }
}

// =============================================
// CAIXA GERAL
// =============================================
function configurarEventosCaixaGeral() {
  const botao = document.getElementById('botao-filtrar-caixa');
  if (botao) botao.addEventListener('click', carregarCaixaGeral);
}

function carregarConfiguracoes() {
  const caixa = document.getElementById('config-reserva-mesa-ativa');
  if (!caixa) return;
  caixa.checked = !!(ESTADO.estabelecimento && ESTADO.estabelecimento.reserva_mesa_ativa);
  caixa.onchange = async () => {
    try {
      await apiAlternarReservaMesa(caixa.checked);
      ESTADO.estabelecimento.reserva_mesa_ativa = caixa.checked;
      aplicarVisibilidadeMenu();
      mostrarToast(caixa.checked ? 'Reserva de mesa ativada.' : 'Reserva de mesa desativada.');
    } catch (erro) {
      mostrarToast(erro.message, true);
      caixa.checked = !caixa.checked;
    }
  };
}

async function carregarReservas() {
  const lista = document.getElementById('lista-reservas-admin');
  lista.innerHTML = '<div class="lista-vazia">Carregando...</div>';
  try {
    const reservas = await apiListarReservas();
    if (reservas.length === 0) {
      lista.innerHTML = '<div class="lista-vazia">Nenhuma reserva ainda.</div>';
      return;
    }
    const rotulosStatus = { pendente: 'Pendente', confirmada: 'Confirmada' };
    // Reserva cancelada tem rotulo diferente dependendo de quem cancelou:
    // a loja recusando (cancelada_por = 'loja') ou o proprio cliente
    // cancelando sozinho em "Minhas reservas" (cancelada_por = 'cliente').
    const rotuloStatusReserva = (r) => {
      if (r.status === 'cancelada') {
        return r.cancelada_por === 'cliente' ? 'Cancelada pelo cliente' : 'Recusada';
      }
      return rotulosStatus[r.status] || r.status;
    };
    lista.innerHTML = reservas.map(r => `
      <div class="item-admin">
        <div class="item-admin__info">
          <div class="item-admin__titulo">${escaparHtmlAdmin(r.cliente_nome)} · ${r.quantidade_pessoas} pessoa(s)</div>
          <div class="item-admin__subtitulo">
            ${new Date(r.data_reserva).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} às ${r.horario_reserva} · ${r.cliente_telefone} · ${rotuloStatusReserva(r)}
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${r.status === 'pendente' ? `<button type="button" class="botao-secundario" data-reserva-status="${r.id}:confirmada">Confirmar</button>` : ''}
          ${r.status === 'pendente' ? `<button type="button" class="botao-secundario" data-reserva-status="${r.id}:cancelada">Cancelar</button>` : ''}
        </div>
      </div>
    `).join('');

    lista.querySelectorAll('[data-reserva-status]').forEach(botao => {
      botao.addEventListener('click', async () => {
        const [id, status] = botao.getAttribute('data-reserva-status').split(':');
        try {
          await apiAtualizarStatusReserva(id, status);
          mostrarToast('Reserva atualizada.');
          carregarReservas();
        } catch (erro) {
          mostrarToast(erro.message, true);
        }
      });
    });
  } catch (erro) {
    lista.innerHTML = '<div class="lista-vazia">Erro ao carregar as reservas.</div>';
  }
}

// Periodo atualmente selecionado no Caixa Geral -- 'hoje' por padrao ao
// abrir a aba. 'personalizado' usa os campos de data manuais.
let periodoCaixaGeralAtual = 'hoje';

let ultimoDadosCaixaGeral = null;
let filtroCaixaGeralAtivo = 'todos'; // 'todos' | 'proprietario' | funcionarioId

async function carregarCaixaGeral() {
  const resumo = document.getElementById('resumo-caixa-geral');
  const lista = document.getElementById('lista-caixa-geral');
  if (!resumo || !lista) return;

  resumo.innerHTML = '';
  lista.innerHTML = '<div class="lista-vazia">Carregando...</div>';

  try {
    let dados;
    if (periodoCaixaGeralAtual === 'personalizado') {
      const dataInicio = document.getElementById('caixa-data-inicio').value;
      const dataFim = document.getElementById('caixa-data-fim').value;
      dados = await apiObterCaixaGeral('personalizado', dataInicio, dataFim);
    } else {
      dados = await apiObterCaixaGeral(periodoCaixaGeralAtual);
    }
    ultimoDadosCaixaGeral = dados;
    filtroCaixaGeralAtivo = 'todos';
    renderizarCaixaGeral(dados);
  } catch (erro) {
    lista.innerHTML = '<div class="lista-vazia">Erro ao carregar o caixa geral.</div>';
  }
}

document.querySelectorAll('#botoes-periodo-caixa-geral [data-periodo-caixa]').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('#botoes-periodo-caixa-geral [data-periodo-caixa]').forEach(b => b.classList.remove('ativo'));
    botao.classList.add('ativo');
    periodoCaixaGeralAtual = botao.getAttribute('data-periodo-caixa');
    document.getElementById('campos-caixa-manual').classList.toggle('oculto', periodoCaixaGeralAtual !== 'personalizado');
    if (periodoCaixaGeralAtual !== 'personalizado') carregarCaixaGeral();
  });
});

function renderizarCaixaGeral(dados) {
  const resumo = document.getElementById('resumo-caixa-geral');
  const lista = document.getElementById('lista-caixa-geral');

  // Filtra client-side (sem precisar de outra chamada) -- o Proprietario
  // nao tem cadastro de funcionario, entao nao existe um "Resumo do
  // Funcionario" dele; esse filtro e a forma de isolar so o que ele
  // mesmo recebeu, dentro do Caixa Geral que ja mostra todo mundo.
  const pedidosFiltrados = filtroCaixaGeralAtivo === 'proprietario'
    ? (dados.pedidos || []).filter(p => p.recebido_por_cargo === 'proprietario')
    : (dados.pedidos || []);
  const quantidadeFiltrada = pedidosFiltrados.length;
  const totalFiltrado = pedidosFiltrados.reduce((s, p) => s + Number(p.total || 0), 0);

  resumo.innerHTML = `
    <p class="aba__descricao" style="margin-bottom:10px;">Só entra aqui pedido já <strong>entregue/finalizado</strong>. Pedido de entrega ainda esperando um entregador aceitar, ou pedido ainda em preparo, não conta neste total — por isso pode ser menor que o total de "Pedidos".</p>
    <div class="botoes-linha-admin" style="margin-bottom:10px;">
      <button type="button" class="botao-secundario" style="${filtroCaixaGeralAtivo === 'todos' ? 'border-color:var(--admin-cor-primaria,#2563eb);font-weight:700;' : ''}" data-filtro-caixa-geral="todos">Todos</button>
      <button type="button" class="botao-secundario" style="${filtroCaixaGeralAtivo === 'proprietario' ? 'border-color:var(--admin-cor-primaria,#2563eb);font-weight:700;' : ''}" data-filtro-caixa-geral="proprietario">👑 Só o Proprietário</button>
    </div>
    <div class="resumo-caixa-geral__cartao">
      <div class="resumo-caixa-geral__rotulo">Total de vendas concluídas</div>
      <div class="resumo-caixa-geral__valor">${quantidadeFiltrada}</div>
    </div>
    <div class="resumo-caixa-geral__cartao">
      <div class="resumo-caixa-geral__rotulo">Valor total</div>
      <div class="resumo-caixa-geral__valor">${formatarMoedaAdmin(totalFiltrado)}</div>
    </div>
  `;
  resumo.querySelectorAll('[data-filtro-caixa-geral]').forEach(botao => {
    botao.addEventListener('click', () => {
      filtroCaixaGeralAtivo = botao.getAttribute('data-filtro-caixa-geral');
      renderizarCaixaGeral(ultimoDadosCaixaGeral);
    });
  });

  if (pedidosFiltrados.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma venda encontrada nesse filtro/período.</div>';
    return;
  }

  lista.innerHTML = pedidosFiltrados.map(pedido => {
    const data = new Date(pedido.criado_em).toLocaleString('pt-BR');
    const atendeu = rotularNomeComCargo(pedido.atendido_por_nome, pedido.atendido_por_cargo);
    const recebeu = rotularNomeComCargo(pedido.recebido_por_nome, pedido.recebido_por_cargo);
    // Se foi a mesma pessoa que atendeu e recebeu, mostra so uma linha.
    const linhaPessoas = atendeu === recebeu
      ? `${atendeu !== '-' ? `👤 ${escaparHtmlAdmin(atendeu)}` : ''}`
      : `${atendeu !== '-' ? `🍽️ Atendeu: ${escaparHtmlAdmin(atendeu)}` : ''}${recebeu !== '-' ? ` · 💰 Recebeu: ${escaparHtmlAdmin(recebeu)}` : ''}`;
    return `
      <div class="item-admin">
        <div class="item-admin__info">
          <div class="item-admin__titulo">${escaparHtmlAdmin(pedido.cliente_nome)}${pedido.numero_pedido != null ? ` <span style="font-weight:400;color:var(--admin-cor-texto-claro);">#${pedido.numero_pedido}</span>` : ''}</div>
          <div class="item-admin__subtitulo">${data} - ${pedido.forma_pagamento.toUpperCase()} - ${pedido.tipo_pedido || 'entrega'}</div>
          ${linhaPessoas ? `<div class="item-admin__subtitulo" style="font-weight:600;">${linhaPessoas}</div>` : ''}
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
  garcom: 'Garcom', colaborador: 'Colaborador', cozinha: 'Cozinha', entregador: 'Entregador'
};

let dragSrcFuncionarioId = null;

// =============================================
// VISTA "EQUIPE" (conteudo principal da aba) x "CADASTRO" (subpagina fixa)
// =============================================
function mostrarVistaEquipe() {
  document.getElementById('funcionarios-vista-equipe')?.classList.remove('oculto');
  document.getElementById('funcionarios-vista-cadastro')?.classList.add('oculto');
}

function mostrarVistaCadastroFuncionarios() {
  document.getElementById('funcionarios-vista-equipe')?.classList.add('oculto');
  document.getElementById('funcionarios-vista-cadastro')?.classList.remove('oculto');
}

async function carregarEquipeOperacional() {
  try {
    const equipe = await apiListarEquipeOperacional();
    renderizarEquipeOperacional(equipe);
  } catch (erro) {
    // Silencioso: se falhar, a vista de equipe so fica vazia (o cadastro
    // completo continua funcionando normalmente na subpagina).
  }
}

function renderizarEquipeOperacional(equipe) {
  renderizarListaEquipe('lista-equipe-cozinha', equipe.cozinha, 'cozinha');
  renderizarListaEquipe('lista-equipe-entregadores', equipe.entregadores, 'entregador');
  renderizarListaEquipe('lista-equipe-gerente', equipe.gerente, 'resumo');
  renderizarListaEquipe('lista-equipe-caixa', equipe.caixa, 'resumo');
  renderizarListaEquipe('lista-equipe-garcom', equipe.garcom, 'resumo');
  renderizarListaEquipe('lista-equipe-colaborador', equipe.colaborador, 'resumo');
}

function renderizarListaEquipe(idLista, itens, tipo) {
  const lista = document.getElementById(idLista);
  if (!lista) return;

  if (!itens || itens.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhum funcionario nessa funcao ainda.</div>';
    return;
  }

  lista.innerHTML = itens.map(f => {
    let extra = '';
    if (tipo === 'entregador') {
      const situacao = !f.ativo ? 'Inativo'
        : f.em_entrega ? 'Em entrega'
        : !f.disponivel_entrega ? 'Indisponivel'
        : `Fila #${f.posicao_fila}`;
      const liberadoHoje = f.liberado_hora_extra_data && new Date(f.liberado_hora_extra_data).toDateString() === new Date().toDateString();
      extra = `
        <div style="margin-top:6px;">
          <span class="badge-fila">${situacao}</span>
          <span class="item-admin__subtitulo">${f.total_entregas || 0} entregas realizadas</span>
        </div>
        <label class="interruptor-disponibilidade">
          <input type="checkbox" data-toggle-disponibilidade="${f.id}" ${f.disponivel_entrega ? 'checked' : ''} ${!f.ativo ? 'disabled' : ''}>
          Disponivel para novas entregas
        </label>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="botao-secundario" data-ver-link-acesso="${f.id}" data-token-acesso="${f.token_acesso || ''}" data-caminho-app="../entregador/index.html">🔗 Link de acesso</button>
          <button type="button" class="botao-secundario" data-liberar-hora-extra="${f.id}">⏰ ${liberadoHoje ? 'Hora extra liberada hoje' : 'Liberar hora extra'}</button>
        </div>
        <div class="entregador-pagamento">
          <label class="campo-label">Forma de pagamento da comissão</label>
          <select data-campo-forma-pagamento="${f.id}">
            <option value="entrega" ${f.forma_pagamento_entrega !== 'km' ? 'selected' : ''}>Valor fixo por entrega</option>
            <option value="km" ${f.forma_pagamento_entrega === 'km' ? 'selected' : ''}>Valor por km rodado</option>
          </select>
          <div class="entregador-pagamento__valores">
            <input type="number" step="0.01" min="0" data-campo-valor-entrega="${f.id}" value="${f.valor_por_entrega ?? 0}" placeholder="R$ por entrega">
            <input type="number" step="0.01" min="0" data-campo-valor-km="${f.id}" value="${f.valor_por_km ?? 0}" placeholder="R$ por km">
          </div>
          <button type="button" class="botao-secundario" data-salvar-pagamento-entregador="${f.id}">💾 Salvar valores de comissão</button>
        </div>
      `;
    }
    return `
      <div class="item-admin ${tipo === 'resumo' ? 'item-admin--clicavel' : ''}" ${tipo === 'resumo' ? `data-abrir-resumo="${f.id}" data-nome-resumo="${escaparHtmlAdmin(f.nome)}" role="button" tabindex="0"` : ''}>
        <div class="item-admin__info">
          <div class="item-admin__titulo">${escaparHtmlAdmin(f.nome)} ${!f.ativo ? '(inativo)' : ''}</div>
          <div class="item-admin__subtitulo">${escaparHtmlAdmin(f.email)}</div>
          ${extra}
        </div>
        ${tipo === 'resumo' ? '<span class="item-admin__seta">🔒 ›</span>' : ''}
      </div>
    `;
  }).join('');

  if (tipo === 'resumo') {
    lista.querySelectorAll('[data-abrir-resumo]').forEach(card => {
      card.addEventListener('click', () => {
        abrirModalSenhaAdmin(card.getAttribute('data-abrir-resumo'), card.getAttribute('data-nome-resumo'));
      });
    });
  }

  lista.querySelectorAll('[data-toggle-disponibilidade]').forEach(caixa => {
    caixa.addEventListener('change', async () => {
      const id = caixa.getAttribute('data-toggle-disponibilidade');
      try {
        await apiAlternarDisponibilidadeEntregador(id, caixa.checked);
        mostrarToast('Disponibilidade atualizada.');
        carregarEquipeOperacional();
      } catch (erro) {
        mostrarToast(erro.message, true);
        caixa.checked = !caixa.checked;
      }
    });
  });

  lista.querySelectorAll('[data-salvar-pagamento-entregador]').forEach(botao => {
    botao.addEventListener('click', async () => {
      const id = botao.getAttribute('data-salvar-pagamento-entregador');
      try {
        await apiAtualizarFuncionario(id, {
          forma_pagamento_entrega: lista.querySelector(`[data-campo-forma-pagamento="${id}"]`).value,
          valor_por_entrega: lista.querySelector(`[data-campo-valor-entrega="${id}"]`).value,
          valor_por_km: lista.querySelector(`[data-campo-valor-km="${id}"]`).value
        });
        mostrarToast('Valores de comissão salvos.');
      } catch (erro) {
        mostrarToast(erro.message, true);
      }
    });
  });

  lista.querySelectorAll('[data-ver-link-acesso]').forEach(botao => {
    botao.addEventListener('click', async () => {
      const token = botao.getAttribute('data-token-acesso');
      const caminhoApp = botao.getAttribute('data-caminho-app');
      if (!token) { mostrarToast('Esse funcionario ainda nao tem link de acesso gerado.', true); return; }
      const link = `${window.location.origin}${window.location.pathname.replace(/admin\/index\.html$/, '')}${caminhoApp.replace('../', '')}?acesso=${token}`;
      try {
        const resultado = await chamarApiFuncionarios('/gerar-qrcode', { method: 'POST', body: { conteudo: link } });
        document.getElementById('imagem-qrcode-entregador').src = resultado.qrcode_base64;
        const elLink = document.getElementById('codigo-qrcode-entregador');
        elLink.href = link;
        elLink.textContent = link;
        document.getElementById('botao-copiar-link-acesso').setAttribute('data-copiar', link);
        document.getElementById('modal-qrcode-entregador').classList.remove('oculto');
      } catch (erro) {
        mostrarToast(erro.message, true);
      }
    });
  });

  lista.querySelectorAll('[data-liberar-hora-extra]').forEach(botao => {
    botao.addEventListener('click', async () => {
      const id = botao.getAttribute('data-liberar-hora-extra');
      try {
        const resultado = await chamarApiFuncionarios(`/${id}/liberar-hora-extra`, { method: 'PUT' });
        mostrarToast(resultado.mensagem);
        carregarEquipeOperacional();
      } catch (erro) {
        mostrarToast(erro.message, true);
      }
    });
  });
}

// ===================== RESUMO DO FUNCIONARIO (pagina, senha de administrador) =====================

let funcionarioIdPendenteSenha = null;
let funcionarioNomePendenteSenha = null;
let telaResumoAtiva = 'pedidos';
let comandaIdEmCorrecao = null;
let funcionarioIdResumoAberto = null;
let intervaloAutoAtualizarResumo = null;

function abrirModalSenhaAdmin(id, nome) {
  funcionarioIdPendenteSenha = id;
  funcionarioNomePendenteSenha = nome;
  document.getElementById('modal-senha-admin-descricao').textContent = `Confirme sua senha pra ver o resumo de operação de ${nome}.`;
  document.getElementById('input-senha-admin').value = '';
  document.getElementById('erro-senha-admin').classList.add('oculto');
  document.getElementById('modal-senha-admin').classList.remove('oculto');
  document.getElementById('input-senha-admin').focus();
}

document.getElementById('botao-confirmar-senha-admin')?.addEventListener('click', async () => {
  const senha = document.getElementById('input-senha-admin').value;
  const erroEl = document.getElementById('erro-senha-admin');
  erroEl.classList.add('oculto');
  if (!senha) { erroEl.textContent = 'Informe a senha.'; erroEl.classList.remove('oculto'); return; }
  try {
    await apiVerificarSenhaAdministrador(senha);
    document.getElementById('modal-senha-admin').classList.add('oculto');
    await abrirResumoFuncionario(funcionarioIdPendenteSenha);
  } catch (erro) {
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
  }
});

// Permite confirmar apertando Enter no campo de senha.
document.getElementById('input-senha-admin')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('botao-confirmar-senha-admin').click();
});

// Periodo atualmente selecionado no Resumo do Funcionario -- 'hoje' por
// padrao ao trocar de funcionario (igual o comportamento antigo).
let periodoResumoFuncionarioAtual = 'hoje';

const RECEBIDO_LABEL_PERIODO = {
  hoje: 'RECEBIDO NO CAIXA HOJE', ontem: 'RECEBIDO NO CAIXA ONTEM', semana: 'RECEBIDO NO CAIXA NESTA SEMANA',
  mes_atual: 'RECEBIDO NO CAIXA NESTE MÊS', trimestre: 'RECEBIDO NO CAIXA NESTE TRIMESTRE',
  semestre: 'RECEBIDO NO CAIXA NESTE SEMESTRE', geral: 'RECEBIDO NO CAIXA (GERAL)', personalizado: 'RECEBIDO NO CAIXA NO PERÍODO'
};
const VENDAS_LABEL_PERIODO = {
  hoje: 'Vendas do dia', ontem: 'Vendas de ontem', semana: 'Vendas da semana', mes_atual: 'Vendas do mês',
  trimestre: 'Vendas do trimestre', semestre: 'Vendas do semestre', geral: 'Vendas (geral)', personalizado: 'Vendas no período'
};
const GORJETAS_LABEL_PERIODO = {
  hoje: 'GORJETAS DE HOJE', ontem: 'GORJETAS DE ONTEM', semana: 'GORJETAS DA SEMANA', mes_atual: 'GORJETAS DO MÊS',
  trimestre: 'GORJETAS DO TRIMESTRE', semestre: 'GORJETAS DO SEMESTRE', geral: 'GORJETAS (GERAL)', personalizado: 'GORJETAS NO PERÍODO'
};
const MOVIMENTACAO_LABEL_PERIODO = {
  hoje: 'MOVIMENTAÇÃO POR MESA / COMANDA (hoje)', ontem: 'MOVIMENTAÇÃO POR MESA / COMANDA (ontem)',
  semana: 'MOVIMENTAÇÃO POR MESA / COMANDA (esta semana)', mes_atual: 'MOVIMENTAÇÃO POR MESA / COMANDA (este mês)',
  trimestre: 'MOVIMENTAÇÃO POR MESA / COMANDA (este trimestre)', semestre: 'MOVIMENTAÇÃO POR MESA / COMANDA (este semestre)',
  geral: 'MOVIMENTAÇÃO POR MESA / COMANDA (geral)', personalizado: 'MOVIMENTAÇÃO POR MESA / COMANDA (período selecionado)'
};

async function abrirResumoFuncionario(id, manterPeriodo = false) {
  try {
    if (!manterPeriodo) periodoResumoFuncionarioAtual = 'hoje';
    let dados;
    if (periodoResumoFuncionarioAtual === 'personalizado') {
      const dataInicio = document.getElementById('resumo-data-inicio').value;
      const dataFim = document.getElementById('resumo-data-fim').value;
      dados = await apiResumoFuncionario(id, 'personalizado', dataInicio, dataFim);
    } else {
      dados = await apiResumoFuncionario(id, periodoResumoFuncionarioAtual);
    }
    document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    document.getElementById('aba-resumo-funcionario').classList.remove('oculto');

    // Trocou de funcionario -> volta pra aba "Pedidos", reseta o periodo
    // pra "hoje" e limpa o historico carregado (senao ficaria mostrando o
    // historico/periodo de outra pessoa por engano ate clicar de novo).
    if (funcionarioIdResumoAberto !== id) {
      telaResumoAtiva = 'pedidos';
      document.getElementById('lista-historico-funcionario').innerHTML = '';
      document.querySelectorAll('#botoes-periodo-resumo-funcionario [data-periodo-resumo]').forEach(b => b.classList.toggle('ativo', b.getAttribute('data-periodo-resumo') === 'hoje'));
      document.getElementById('campos-resumo-manual').classList.add('oculto');
    }

    renderizarResumoFuncionario(dados);

    // Atualiza sozinho a cada 15s enquanto a pagina fica aberta -- assim uma
    // comanda que o garcom acabou de abrir/mudar aparece sem precisar sair
    // e entrar de novo. Para de atualizar ao voltar pra Equipe.
    funcionarioIdResumoAberto = id;
    clearInterval(intervaloAutoAtualizarResumo);
    intervaloAutoAtualizarResumo = setInterval(async () => {
      if (document.getElementById('aba-resumo-funcionario').classList.contains('oculto')) {
        clearInterval(intervaloAutoAtualizarResumo);
        return;
      }
      try {
        const atualizado = await abrirResumoFuncionarioSilencioso(funcionarioIdResumoAberto);
        if (atualizado) renderizarResumoFuncionario(atualizado);
      } catch (erro) { /* falha silenciosa -- tenta de novo no proximo ciclo */ }
    }, 15000);
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

// Igual apiResumoFuncionario, mas respeitando o periodo/datas selecionados
// no momento (usado pelo auto-refresh de 15s, pra nao voltar pra "hoje").
async function abrirResumoFuncionarioSilencioso(id) {
  if (periodoResumoFuncionarioAtual === 'personalizado') {
    const dataInicio = document.getElementById('resumo-data-inicio').value;
    const dataFim = document.getElementById('resumo-data-fim').value;
    if (!dataInicio || !dataFim) return null;
    return apiResumoFuncionario(id, 'personalizado', dataInicio, dataFim);
  }
  return apiResumoFuncionario(id, periodoResumoFuncionarioAtual);
}

document.querySelectorAll('#botoes-periodo-resumo-funcionario [data-periodo-resumo]').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('#botoes-periodo-resumo-funcionario [data-periodo-resumo]').forEach(b => b.classList.remove('ativo'));
    botao.classList.add('ativo');
    periodoResumoFuncionarioAtual = botao.getAttribute('data-periodo-resumo');
    document.getElementById('campos-resumo-manual').classList.toggle('oculto', periodoResumoFuncionarioAtual !== 'personalizado');
    if (periodoResumoFuncionarioAtual !== 'personalizado' && funcionarioIdResumoAberto) {
      abrirResumoFuncionario(funcionarioIdResumoAberto, true);
    }
  });
});

document.getElementById('botao-filtrar-resumo-manual')?.addEventListener('click', () => {
  if (funcionarioIdResumoAberto) abrirResumoFuncionario(funcionarioIdResumoAberto, true);
});

document.getElementById('botao-atualizar-resumo')?.addEventListener('click', () => {
  if (funcionarioIdResumoAberto) abrirResumoFuncionario(funcionarioIdResumoAberto, true);
});

document.getElementById('botao-voltar-resumo-funcionario')?.addEventListener('click', () => {
  clearInterval(intervaloAutoAtualizarResumo);
  document.querySelector('.painel__menu-item[data-aba="funcionarios"]')?.click();
});

function preencherCardsResumo(resumo, fechamento_caixa) {
  document.getElementById('card-vendas-do-dia').textContent = `R$ ${formatarMoedaAdmin(resumo.vendas_do_dia)}`;
  document.getElementById('card-pedidos-hoje').textContent = resumo.pedidos_hoje;
  document.getElementById('card-comandas-abertas').textContent = resumo.comandas_abertas;
  document.getElementById('card-mesas-atendidas').textContent = resumo.mesas_atendidas_hoje;
  document.getElementById('card-ticket-medio').textContent = `R$ ${formatarMoedaAdmin(resumo.ticket_medio)}`;
  document.getElementById('painel-gorjetas-total').textContent = `R$ ${formatarMoedaAdmin(resumo.gorjetas_do_dia || 0)}`;

  const totalCartao = fechamento_caixa.total_cartao_credito + fechamento_caixa.total_cartao_debito;
  document.getElementById('fechamento-total-recebido').textContent = `R$ ${formatarMoedaAdmin(fechamento_caixa.total_recebido)}`;
  document.getElementById('fechamento-dinheiro').textContent = `R$ ${formatarMoedaAdmin(fechamento_caixa.total_dinheiro)}`;
  document.getElementById('fechamento-cartao').textContent = `R$ ${formatarMoedaAdmin(totalCartao)}`;
  document.getElementById('fechamento-credito').textContent = `R$ ${formatarMoedaAdmin(fechamento_caixa.total_cartao_credito)}`;
  document.getElementById('fechamento-debito').textContent = `R$ ${formatarMoedaAdmin(fechamento_caixa.total_cartao_debito)}`;
  document.getElementById('fechamento-pix').textContent = `R$ ${formatarMoedaAdmin(fechamento_caixa.total_pix)}`;
  document.getElementById('resumo-cartao-credito-valor').textContent = `R$ ${formatarMoedaAdmin(fechamento_caixa.total_cartao_credito)}`;
  document.getElementById('resumo-cartao-credito-qtd').textContent = `${fechamento_caixa.transacoes_cartao_credito} transações`;
  document.getElementById('resumo-cartao-debito-valor').textContent = `R$ ${formatarMoedaAdmin(fechamento_caixa.total_cartao_debito)}`;
  document.getElementById('resumo-cartao-debito-qtd').textContent = `${fechamento_caixa.transacoes_cartao_debito} transações`;
}

const FORMAS_PAGAMENTO_LEGENDA = { dinheiro: '💵 Dinheiro', pix: '📱 PIX', cartao_credito: '💳 Cartão Crédito', cartao_debito: '💳 Cartão Débito' };

// Renderizador unico de "linha de venda" usado tanto no historico do
// caixa/admin (visao cruzada de todo mundo) quanto no historico do
// garcom (as proprias mesas). Cada linha traz: data/hora, numero da
// comanda/pedido, quem atendeu, forma de pagamento, se foi mesa,
// balcao ou entrega, e um botao pra abrir o detalhe (itens + valor
// unitario + valor total) -- exatamente pra servir de prova em caso de
// duvida ou reclamacao do cliente.
const CARGO_LEGENDA = { garcom: 'Garçom', caixa: 'Caixa', gerente: 'Gerente', administrador: 'Administrador', colaborador: 'Colaborador', cozinha: 'Cozinha', proprietario: 'Proprietário' };

// "Nome (Cargo)" -- essencial quando a loja tem mais de uma pessoa com o
// mesmo cargo (ex: "Admin 1" e "Admin 2" sao os dois administrador, mas
// sao pessoas diferentes, cada uma com seu proprio login). O
// proprietario e o unico caso especial: como so existe UM proprietario
// por loja, "Proprietário" sozinho ja deixa claro quem foi.
function rotularNomeComCargo(nome, cargo) {
  if (!nome) return '-';
  if (cargo === 'proprietario' || nome === 'Proprietário') return 'Proprietário';
  if (!cargo) return nome;
  return `${nome} (${CARGO_LEGENDA[cargo] || cargo})`;
}

// Agrupa as linhas de movimentacao por MESA -- uma mesa pode ter varias
// comandas dentro do mesmo periodo (ex: giro de mesa), entao junta todas
// elas debaixo de um so cartao, com o total de comandas e de pedidos
// somados. Nao e obrigatorio ter mesa pra abrir uma comanda (ex: cliente
// no balcao) -- toda venda que nao veio de uma mesa de verdade (balcao,
// retirada, entrega, ou pedido avulso lancado direto) vira o proprio
// grupo, marcado como "Comanda avulsa", sem tentar juntar com outras.
// Agrupador generico: recebe a lista e uma funcao que decide se uma linha
// "pertence a uma mesa de verdade" (e qual o texto dessa mesa). O que nao
// for mesa vira o proprio grupo avulso, nunca junta com outra coisa.
function agruparPorMesaGenerico(linhas, ehMesaFn) {
  const grupos = [];
  const mapaMesas = new Map();
  (linhas || []).forEach(item => {
    const mesaTexto = (item.mesa_cliente || '').trim();
    if (ehMesaFn(item, mesaTexto)) {
      if (!mapaMesas.has(mesaTexto)) {
        const grupo = { chave: mesaTexto, titulo: mesaTexto, avulsa: false, linhas: [] };
        mapaMesas.set(mesaTexto, grupo);
        grupos.push(grupo);
      }
      mapaMesas.get(mesaTexto).linhas.push(item);
    } else {
      grupos.push({ chave: `avulsa-${item.id || grupos.length}`, titulo: 'Comanda avulsa', subtitulo: mesaTexto, avulsa: true, linhas: [item] });
    }
  });
  return grupos;
}

// Movimentacao do "Resumo do funcionario" (garcom: comandas com rodadas
// embutidas; caixa/gerente/admin: mistura de comanda + pedido de balcao)
// -- ja vem com tipo_venda/origem, entao usa isso pra saber se e mesa.
function agruparMovimentacaoPorMesa(linhas) {
  return agruparPorMesaGenerico(linhas, (c, mesaTexto) => (c.tipo_venda === 'Mesa' || c.origem === 'comanda') && !!mesaTexto);
}

// Historico completo (raw da tabela comandas, sem tipo_venda/origem) --
// so tem o texto livre digitado ao abrir a comanda, entao usa o padrao
// "Mesa ..." pra decidir. Qualquer outra coisa (nome de cliente de
// balcao, etc.) vira comanda avulsa.
function agruparComandasPorMesa(comandas) {
  return agruparPorMesaGenerico(comandas, (c, mesaTexto) => /^mesa\b/i.test(mesaTexto));
}

let contadorGrupoMovimentacao = 0;

// Monta o HTML de uma lista de linhas ja agrupadas por mesa/comanda avulsa,
// com o cartao de grupo mostrando so "X comandas · Y pedidos" e escondendo
// os detalhes ate o usuario clicar pra abrir.
function renderizarGruposMovimentacao(linhas, renderizarLinha, agruparFn = agruparMovimentacaoPorMesa) {
  const grupos = agruparFn(linhas);
  if (grupos.length === 0) {
    return '<p class="aba__descricao">Nenhuma movimentação nesse período.</p>';
  }
  return grupos.map(g => {
    const totalPedidos = g.linhas.reduce((s, c) => s + (c.total_pedidos != null ? c.total_pedidos : (Array.isArray(c.rodadas) ? c.rodadas.length : 1)), 0);
    const totalComandas = g.linhas.length;
    const idGrupo = `grupo-mov-${contadorGrupoMovimentacao++}`;
    // Pega a data/hora mais recente do grupo (a comanda mais nova) pra
    // mostrar direto no cabeçalho -- assim da pra achar uma comanda pelo
    // horario sem precisar abrir o card pra conferir.
    const timestamps = g.linhas
      .map(c => c.quando || c.fechada_em || c.aberta_em)
      .filter(Boolean)
      .map(d => new Date(d).getTime())
      .filter(t => !isNaN(t));
    const maisRecente = timestamps.length ? Math.max(...timestamps) : null;
    return `
      <div class="grupo-mesa">
        <button type="button" class="grupo-mesa__cabecalho" data-toggle-grupo="${idGrupo}">
          <span class="grupo-mesa__titulo">${g.avulsa ? '🧾' : '🍽️'} ${escaparHtmlAdmin(g.titulo)}${g.subtitulo ? ` <span class="grupo-mesa__subtitulo">— ${escaparHtmlAdmin(g.subtitulo)}</span>` : ''}${maisRecente ? ` <span class="grupo-mesa__quando">${formatarHoraAdmin(maisRecente)}</span>` : ''}</span>
          <span class="grupo-mesa__badges">
            <span class="grupo-mesa__badge">${totalComandas} comanda${totalComandas === 1 ? '' : 's'}</span>
            <span class="grupo-mesa__badge">${totalPedidos} pedido${totalPedidos === 1 ? '' : 's'}</span>
            <span class="grupo-mesa__seta">▾</span>
          </span>
        </button>
        <div id="${idGrupo}" class="grupo-mesa__corpo oculto">
          ${g.linhas.map(renderizarLinha).join('')}
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-toggle-grupo]');
  if (!botao) return;
  document.getElementById(botao.dataset.toggleGrupo)?.classList.toggle('oculto');
  botao.classList.toggle('grupo-mesa__cabecalho--aberto');
});

function renderizarListaMovimentacao(linhas, opcoes = {}) {
  const { mostrarAtendente = false, mostrarCorrigir = true } = opcoes;
  if (!linhas || linhas.length === 0) {
    return '<p class="aba__descricao">Nenhuma movimentação nesse período.</p>';
  }
  const renderizarLinha = (c, indice) => {
    const status = c.status || 'fechada';
    const itens = c.itens || (c.rodadas || []).flatMap(r => Array.isArray(r.itens) ? r.itens : []);
    const idUnico = `mov-${c.id || indice}-${indice}`;
    const numero = c.numero != null ? c.numero : c.numero_comanda;
    const tipoVenda = c.tipo_venda || (c.origem === 'comanda' || c.mesa_cliente?.startsWith('Mesa') ? 'Mesa' : 'Balcão');
    const atendentePor = mostrarAtendente
      ? ` <span style="font-weight:600;color:var(--admin-cor-texto-claro);">— atendido por ${escaparHtmlAdmin(rotularNomeComCargo(c.funcionario_nome, c.funcionario_cargo))}</span>`
      : '';
    // "Pago no caixa" -- essa mesa e do garcom, mas quem recebeu o
    // dinheiro foi outra pessoa (caixa/gerente/admin/proprietario). Fica
    // marcado separado dos valores que ele mesmo recebeu, pra nao virar
    // prova contra a pessoa errada numa duvida de fechamento. Sempre com
    // cargo junto do nome -- "recebido por Admin 1" sozinho nao diz se
    // foi o caixa, o gerente ou o proprio dono que cobrou.
    const tagPagoNoCaixa = c.pago_no_caixa
      ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:0.72rem;font-weight:600;">💰 Recebido no caixa por ${escaparHtmlAdmin(rotularNomeComCargo(c.fechada_por_funcionario_nome, c.fechada_por_funcionario_cargo))}</span>`
      : (c.origem === 'pedido' && c.fechada_por_funcionario_nome
          ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:0.72rem;font-weight:600;">🧾 Lançado por ${escaparHtmlAdmin(rotularNomeComCargo(c.fechada_por_funcionario_nome, c.fechada_por_funcionario_cargo))}</span>`
          : '');
    const botaoCorrigir = mostrarCorrigir && status === 'fechada' && c.origem !== 'pedido'
      ? `<button type="button" class="comanda-movimentacao__corrigir" data-corrigir-comanda="${c.id}" data-mesa="${escaparHtmlAdmin(c.mesa_cliente)}" data-subtotal="${c.subtotal}" data-gorjeta="${c.gorjeta || 0}">✏️ Corrigir</button>`
      : '';
    return `
      <div class="comanda-movimentacao">
        <div class="comanda-movimentacao__cabecalho">
          <span class="comanda-movimentacao__mesa">${tipoVenda === 'Entrega' ? '🛵' : tipoVenda === 'Mesa' ? '🍽️' : '🧾'} ${escaparHtmlAdmin(c.mesa_cliente)}${numero != null ? ` <span style="font-weight:400;color:var(--admin-cor-texto-claro);">#${numero}</span>` : ''}${atendentePor}</span>
          <span class="comanda-movimentacao__status comanda-movimentacao__status--${status === 'aberta' ? 'aberta' : 'fechada'}">${status === 'aberta' ? 'Aberta' : formatarHoraAdmin(c.quando || c.fechada_em)}</span>
        </div>
        <div style="font-size:0.72rem;color:var(--admin-cor-texto-claro);margin:2px 0 4px;">${tipoVenda}${tagPagoNoCaixa ? ' · ' : ''}${tagPagoNoCaixa}</div>
        <button type="button" class="comanda-movimentacao__ver-detalhe" data-toggle-detalhe="${idUnico}" style="background:none;border:none;color:var(--admin-cor-primaria,#2563eb);font-size:0.78rem;padding:0;cursor:pointer;">🔍 Ver itens do pedido</button>
        <div id="${idUnico}" class="oculto" style="margin-top:6px;">
          ${itens.length === 0 ? '<p class="aba__descricao">Sem itens detalhados.</p>' : itens.map(item => `
            <div class="comanda-movimentacao__linha-item"><span>${item.quantidade}x ${escaparHtmlAdmin(item.nome)}</span><span>R$ ${formatarMoedaAdmin(item.preco * item.quantidade)}</span></div>
          `).join('')}
          <div class="comanda-movimentacao__linha-item"><span>Forma de pagamento</span><span>${FORMAS_PAGAMENTO_LEGENDA[c.forma_pagamento] || c.forma_pagamento || '-'}</span></div>
        </div>
        <div class="comanda-movimentacao__rodape">
          <span>${status === 'fechada' ? (FORMAS_PAGAMENTO_LEGENDA[c.forma_pagamento] || c.forma_pagamento) : 'Aguardando fechamento'}</span>
          <span class="comanda-movimentacao__total">R$ ${formatarMoedaAdmin(c.total)}</span>
          ${botaoCorrigir}
        </div>
      </div>
    `;
  };
  return renderizarGruposMovimentacao(linhas, (c) => {
    contadorLinhaMovimentacao++;
    return renderizarLinha(c, contadorLinhaMovimentacao);
  });
}
let contadorLinhaMovimentacao = 0;

document.addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-toggle-detalhe]');
  if (!botao) return;
  document.getElementById(botao.dataset.toggleDetalhe)?.classList.toggle('oculto');
});
function renderizarResumoFuncionario(dados) {
  const { funcionario, tipo } = dados;

  document.getElementById('resumo-funcionario-nome').textContent = funcionario.nome;
  document.getElementById('identificacao-nome-completo').textContent = funcionario.nome;
  document.getElementById('identificacao-cargo').textContent = funcionario.cargo;
  document.getElementById('identificacao-email').textContent = funcionario.email || '';
  document.getElementById('resumo-funcionario-data').textContent = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const logo = ESTADO.estabelecimento?.logo_apps_url;
  document.getElementById('resumo-funcionario-logo').classList.toggle('oculto', !logo);
  document.getElementById('resumo-funcionario-logo-generico').classList.toggle('oculto', !!logo);
  if (logo) document.getElementById('resumo-funcionario-logo').src = logo;

  document.getElementById('resumo-funcionario-sem-dados').classList.toggle('oculto', tipo !== 'sem_dados');
  document.getElementById('resumo-funcionario-caixa-hoje').classList.toggle('oculto', tipo !== 'caixa');

  // Atualiza os rotulos de tela pro periodo selecionado (nao fica preso a
  // "hoje" quando o proprietario/gerente escolhe outro periodo).
  const rotuloRecebido = document.getElementById('titulo-recebido-caixa-periodo');
  if (rotuloRecebido) rotuloRecebido.textContent = RECEBIDO_LABEL_PERIODO[periodoResumoFuncionarioAtual] || RECEBIDO_LABEL_PERIODO.hoje;
  const rotuloVendas = document.getElementById('rotulo-card-vendas');
  if (rotuloVendas) rotuloVendas.textContent = VENDAS_LABEL_PERIODO[periodoResumoFuncionarioAtual] || VENDAS_LABEL_PERIODO.hoje;
  const rotuloGorjetas = document.getElementById('titulo-gorjetas-periodo');
  if (rotuloGorjetas) rotuloGorjetas.textContent = GORJETAS_LABEL_PERIODO[periodoResumoFuncionarioAtual] || GORJETAS_LABEL_PERIODO.hoje;
  const rotuloMovimentacao = document.getElementById('titulo-movimentacao-periodo');
  if (rotuloMovimentacao) rotuloMovimentacao.textContent = MOVIMENTACAO_LABEL_PERIODO[periodoResumoFuncionarioAtual] || MOVIMENTACAO_LABEL_PERIODO.hoje;

  if (tipo === 'caixa') {
    // Caixa nunca "abre" mesa, mas os cards de resumo (Vendas do dia,
    // Ticket médio, Fechamento de caixa por forma de pagamento) valem
    // igual pra ele -- sao o dinheiro que ELE recebeu. So a aba
    // "Pedidos" (que mostra comandas em aberto, que nao existe pro
    // caixa) fica escondida; "Caixa" e "Histórico" continuam.
    document.getElementById('resumo-funcionario-conteudo').classList.remove('oculto');
    document.getElementById('tela-resumo-pedidos').style.display = 'none';
    document.getElementById('tela-resumo-caixa').style.display = '';
    document.querySelectorAll('.resumo-funcionario__aba-btn[data-tela-resumo="pedidos"]').forEach(b => b.classList.add('oculto'));
    document.querySelectorAll('.resumo-funcionario__aba-btn[data-tela-resumo="caixa"]').forEach(b => b.classList.remove('oculto'));
    document.querySelector('.resumo-funcionario__alternador').classList.remove('oculto');

    const { resumo, pagamentos_hoje, fechamento_caixa } = dados;
    preencherCardsResumo(resumo, fechamento_caixa);

    document.getElementById('caixa-total-hoje').textContent = `R$ ${formatarMoedaAdmin(resumo.total_recebido_hoje)}`;
    document.getElementById('caixa-qtd-hoje').textContent = resumo.pagamentos_hoje;
    document.getElementById('lista-caixa-pagamentos-hoje').innerHTML = renderizarListaMovimentacao(pagamentos_hoje || [], { mostrarAtendente: true, mostrarCorrigir: false });

    telaResumoAtiva = 'caixa';
    aplicarTelaResumoAtiva();
    // Mesmo motivo do bloco de garcom/gerente/administrador mais abaixo:
    // em telas largas todas as sub-abas ficam visiveis de uma vez (sem
    // botao pra clicar), entao o Historico precisa carregar sozinho.
    // Usa funcionario.id (nao a variavel global funcionarioIdResumoAberto
    // -- ela so e atualizada DEPOIS que essa funcao roda, entao aqui
    // dentro ainda estaria com o id do funcionario anterior).
    carregarHistoricoFuncionario(funcionario.id, 1, false);
    return;
  }

  document.querySelectorAll('.resumo-funcionario__aba-btn[data-tela-resumo="pedidos"], .resumo-funcionario__aba-btn[data-tela-resumo="caixa"]').forEach(b => b.classList.remove('oculto'));
  document.getElementById('tela-resumo-pedidos').style.display = '';
  document.getElementById('tela-resumo-caixa').style.display = '';
  document.getElementById('resumo-funcionario-conteudo').classList.toggle('oculto', tipo === 'sem_dados');
  document.querySelector('.resumo-funcionario__alternador').classList.toggle('oculto', tipo === 'sem_dados');
  if (tipo === 'sem_dados') return;

  const { resumo, comandas_hoje, fechamento_caixa } = dados;
  preencherCardsResumo(resumo, fechamento_caixa);

  // Lista de gorjetas individuais (nao so o total) -- uma linha por comanda
  // fechada com gorjeta > 0, mais recente primeiro, com mesa e horário.
  document.getElementById('painel-gorjetas-total').textContent = `R$ ${formatarMoedaAdmin(resumo.gorjetas_do_dia || 0)}`;
  const gorjetasIndividuais = (comandas_hoje || [])
    .filter(c => c.status === 'fechada' && Number(c.gorjeta) > 0)
    .sort((a, b) => new Date(b.fechada_em) - new Date(a.fechada_em));
  const listaGorjetas = document.getElementById('lista-gorjetas-hoje');
  if (gorjetasIndividuais.length === 0) {
    listaGorjetas.innerHTML = '<p class="aba__descricao">Nenhuma gorjeta nesse período.</p>';
  } else {
    listaGorjetas.innerHTML = gorjetasIndividuais.map(c => `
      <div class="painel-gorjetas__item">
        <span>
          <span class="painel-gorjetas__item-mesa">${escaparHtmlAdmin(c.mesa_cliente)}</span>
          <span class="painel-gorjetas__item-hora">${formatarHoraAdmin(c.fechada_em)}</span>
        </span>
        <span class="painel-gorjetas__item-valor">R$ ${formatarMoedaAdmin(c.gorjeta)}</span>
      </div>
    `).join('');
  }

  const container = document.getElementById('lista-movimentacao-comandas');
  container.innerHTML = renderizarListaMovimentacao(comandas_hoje, { mostrarAtendente: false, mostrarCorrigir: true });
  container.querySelectorAll('[data-corrigir-comanda]').forEach(botao => {
    botao.addEventListener('click', () => abrirModalCorrigirComanda(botao));
  });

  // Sempre volta pra tela "Pedidos" ao abrir um funcionario novo (celular).
  telaResumoAtiva = 'pedidos';
  aplicarTelaResumoAtiva();
  // Carrega o Historico completo de qualquer forma, mesmo sem clicar na
  // aba dele -- em telas largas (900px+, inclusive celular em "modo
  // Desktop" do Chrome) o CSS mostra TODAS as sub-abas empilhadas de uma
  // vez (sem os botoes de aba pra clicar), entao esperar o clique deixava
  // esse bloco pra sempre vazio nesse modo. Usa funcionario.id direto
  // pelo mesmo motivo do bloco do caixa acima.
  carregarHistoricoFuncionario(funcionario.id, 1, false);
}

function aplicarTelaResumoAtiva() {
  document.querySelectorAll('.resumo-funcionario__aba-btn').forEach(b => b.classList.toggle('ativo', b.dataset.telaResumo === telaResumoAtiva));
  document.getElementById('tela-resumo-pedidos').classList.toggle('resumo-funcionario__tela--ativa', telaResumoAtiva === 'pedidos');
  document.getElementById('tela-resumo-caixa').classList.toggle('resumo-funcionario__tela--ativa', telaResumoAtiva === 'caixa');
  document.getElementById('tela-resumo-historico').classList.toggle('resumo-funcionario__tela--ativa', telaResumoAtiva === 'historico');
  if (telaResumoAtiva === 'historico' && funcionarioIdResumoAberto) {
    carregarHistoricoFuncionario(funcionarioIdResumoAberto, 1, false);
  }
}

document.querySelectorAll('.resumo-funcionario__aba-btn').forEach(botao => {
  botao.addEventListener('click', () => {
    telaResumoAtiva = botao.dataset.telaResumo;
    aplicarTelaResumoAtiva();
  });
});

// ===================== Histórico completo do funcionário (todas as =====
// ===================== comandas fechadas, sem limite de data) ==========
// Guardado pra sempre no banco (nunca ha limpeza automatica por idade) --
// aqui so pagina em blocos de 50 pra nao carregar anos de dado de uma vez.

let historicoFuncionarioPagina = 1;
const HISTORICO_FUNCIONARIO_POR_PAGINA = 50;

async function carregarHistoricoFuncionario(funcionarioId, pagina, acrescentar) {
  const container = document.getElementById('lista-historico-funcionario');
  historicoFuncionarioPagina = pagina;
  if (!acrescentar) container.innerHTML = '<p class="aba__descricao">Carregando...</p>';

  try {
    const comandas = await apiHistoricoComandasFuncionario(funcionarioId, pagina, HISTORICO_FUNCIONARIO_POR_PAGINA);
    if (!acrescentar) container.innerHTML = '';
    document.getElementById('botao-carregar-mais-historico-funcionario')?.remove();

    if (comandas.length === 0 && !acrescentar) {
      container.innerHTML = '<p class="aba__descricao">Esse funcionário ainda não tem nenhuma comanda no histórico.</p>';
      return;
    }

    const formasLegenda = { dinheiro: 'Dinheiro', pix: 'PIX', cartao_credito: 'Cartão Crédito', cartao_debito: 'Cartão Débito' };
    const renderizarLinhaHistorico = (c) => {
      const aberta = c.status === 'aberta';
      return `
      <div class="comanda-movimentacao">
        <div class="comanda-movimentacao__cabecalho">
          <span class="comanda-movimentacao__mesa">${escaparHtmlAdmin(c.mesa_cliente)}${c.numero_comanda ? ` <span style="font-weight:600;color:var(--admin-cor-texto-claro);">#${c.numero_comanda}</span>` : ''}</span>
          <span class="comanda-movimentacao__status ${aberta ? 'comanda-movimentacao__status--aberta' : 'comanda-movimentacao__status--fechada'}">${aberta ? 'Aberta' : formatarHoraAdmin(c.fechada_em)}</span>
        </div>
        <div style="font-size:0.72rem;color:var(--admin-cor-texto-claro);margin:2px 0 4px;">${c.total_pedidos != null ? `${c.total_pedidos} pedido${c.total_pedidos === 1 ? '' : 's'} nessa comanda` : ''}</div>
        <div class="comanda-movimentacao__rodape">
          <span>${aberta ? 'Aguardando fechamento' : (formasLegenda[c.forma_pagamento] || c.forma_pagamento || '-')}</span>
          <span class="comanda-movimentacao__total">R$ ${formatarMoedaAdmin(aberta ? c.subtotal : c.total)}</span>
          <button type="button" class="comanda-movimentacao__corrigir" data-ver-historico-comanda="${c.id}">👁️ Ver itens</button>
        </div>
      </div>
    `;
    };
    const listaHtml = renderizarGruposMovimentacao(comandas, renderizarLinhaHistorico, agruparComandasPorMesa);
    container.insertAdjacentHTML('beforeend', listaHtml);
    container.querySelectorAll('[data-ver-historico-comanda]:not([data-ligado])').forEach(botao => {
      botao.dataset.ligado = '1';
      botao.addEventListener('click', () => abrirDetalheHistoricoComanda(botao.dataset.verHistoricoComanda));
    });

    if (comandas.length === HISTORICO_FUNCIONARIO_POR_PAGINA) {
      container.insertAdjacentHTML('beforeend', `<button type="button" id="botao-carregar-mais-historico-funcionario" class="botao-secundario" style="width:100%;margin-top:10px;">Carregar mais</button>`);
      document.getElementById('botao-carregar-mais-historico-funcionario').addEventListener('click', () => {
        carregarHistoricoFuncionario(funcionarioId, historicoFuncionarioPagina + 1, true);
      });
    }
  } catch (erro) {
    if (!acrescentar) container.innerHTML = `<p class="erro-form">${escaparHtmlAdmin(erro.message)}</p>`;
    else mostrarToast(erro.message, true);
  }
}

async function abrirDetalheHistoricoComanda(comandaId) {
  const conteudo = document.getElementById('historico-comanda-conteudo');
  document.getElementById('historico-comanda-titulo').textContent = 'Carregando...';
  conteudo.innerHTML = '';
  document.getElementById('modal-historico-comanda').classList.remove('oculto');

  try {
    const comanda = await apiObterComanda(comandaId);
    document.getElementById('historico-comanda-titulo').textContent = comanda.numero_comanda
      ? `${comanda.mesa_cliente} · Comanda #${comanda.numero_comanda}`
      : comanda.mesa_cliente;

    const formasLegenda = { dinheiro: 'Dinheiro', pix: 'PIX', cartao_credito: 'Cartão Crédito', cartao_debito: 'Cartão Débito' };
    conteudo.innerHTML = `
      <div class="comanda-movimentacao__linha-item"><span>Aberta em</span><span>${formatarHoraAdmin(comanda.aberta_em)}</span></div>
      <div class="comanda-movimentacao__linha-item"><span>Fechada em</span><span>${formatarHoraAdmin(comanda.fechada_em)}</span></div>
      <div class="comanda-movimentacao__linha-item"><span>Forma de pagamento</span><span>${formasLegenda[comanda.forma_pagamento] || comanda.forma_pagamento || '-'}${comanda.pago_no_caixa ? ' · 💳 pago no caixa' : ''}</span></div>
      <div class="comanda-movimentacao__linha-item"><span>Subtotal</span><span>R$ ${formatarMoedaAdmin(comanda.subtotal)}</span></div>
      <div class="comanda-movimentacao__linha-item"><span>Gorjeta</span><span>R$ ${formatarMoedaAdmin(comanda.gorjeta)}</span></div>
      <div class="comanda-movimentacao__linha-item"><strong>Total</strong><strong>R$ ${formatarMoedaAdmin(comanda.total)}</strong></div>
      <div class="resumo-funcionario__secao-titulo" style="margin-top:14px;">ITENS PEDIDOS</div>
      ${(comanda.rodadas || []).map(rodada => `
        <div style="border-top:1px solid var(--admin-cor-borda);padding-top:8px;margin-top:8px;">
          <div style="font-size:0.78rem;font-weight:700;color:var(--admin-cor-texto-claro);margin-bottom:4px;">
            ${formatarHoraAdmin(rodada.criado_em)}${rodada.numero_pedido ? ` · Pedido #${rodada.numero_pedido}` : ''} · R$ ${formatarMoedaAdmin(rodada.subtotal)}
          </div>
          ${(Array.isArray(rodada.itens) ? rodada.itens : []).map(item => `
            <div class="comanda-movimentacao__linha-item"><span>${item.quantidade}x ${escaparHtmlAdmin(item.nome)}</span><span>R$ ${formatarMoedaAdmin(item.preco * item.quantidade)}</span></div>
          `).join('')}
          ${rodada.observacoes ? `<div class="aba__descricao" style="margin-top:4px;">Obs: ${escaparHtmlAdmin(rodada.observacoes)}</div>` : ''}
        </div>
      `).join('')}
    `;
  } catch (erro) {
    conteudo.innerHTML = `<p class="erro-form">${escaparHtmlAdmin(erro.message)}</p>`;
  }
}

function abrirModalCorrigirComanda(botao) {
  comandaIdEmCorrecao = botao.getAttribute('data-corrigir-comanda');
  document.getElementById('modal-corrigir-comanda-descricao').textContent = `Comanda: ${botao.getAttribute('data-mesa')}`;
  document.getElementById('input-corrigir-subtotal').value = botao.getAttribute('data-subtotal');
  document.getElementById('input-corrigir-gorjeta').value = botao.getAttribute('data-gorjeta');
  document.getElementById('input-corrigir-motivo').value = '';
  document.getElementById('erro-corrigir-comanda').classList.add('oculto');
  document.getElementById('modal-corrigir-comanda').classList.remove('oculto');
}

document.getElementById('botao-confirmar-corrigir-comanda')?.addEventListener('click', async () => {
  const erroEl = document.getElementById('erro-corrigir-comanda');
  erroEl.classList.add('oculto');
  const subtotal = document.getElementById('input-corrigir-subtotal').value;
  const gorjeta = document.getElementById('input-corrigir-gorjeta').value;
  const motivo = document.getElementById('input-corrigir-motivo').value;
  try {
    await apiCorrigirValoresComanda(comandaIdEmCorrecao, { subtotal, gorjeta, motivo });
    document.getElementById('modal-corrigir-comanda').classList.add('oculto');
    mostrarToast('Valores corrigidos com sucesso.');
    if (funcionarioIdPendenteSenha) await abrirResumoFuncionario(funcionarioIdPendenteSenha);
  } catch (erro) {
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
  }
});

function coletarCargaHorariaMarcada(prefixoClasse, idInicio, idFim) {
  const dias = Array.from(document.querySelectorAll(`.${prefixoClasse}-carga-dia:checked`)).map(cb => cb.value);
  const inicio = document.getElementById(idInicio).value || null;
  const fim = document.getElementById(idFim).value || null;
  return { dias, inicio, fim };
}

function preencherCargaHorariaMarcada(prefixoClasse, idInicio, idFim, carga) {
  const dias = (carga && carga.dias) || [];
  document.querySelectorAll(`.${prefixoClasse}-carga-dia`).forEach(cb => { cb.checked = dias.includes(cb.value); });
  document.getElementById(idInicio).value = (carga && carga.inicio) || '';
  document.getElementById(idFim).value = (carga && carga.fim) || '';
}

const NOMES_DIA_SEMANA = { dom: 'Dom', seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sab' };
function formatarCargaHoraria(carga) {
  if (!carga || !carga.dias || carga.dias.length === 0) return '';
  const ORDEM_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const dias = ORDEM_DIAS.filter(d => carga.dias.includes(d)).map(d => NOMES_DIA_SEMANA[d]).join(', ');
  const horario = carga.inicio && carga.fim ? ` ${carga.inicio}–${carga.fim}` : '';
  return `${dias}${horario}`;
}

function renderizarFuncionariosAdmin() {
  const lista = document.getElementById('lista-funcionarios-admin');
  if (!ESTADO.funcionarios || ESTADO.funcionarios.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhum funcionario cadastrado ainda.</div>';
    return;
  }

  const ordenados = [...ESTADO.funcionarios].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  lista.innerHTML = ordenados.map(f => {
    const cargaFormatada = formatarCargaHoraria(f.carga_horaria);
    return `
    <div class="item-admin item-admin--drag" draggable="true" data-funcionario-drag-id="${f.id}">
      <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
      <div class="item-admin__info">
        <div class="item-admin__titulo">${escaparHtmlAdmin(f.nome)} ${!f.ativo ? '(inativo)' : ''}</div>
        <div class="item-admin__subtitulo">${NOMES_CARGO[f.cargo] || f.cargo} - ${escaparHtmlAdmin(f.email)}</div>
        ${cargaFormatada ? `<div class="item-admin__subtitulo">🕒 ${cargaFormatada}</div>` : ''}
      </div>
      <div class="item-admin__acoes">
        <button data-editar-funcionario="${f.id}">Editar</button>
      </div>
    </div>
  `;
  }).join('');

  lista.querySelectorAll('[data-editar-funcionario]').forEach(b => {
    b.addEventListener('click', () => abrirModalEditarFuncionario(b.getAttribute('data-editar-funcionario')));
  });

  configurarDragDropFuncionarios(lista);
}

function configurarDragDropFuncionarios(lista) {
  lista.querySelectorAll('.item-admin--drag[data-funcionario-drag-id]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcFuncionarioId = item.getAttribute('data-funcionario-drag-id');
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
      const targetId = item.getAttribute('data-funcionario-drag-id');
      if (dragSrcFuncionarioId === targetId) return;

      const ordenados = [...ESTADO.funcionarios].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const indiceSrc = ordenados.findIndex(f => f.id === dragSrcFuncionarioId);
      const indiceTarget = ordenados.findIndex(f => f.id === targetId);
      if (indiceSrc === -1 || indiceTarget === -1) return;

      const reordenados = [...ordenados];
      const [movido] = reordenados.splice(indiceSrc, 1);
      reordenados.splice(indiceTarget, 0, movido);

      try {
        await Promise.all(reordenados.map((f, i) => {
          if (f.ordem !== i) return apiAtualizarFuncionario(f.id, { ordem: i });
        }).filter(Boolean));
        ESTADO.funcionarios = await apiListarFuncionarios();
        renderizarFuncionariosAdmin();
        mostrarToast('Ordem atualizada!');
      } catch (erro) {
        mostrarToast(erro.message || 'Erro ao reordenar funcionarios.', true);
        ESTADO.funcionarios = await apiListarFuncionarios();
        renderizarFuncionariosAdmin();
      }
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

  document.getElementById('botao-abrir-cadastro-funcionarios')?.addEventListener('click', mostrarVistaCadastroFuncionarios);
  document.getElementById('botao-voltar-equipe')?.addEventListener('click', () => {
    mostrarVistaEquipe();
    carregarEquipeOperacional();
  });

  // Cozinha e entregador so conseguem operar o fluxo de pedidos se
  // tiverem a permissao "mudar_status_pedidos". Ja deixa marcada por
  // padrao (o administrador ainda pode desmarcar antes de cadastrar).
  const autoMarcarMudarStatus = (idCargo, idGrupoPermissoes) => {
    document.getElementById(idCargo).addEventListener('change', function () {
      if (this.value === 'cozinha' || this.value === 'entregador') {
        const caixa = document.querySelector(`#${idGrupoPermissoes} input[value="mudar_status_pedidos"]`);
        if (caixa) caixa.checked = true;
      }
    });
  };
  autoMarcarMudarStatus('func-cargo', 'grupo-permissoes-funcionario');
  autoMarcarMudarStatus('edit-func-cargo', 'edit-grupo-permissoes');

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
        permissoes: coletarPermissoesMarcadas('grupo-permissoes-funcionario'),
        carga_horaria: coletarCargaHorariaMarcada('func', 'func-carga-inicio', 'func-carga-fim')
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
        permissoes: coletarPermissoesMarcadas('edit-grupo-permissoes'),
        carga_horaria: coletarCargaHorariaMarcada('edit-func', 'edit-func-carga-inicio', 'edit-func-carga-fim')
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
  preencherCargaHorariaMarcada('edit-func', 'edit-func-carga-inicio', 'edit-func-carga-fim', f.carga_horaria);

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

document.getElementById('botao-ver-qrcode-entregador')?.addEventListener('click', async () => {
  try {
    const resultado = await apiObterQrcodeEntregador();
    document.getElementById('imagem-qrcode-entregador').src = resultado.qrcode_base64;
    const elCodigo = document.getElementById('codigo-qrcode-entregador');
    elCodigo.removeAttribute('href');
    elCodigo.textContent = resultado.codigo;
    document.getElementById('botao-copiar-link-acesso').setAttribute('data-copiar', resultado.codigo);
    document.getElementById('modal-qrcode-entregador').classList.remove('oculto');
  } catch (erro) {
    mostrarToast(erro.message || 'Erro ao gerar o QR Code do dia.', true);
  }
});

document.getElementById('botao-copiar-link-acesso')?.addEventListener('click', async (evento) => {
  const conteudo = evento.currentTarget.getAttribute('data-copiar');
  if (!conteudo) return;
  try {
    await navigator.clipboard.writeText(conteudo);
    mostrarToast('Copiado!');
  } catch (erro) {
    mostrarToast('Nao foi possivel copiar automaticamente. Selecione o texto manualmente.', true);
  }
});

document.querySelectorAll('[data-fechar-modal-admin]').forEach(el => {
  el.addEventListener('click', fecharModaisAdmin);
});

function fecharModaisAdmin() {
  document.querySelectorAll('.modal-admin').forEach(m => m.classList.add('oculto'));
}

function formatarMoedaAdmin(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor) || 0);
}

function formatarHoraAdmin(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
// 
