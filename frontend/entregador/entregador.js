// ===================================================================
// App do Entregador - login proprio, checkin diario por QR Code e
// fluxo de oferta/aceite/recusa/conclusao de entregas.
// Depende de API_BASE_URL (definido em ../js/config.js) e da lib jsQR.
// ===================================================================

const CHAVE_TOKEN = 'mimenu_entregador_token';
const CHAVE_DADOS = 'mimenu_entregador_dados';
// Guarda o codigo do QR do dia que ja funcionou nesse aparelho, pra nao
// obrigar o entregador a escanear de novo so porque a pagina recarregou
// (internet cai na rua, troca de modo mobile/desktop, etc.). O codigo do
// QR vale o dia inteiro pra loja toda (ver backend), entao reenviar o
// mesmo codigo em outro carregamento da pagina e seguro e idempotente.
const CHAVE_CHECKIN = 'mimenu_entregador_checkin';
const INTERVALO_POLL_MS = 5000;

let streamCamera = null;
let intervaloPolling = null;

// -------------------- Sessao --------------------
// Usa localStorage (nao sessionStorage): o entregador trabalha na rua,
// recarrega a pagina por causa de internet ruim, alterna entre modo mobile
// e desktop no navegador, etc. -- sessionStorage e apagado pelo navegador
// nessas situacoes e forcava relogar toda hora. localStorage so e limpo
// quando fazemos limparSessao() (logout explicito).
function salvarSessao(token, dados) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
}
function obterToken() { return localStorage.getItem(CHAVE_TOKEN); }
function obterDados() {
  const dados = localStorage.getItem(CHAVE_DADOS);
  return dados ? JSON.parse(dados) : null;
}
function limparSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_DADOS);
}

function salvarCheckinFeito(token) {
  localStorage.setItem(CHAVE_CHECKIN, JSON.stringify({ token, dia: new Date().toDateString() }));
}
function obterCheckinValidoHoje() {
  try {
    const bruto = localStorage.getItem(CHAVE_CHECKIN);
    if (!bruto) return null;
    const info = JSON.parse(bruto);
    return info && info.dia === new Date().toDateString() ? info.token : null;
  } catch {
    return null;
  }
}

// -------------------- Chamadas de API --------------------
async function chamarApi(caminho, { method = 'GET', body = null } = {}) {
  const resposta = await fetch(`${API_BASE_URL}/funcionarios${caminho}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obterToken()}` },
    body: body ? JSON.stringify(body) : undefined
  });
  if (resposta.status === 401) {
    pararPolling();
    limparSessao();
    mostrarTela('tela-login');
    throw new Error('Sessao expirada. Faca login novamente.');
  }
  const dados = await resposta.json();
  if (resposta.status === 403 && dados.fora_do_horario) {
    pararPolling();
    mostrarTela('tela-fora-horario');
    const erro = new Error(dados.erro);
    erro.foraDoHorario = true;
    throw erro;
  }
  if (!resposta.ok) throw new Error(dados.erro || 'Ocorreu um erro ao processar a solicitacao.');
  return dados;
}

// Login por link definitivo (?acesso=TOKEN na URL) -- so pra facilitar,
// sem precisar digitar slug/usuario/senha toda vez.
async function tentarAcessoPorLink() {
  const parametros = new URLSearchParams(window.location.search);
  const token = parametros.get('acesso');
  if (!token) return false;
  try {
    const resposta = await fetch(`${API_BASE_URL}/funcionarios/acessar/${token}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Link de acesso invalido.');
    if (dados.funcionario.cargo !== 'entregador') throw new Error('Esse acesso e so para entregadores.');
    salvarSessao(dados.token, dados.funcionario);
    return true;
  } catch (erro) {
    mostrarToast(erro.message, true);
    return false;
  }
}

async function apiLogin(slug, login, senha) {
  const resposta = await fetch(`${API_BASE_URL}/funcionarios/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, login, senha })
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel entrar.');
  return dados;
}

// -------------------- Utilidades de tela --------------------
function mostrarTela(id) {
  document.querySelectorAll('.tela').forEach(t => t.classList.add('oculto'));
  document.getElementById(id).classList.remove('oculto');
}

function mostrarToast(mensagem, ehErro = false) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.toggle('erro-toast', ehErro);
  toast.classList.remove('oculto');
  setTimeout(() => toast.classList.add('oculto'), 3500);
}

function formatarPagamento(forma) {
  const nomes = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito' };
  return nomes[forma] || forma || '-';
}

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarHora(dataISO) {
  if (!dataISO) return '-';
  return new Date(dataISO).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function enderecoParaLinkMaps(endereco) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco || '')}`;
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// -------------------- Login --------------------
document.getElementById('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erroEl = document.getElementById('login-erro');
  erroEl.classList.add('oculto');
  try {
    const slug = document.getElementById('login-slug').value.trim();
    const login = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value;

    const resultado = await apiLogin(slug, login, senha);

    if (resultado.funcionario.cargo !== 'entregador') {
      throw new Error('Esse acesso é só para entregadores. Use o painel administrativo normal.');
    }

    salvarSessao(resultado.token, resultado.funcionario);
    iniciarAppLogado();
  } catch (erro) {
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
  }
});

// -------------------- Checkin por QR Code --------------------
// Le o QR com a API nativa do navegador (BarcodeDetector), que ja vem
// embutida no Chrome/Android -- sem depender de nenhuma biblioteca externa
// via CDN. So usa o jsQR (externo) como reserva, pra navegadores antigos
// que nao tem BarcodeDetector (ex: Safari/iOS mais antigo).
function suportaBarcodeDetectorNativo() {
  return 'BarcodeDetector' in window;
}

async function detectarQRNoFrame(canvas, contexto, video, detectorNativo) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  contexto.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (detectorNativo) {
    const codigos = await detectorNativo.detect(canvas);
    return codigos && codigos.length > 0 ? codigos[0].rawValue : null;
  }

  if (typeof window.jsQR === 'undefined') throw new Error('lib_jsqr_ausente');
  const imagem = contexto.getImageData(0, 0, canvas.width, canvas.height);
  const codigo = window.jsQR(imagem.data, imagem.width, imagem.height);
  return codigo && codigo.data ? codigo.data : null;
}

async function confirmarCheckin(token) {
  const resultado = await chamarApi('/checkin', { method: 'POST', body: { token } });
  salvarCheckinFeito(token);
  return resultado;
}

async function iniciarLeituraQR() {
  mostrarTela('tela-checkin');
  const video = document.getElementById('video-qr');
  const statusEl = document.getElementById('checkin-status');
  const erroEl = document.getElementById('checkin-erro');
  erroEl.classList.add('oculto');
  statusEl.textContent = 'Abrindo câmera...';

  try {
    const usaDetectorNativo = suportaBarcodeDetectorNativo();
    const detectorNativo = usaDetectorNativo ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;

    streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = streamCamera;
    await video.play();
    statusEl.textContent = 'Aponte para o QR Code da loja.';

    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('2d');
    const inicioLeitura = Date.now();
    let sugestaoManualMostrada = false;
    let lendoFrame = false;

    const lerFrame = async () => {
      if (!streamCamera) return; // tela foi trocada / camera parada

      if (!sugestaoManualMostrada && Date.now() - inicioLeitura > 12000) {
        sugestaoManualMostrada = true;
        statusEl.textContent = 'Não achou o código? Toque em "Não consigo usar a câmera" abaixo.';
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA && !lendoFrame) {
        lendoFrame = true;
        try {
          const tokenLido = await detectarQRNoFrame(canvas, contexto, video, detectorNativo);
          if (tokenLido) {
            pararCamera();
            statusEl.textContent = 'Confirmando checkin...';
            try {
              const resultado = await confirmarCheckin(tokenLido);
              mostrarToast(resultado.mensagem || 'Checkin realizado!');
              iniciarAguardandoPedido();
              return;
            } catch (erro) {
              if (erro.foraDoHorario) return; // ja trocou pra tela-fora-horario
              erroEl.textContent = erro.message;
              erroEl.classList.remove('oculto');
              statusEl.textContent = '';
              iniciarLeituraQR();
              return;
            }
          }
        } catch (erroDeteccao) {
          if (erroDeteccao.message === 'lib_jsqr_ausente') throw erroDeteccao;
          // Erro pontual de deteccao (frame ruim) -- so tenta de novo no proximo frame.
        }
        lendoFrame = false;
      }
      requestAnimationFrame(lerFrame);
    };
    requestAnimationFrame(lerFrame);
  } catch (erro) {
    if (erro.message === 'lib_jsqr_ausente') {
      erroEl.textContent = 'Não foi possível carregar o leitor de QR Code. Use "Não consigo usar a câmera" abaixo para digitar o código.';
    } else {
      erroEl.textContent = 'Não foi possível acessar a câmera. Verifique as permissões do navegador.';
    }
    erroEl.classList.remove('oculto');
    statusEl.textContent = '';
  }
}

function pararCamera() {
  if (streamCamera) {
    streamCamera.getTracks().forEach(faixa => faixa.stop());
    streamCamera = null;
  }
}

document.getElementById('botao-sair-checkin').addEventListener('click', fazerLogout);

document.getElementById('botao-nao-consigo-escanear').addEventListener('click', () => {
  pararCamera();
  document.getElementById('checkin-manual').classList.remove('oculto');
});

document.getElementById('botao-confirmar-codigo-manual').addEventListener('click', async () => {
  const erroEl = document.getElementById('checkin-erro');
  const codigo = document.getElementById('checkin-codigo-manual').value.trim();
  if (!codigo) return;
  try {
    const resultado = await confirmarCheckin(codigo);
    mostrarToast(resultado.mensagem || 'Checkin realizado!');
    iniciarAguardandoPedido();
  } catch (erro) {
    if (erro.foraDoHorario) return; // ja trocou pra tela-fora-horario
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
  }
});

// ===================================================================
// -------------------- ROTAS E VALORES (reescrito) --------------------
// Um unico estado, um unico lugar que busca os dados, uma unica funcao
// por tela. Nada aqui e calculado em dois lugares diferentes.
//
// resumoPlantaoAtual = retrato de hoje, vindo do backend (GET /plantao/atual):
//   total_entregas, total_km, total_gorjetas, valor_comissao, valor_total
//   (valor_total = comissao + caixinha = o que o entregador GANHA),
//   valor_ultima_rota, forma_pagamento_entrega, valor_por_entrega, valor_por_km.
// paradasRotaAtual = pedidos com status 'saiu_entrega' (rota ativa agora).
//
// "Total dos pedidos desta rota" (soma de pedido.total) e informativo pro
// entregador saber quanto cobrar do cliente em pedidos no dinheiro -- NUNCA
// e exibido como se fosse o ganho dele. O ganho real e sempre
// resumoPlantaoAtual.valor_total, vindo pronto do backend.
// ===================================================================

let pedidoOfertaAtual = null;
let paradasRotaAtual = [];
let resumoPlantaoAtual = null;

function iniciarAguardandoPedido() {
  const dados = obterDados();
  const primeiroNome = (dados?.nome || '').split(' ')[0];
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}! 👋` : 'Olá! 👋';
  document.getElementById('saudacao-aguardando').textContent = saudacao;
  document.getElementById('saudacao-rota').textContent = saudacao;

  mostrarTela('tela-aguardando');
  pararPolling();
  intervaloPolling = setInterval(atualizarEstadoEntregador, INTERVALO_POLL_MS);
  atualizarEstadoEntregador();
}

async function atualizarPosicaoNaFila() {
  const infoEl = document.getElementById('fila-posicao-info');
  try {
    const dados = await chamarApi('/fila/posicao');
    if (!dados.na_fila) {
      infoEl.classList.add('oculto');
      return;
    }
    const pessoasNaFrente = dados.posicao - 1;
    infoEl.textContent = pessoasNaFrente === 0
      ? 'Você é o próximo da fila!'
      : `Há ${pessoasNaFrente} entregador(es) na sua frente. Você está na posição ${dados.posicao} de ${dados.total_na_fila}.`;
    infoEl.classList.remove('oculto');
  } catch {
    infoEl.classList.add('oculto');
  }
}

function pararPolling() {
  if (intervaloPolling) {
    clearInterval(intervaloPolling);
    intervaloPolling = null;
  }
}

// Ponto unico de atualizacao: busca o resumo do plantao de hoje E o estado
// da rota (em andamento / oferta pendente / esperando) numa unica passada,
// sempre -- nao so quando ha rota ativa. E por isso que o resumo (menu
// lateral, "Plantao de hoje") nao fica mais desatualizado/zerado depois
// que a ultima entrega do dia e concluida.
async function atualizarEstadoEntregador() {
  try {
    resumoPlantaoAtual = await chamarApi('/plantao/atual').catch(() => null);

    const emAndamento = await chamarApi('/entregas/atual');
    if (Array.isArray(emAndamento) && emAndamento.length > 0) {
      paradasRotaAtual = emAndamento;
      exibirRotaEmAndamento();
      return;
    }

    paradasRotaAtual = [];
    const oferta = await chamarApi('/entregas/pendente');
    if (oferta) {
      pedidoOfertaAtual = oferta;
      exibirOfertaDeEntrega(oferta);
      return;
    }

    if (document.getElementById('tela-aguardando').classList.contains('oculto')) {
      mostrarTela('tela-aguardando');
    }
    atualizarPosicaoNaFila();
  } catch (erro) {
    // Erro de rede pontual durante o polling nao precisa travar a tela.
    console.warn('Erro ao verificar entregas:', erro.message);
  }
}

function exibirOfertaDeEntrega(pedido) {
  document.getElementById('oferta-cliente').textContent = pedido.cliente_nome || '-';
  document.getElementById('oferta-endereco').textContent = pedido.cliente_endereco || '-';
  document.getElementById('oferta-telefone').textContent = pedido.cliente_telefone || '-';
  document.getElementById('oferta-total').textContent = formatarMoeda(pedido.total);
  document.getElementById('oferta-pagamento').textContent = formatarPagamento(pedido.forma_pagamento);
  mostrarTela('tela-oferta');
}

document.getElementById('botao-aceitar').addEventListener('click', async () => {
  if (!pedidoOfertaAtual) return;
  try {
    await chamarApi(`/entregas/${pedidoOfertaAtual.id}/aceitar`, { method: 'PUT' });
    pedidoOfertaAtual = null;
    atualizarEstadoEntregador();
  } catch (erro) {
    mostrarToast(erro.message, true);
    atualizarEstadoEntregador();
  }
});

document.getElementById('botao-recusar').addEventListener('click', async () => {
  if (!pedidoOfertaAtual) return;
  try {
    await chamarApi(`/entregas/${pedidoOfertaAtual.id}/recusar`, { method: 'PUT' });
    pedidoOfertaAtual = null;
    mostrarToast('Entrega recusada.');
    iniciarAguardandoPedido();
  } catch (erro) {
    mostrarToast(erro.message, true);
    atualizarEstadoEntregador();
  }
});

// Tela de rota em andamento: proxima parada em destaque + demais paradas
// (se o admin atribuiu mais de um pedido pra essa rota) + resumo do dia.
function exibirRotaEmAndamento() {
  const paradas = paradasRotaAtual;
  const proxima = paradas[0];
  const restantes = paradas.slice(1);

  const realizadasHoje = resumoPlantaoAtual?.total_entregas ?? 0;
  const totalRota = paradas.length + realizadasHoje;
  const posicaoAtual = realizadasHoje + 1;

  document.getElementById('rota-contador').textContent = `${posicaoAtual} de ${totalRota} entregas`;

  document.getElementById('rota-proxima-cliente').textContent = proxima.cliente_nome || '-';
  document.getElementById('rota-proxima-endereco').textContent = proxima.cliente_endereco || '-';
  document.getElementById('rota-proxima-total').textContent = formatarMoeda(proxima.total);
  document.getElementById('rota-proxima-pagamento').textContent = formatarPagamento(proxima.forma_pagamento);
  document.getElementById('rota-botao-navegar').href = enderecoParaLinkMaps(proxima.cliente_endereco);

  document.getElementById('rota-data').textContent = proxima.horario_saiu_entrega
    ? new Date(proxima.horario_saiu_entrega).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  document.getElementById('rota-inicio').textContent = formatarHora(proxima.horario_saiu_entrega);

  // Total dos PEDIDOS desta rota (o que os clientes pagam) -- so pra saber
  // quanto cobrar em caso de dinheiro. Nao e ganho do entregador.
  const totalPedidosRota = paradas.reduce((soma, p) => soma + (parseFloat(p.total) || 0), 0);
  document.getElementById('rota-valor-total').textContent = formatarMoeda(totalPedidosRota);

  // Ganho real de hoje (comissao + caixinha), vindo pronto do backend.
  const ganhoHoje = resumoPlantaoAtual?.valor_total ?? 0;
  const caixinhaHoje = resumoPlantaoAtual?.total_gorjetas ?? 0;
  document.getElementById('rota-resumo-andamento').textContent = paradas.length;
  document.getElementById('rota-resumo-realizadas').textContent = realizadasHoje;
  document.getElementById('rota-resumo-total').textContent = formatarMoeda(ganhoHoje);
  document.getElementById('rota-resumo-caixinha').textContent = formatarMoeda(caixinhaHoje);

  const listaEl = document.getElementById('lista-paradas-restantes');
  if (restantes.length === 0) {
    listaEl.innerHTML = '';
  } else {
    listaEl.innerHTML = `<p class="rotulo-detalhe" style="margin-bottom:8px;">Próximas paradas da rota</p>` +
      restantes.map((p, i) => `
        <div class="parada-futura">
          <strong><span class="parada-futura__numero">${i + 2}</span>${escaparHtml(p.cliente_nome || '-')}</strong>
          <span>${escaparHtml(p.cliente_endereco || '-')} · ${formatarMoeda(p.total)}</span>
        </div>
      `).join('');
  }

  mostrarTela('tela-rota');
}

document.getElementById('botao-encerrar').addEventListener('click', async () => {
  const proxima = paradasRotaAtual[0];
  if (!proxima) return;

  let distanciaKm;
  const dados = obterDados();
  if (dados && dados.formaPagamentoEntrega === 'km') {
    const valorDigitado = prompt('Quantos km você rodou nessa entrega?');
    if (valorDigitado === null) return; // cancelou
    distanciaKm = valorDigitado.replace(',', '.').trim();
    if (!distanciaKm || isNaN(parseFloat(distanciaKm))) {
      mostrarToast('Informe um valor de km válido.', true);
      return;
    }
  }

  try {
    await chamarApi(`/entregas/${proxima.id}/encerrar`, {
      method: 'PUT',
      body: distanciaKm !== undefined ? { distancia_km: distanciaKm } : {}
    });
    mostrarToast('Entrega concluída!');
    atualizarEstadoEntregador();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

document.getElementById('botao-sair-aguardando').addEventListener('click', () => {
  encerrarPlantaoEMostrarResumo();
});
document.getElementById('botao-sair-fora-horario').addEventListener('click', fazerLogout);

// -------------------- Plantao (fim + resumo de fechamento) --------------------
async function encerrarPlantaoEMostrarResumo() {
  try {
    const resumo = await chamarApi('/plantao/encerrar', { method: 'PUT' });
    pararPolling();
    exibirResumoPlantao(resumo);
  } catch (erro) {
    // Se nao tinha plantao aberto (ex: nunca fez checkin), so faz logout normal.
    fazerLogout();
  }
}

function exibirResumoPlantao(resumo) {
  const dados = obterDados();
  const porKm = dados && dados.formaPagamentoEntrega === 'km';

  document.getElementById('resumo-total-entregas').textContent = resumo.total_entregas ?? 0;
  document.getElementById('resumo-total-km').textContent = `${Number(resumo.total_km || 0).toLocaleString('pt-BR')} km`;
  document.getElementById('resumo-linha-km').classList.toggle('oculto', !porKm);
  document.getElementById('resumo-valor-total').textContent = formatarMoeda(resumo.valor_total);

  mostrarTela('tela-resumo-plantao');
}

document.getElementById('botao-sair-resumo-plantao').addEventListener('click', fazerLogout);

// -------------------- Menu lateral (painel deslizante) --------------------
function abrirMenuLateral() {
  document.getElementById('menu-lateral').classList.remove('oculto');
  document.getElementById('fundo-menu-lateral').classList.remove('oculto');
  exibirSecaoMenu('atual');
}
function fecharMenuLateral() {
  document.getElementById('menu-lateral').classList.add('oculto');
  document.getElementById('fundo-menu-lateral').classList.add('oculto');
}
document.getElementById('botao-abrir-menu-aguardando').addEventListener('click', abrirMenuLateral);
document.getElementById('botao-abrir-menu-rota').addEventListener('click', abrirMenuLateral);
document.getElementById('botao-fechar-menu').addEventListener('click', fecharMenuLateral);
document.getElementById('fundo-menu-lateral').addEventListener('click', fecharMenuLateral);

document.querySelectorAll('.menu-lateral__item').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.menu-lateral__item').forEach(b => b.classList.remove('menu-lateral__item--ativo'));
    botao.classList.add('menu-lateral__item--ativo');
    exibirSecaoMenu(botao.getAttribute('data-menu-secao'));
  });
});

function exibirSecaoMenu(secao) {
  const conteudo = document.getElementById('menu-lateral-conteudo');
  if (secao === 'atual') {
    const emRota = paradasRotaAtual.length;
    const totalPedidosRota = paradasRotaAtual.reduce((s, p) => s + (parseFloat(p.total) || 0), 0);
    const realizadas = resumoPlantaoAtual?.total_entregas ?? 0;
    const valorUltimaRota = resumoPlantaoAtual?.valor_ultima_rota;
    const gorjetasHoje = resumoPlantaoAtual?.total_gorjetas ?? 0;
    conteudo.innerHTML = `
      <p class="resumo-geral-titulo">PLANTÃO DE HOJE</p>
      <div class="resumo-geral-linha"><span>Em andamento</span><strong>${emRota}</strong></div>
      <div class="resumo-geral-linha"><span>Entregas realizadas</span><strong>${realizadas}</strong></div>
      <div class="resumo-geral-linha"><span>Total dos pedidos (rota atual)</span><strong>${formatarMoeda(totalPedidosRota)}</strong></div>
      <div class="resumo-geral-linha"><span>Valor da última rota</span><strong>${valorUltimaRota == null ? '-' : formatarMoeda(valorUltimaRota)}</strong></div>
      <div class="resumo-geral-linha"><span>Caixinha recebida hoje</span><strong>${formatarMoeda(gorjetasHoje)}</strong></div>
    `;
    return;
  }

  conteudo.innerHTML = '<p class="ajuda">Carregando...</p>';
  chamarApi('/plantao/meu-historico').then(dados => {
    const r = dados.resumo || {};
    let html = `
      <p class="resumo-geral-titulo">RESUMO GERAL</p>
      <div class="resumo-geral-linha"><span>Total de plantões</span><strong>${r.total_plantoes ?? 0}</strong></div>
      <div class="resumo-geral-linha"><span>Entregas realizadas</span><strong>${r.total_entregas ?? 0}</strong></div>
      <div class="resumo-geral-linha"><span>Total em caixinhas</span><strong>${formatarMoeda(r.total_gorjetas)}</strong></div>
      <div class="resumo-geral-linha"><span>Valor total a receber</span><strong>${formatarMoeda(r.valor_total)}</strong></div>
      <p class="resumo-geral-titulo" style="margin-top:18px;">PLANTÕES REALIZADOS</p>
    `;
    if (!dados.plantoes || dados.plantoes.length === 0) {
      html += '<p class="ajuda">Nenhum plantão encerrado ainda.</p>';
    } else {
      html += dados.plantoes.map(p => `
        <div class="item-plantao-historico">
          <div class="item-plantao-historico__data">${new Date(p.fim).toLocaleDateString('pt-BR')}</div>
          <div class="item-plantao-historico__linha"><span>${p.total_entregas} entrega(s) · caixinha ${formatarMoeda(p.total_gorjetas)}</span><span>${formatarMoeda(p.valor_total)}</span></div>
        </div>
      `).join('');
    }
    conteudo.innerHTML = html;
  }).catch(erro => {
    conteudo.innerHTML = `<p class="erro">${erro.message}</p>`;
  });
}

function fazerLogout() {
  pararCamera();
  pararPolling();
  limparSessao();
  mostrarTela('tela-login');
}

// -------------------- Inicializacao --------------------
// Se ja tem um checkin valido de hoje salvo nesse aparelho, reenvia o
// mesmo codigo em segundo plano (sem camera, sem tela de QR) e vai direto
// pra fila/rota. So mostra a tela de leitura de QR quando realmente e
// necessario: primeiro acesso do dia, ou se o codigo salvo nao for mais
// aceito pelo backend (ex: loja gerou um QR novo).
async function iniciarAppLogado() {
  const codigoSalvo = obterCheckinValidoHoje();
  if (codigoSalvo) {
    try {
      await confirmarCheckin(codigoSalvo);
      iniciarAguardandoPedido();
      return;
    } catch (erro) {
      if (erro.foraDoHorario) return; // ja mostrou tela-fora-horario
      // codigo salvo nao serve mais -- segue pro fluxo normal de leitura do QR
    }
  }
  iniciarLeituraQR();
}

(async function iniciar() {
  const token = obterToken();
  const dados = obterDados();
  if (token && dados) {
    iniciarAppLogado();
    return;
  }
  const entrouPorLink = await tentarAcessoPorLink();
  if (entrouPorLink) {
    // Limpa o token da URL (evita reenvio acidental / historico do navegador)
    window.history.replaceState({}, '', window.location.pathname);
    iniciarAppLogado();
  } else {
    mostrarTela('tela-login');
  }
})();
