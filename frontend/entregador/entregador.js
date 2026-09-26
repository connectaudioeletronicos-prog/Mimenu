// ===================================================================
// App do Entregador - login proprio, checkin diario por QR Code e
// fluxo de oferta/aceite/recusa/conclusao de entregas.
// Depende de API_BASE_URL (definido em ../js/config.js) e da lib jsQR.
// ===================================================================

const CHAVE_TOKEN = 'mimenu_entregador_token';
const CHAVE_DADOS = 'mimenu_entregador_dados';
const INTERVALO_POLL_MS = 5000;

let streamCamera = null;
let intervaloPolling = null;

// -------------------- Sessao --------------------
function salvarSessao(token, dados) {
  sessionStorage.setItem(CHAVE_TOKEN, token);
  sessionStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
}
function obterToken() { return sessionStorage.getItem(CHAVE_TOKEN); }
function obterDados() {
  const dados = sessionStorage.getItem(CHAVE_DADOS);
  return dados ? JSON.parse(dados) : null;
}
function limparSessao() {
  sessionStorage.removeItem(CHAVE_TOKEN);
  sessionStorage.removeItem(CHAVE_DADOS);
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

// Verifica se o entregador esta navegando dentro do menu (lista de opcoes
// ou o detalhe de uma secao). O polling de 5 em 5s NAO deve trocar de tela
// enquanto isso estiver true -- e o que fazia o menu "fechar sozinho" alguns
// segundos depois de aberto.
function telaMenuAberta() {
  return !document.getElementById('tela-menu-lista').classList.contains('oculto') ||
         !document.getElementById('tela-menu-detalhe').classList.contains('oculto');
}

function mostrarToast(mensagem, ehErro = false) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.toggle('erro-toast', ehErro);
  toast.classList.remove('oculto');
  setTimeout(() => toast.classList.add('oculto'), 3500);
}

function formatarPagamento(forma) {
  const nomes = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Pago online', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito' };
  return nomes[forma] || forma || '-';
}

// Classe do badge de pagamento: dinheiro (verde), pix (azul), pago
// online/cartao (roxo) -- so pra dar uma pista visual rapida ao entregador.
function classeBadgePagamento(forma) {
  if (forma === 'dinheiro') return 'badge-pagamento--dinheiro';
  if (forma === 'pix') return 'badge-pagamento--pix';
  return 'badge-pagamento--online';
}

// Preenche o bloco de forma de pagamento (+ troco quando for dinheiro) de
// um pedido num card do painel. Usado tanto na oferta quanto na rota atual.
function aplicarFormaPagamento(pedido, elBadge, elBlocoTroco, elTrocoPara, elTrocoValor) {
  elBadge.textContent = formatarPagamento(pedido.forma_pagamento);
  elBadge.className = `badge-pagamento ${classeBadgePagamento(pedido.forma_pagamento)}`;

  const temTroco = pedido.forma_pagamento === 'dinheiro' && pedido.troco_para !== null && pedido.troco_para !== undefined;
  if (elBlocoTroco) {
    elBlocoTroco.classList.toggle('oculto', !temTroco);
    if (temTroco) {
      const troco = parseFloat(pedido.troco_para) - parseFloat(pedido.total || 0);
      elTrocoPara.textContent = formatarMoeda(pedido.troco_para);
      elTrocoValor.textContent = `Troco: ${formatarMoeda(troco)}`;
    }
  }
}

// -------------------- Mostrar/ocultar senha --------------------
document.getElementById('botao-mostrar-senha').addEventListener('click', () => {
  const campo = document.getElementById('login-senha');
  const mostrando = campo.type === 'text';
  campo.type = mostrando ? 'password' : 'text';
  document.getElementById('icone-olho-aberto').classList.toggle('oculto', !mostrando);
  document.getElementById('icone-olho-fechado').classList.toggle('oculto', mostrando);
  document.getElementById('botao-mostrar-senha').setAttribute('aria-pressed', String(!mostrando));
});

// -------------------- Logo dinamica por loja (busca pelo slug digitado) --------------------
let timeoutBuscaLogo = null;
function agendarBuscaLogoDaLoja() {
  clearTimeout(timeoutBuscaLogo);
  timeoutBuscaLogo = setTimeout(buscarLogoDaLoja, 500);
}
async function buscarLogoDaLoja() {
  const slug = document.getElementById('login-slug').value.trim();
  const imagemEl = document.getElementById('logo-entrada-imagem');
  const placeholderEl = document.getElementById('logo-entrada-placeholder');
  if (!slug) {
    imagemEl.classList.add('oculto');
    placeholderEl.classList.remove('oculto');
    return;
  }
  try {
    const resposta = await fetch(`${API_BASE_URL}/publico/${encodeURIComponent(slug)}`);
    const dados = await resposta.json();
    // logo_apps_url e a logo dedicada pros apps internos (entregador,
    // atendente) -- separada da logo_url que aparece no cardapio do
    // cliente. Se a loja ainda nao tiver configurado essa especifica,
    // cai pra logo_url como reserva.
    const logoParaUsar = dados.logo_apps_url || dados.logo_url;
    if (resposta.ok && logoParaUsar) {
      imagemEl.src = logoParaUsar;
      imagemEl.alt = `Logo ${dados.nome || slug}`;
      imagemEl.classList.remove('oculto');
      placeholderEl.classList.add('oculto');
      return;
    }
  } catch {
    // Sem internet/slug invalido -- so mantem o placeholder, sem travar o login.
  }
  imagemEl.classList.add('oculto');
  placeholderEl.classList.remove('oculto');
}
document.getElementById('login-slug').addEventListener('input', agendarBuscaLogoDaLoja);
document.getElementById('login-slug').addEventListener('blur', buscarLogoDaLoja);

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
              const resultado = await chamarApi('/checkin', { method: 'POST', body: { token: tokenLido } });
              mostrarToast(resultado.mensagem || 'Checkin realizado!');
              iniciarAguardandoPedido();
              return;
            } catch (erro) {
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
    const resultado = await chamarApi('/checkin', { method: 'POST', body: { token: codigo } });
    mostrarToast(resultado.mensagem || 'Checkin realizado!');
    iniciarAguardandoPedido();
  } catch (erro) {
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
  }
});

// -------------------- Fila de espera + oferta de entrega --------------------
function iniciarAguardandoPedido() {
  const dados = obterDados();
  const primeiroNome = (dados?.nome || '').split(' ')[0];
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}! 👋` : 'Olá! 👋';
  document.getElementById('saudacao-rota').textContent = saudacao;

  mostrarTela('tela-aguardando');
  pararPolling();
  intervaloPolling = setInterval(verificarOfertaOuEntregaAtual, INTERVALO_POLL_MS);
  atualizarPosicaoNaFila();
  return verificarOfertaOuEntregaAtual();
}

async function atualizarPosicaoNaFila() {
  const boxEl = document.getElementById('fila-posicao-box');
  const linha1El = document.getElementById('fila-posicao-linha1');
  const linha2El = document.getElementById('fila-posicao-linha2');
  try {
    const dados = await chamarApi('/fila/posicao');
    if (!dados.na_fila) {
      boxEl.classList.add('oculto');
      return;
    }
    const pessoasNaFrente = dados.posicao - 1;
    if (pessoasNaFrente === 0) {
      linha1El.textContent = 'Você é o próximo da fila!';
      linha2El.textContent = 'Prepare-se, sua entrega está quase pronta.';
    } else {
      linha1El.textContent = 'Há pessoas na sua frente.';
      linha2El.textContent = `Aguarde, você está na posição ${dados.posicao} de ${dados.total_na_fila}.`;
    }
    boxEl.classList.remove('oculto');
  } catch {
    boxEl.classList.add('oculto');
  }
}

function pararPolling() {
  if (intervaloPolling) {
    clearInterval(intervaloPolling);
    intervaloPolling = null;
  }
}

let pedidoOfertaAtual = null;
let paradasRotaAtual = []; // array de pedidos com status 'saiu_entrega' (rota atual, 1 ou mais paradas)
let plantaoAtualCache = null; // ultimo resumo de /plantao/atual (usado no Resumo do dia e no menu)

// IDs de pedido cuja caixinha ja foi avisada (toast) nesta sessao -- evita
// repetir o aviso a cada ciclo do polling (5 em 5s).
const caixinhasJaNotificadas = new Set();
const MINUTOS_ATRASO_AVISO_CAIXINHA = 15;

// A caixinha nao aparece mais como um campo fixo na tela (ver "DETALHES DA
// ROTA ATUAL") -- em vez disso, vira uma mensagem avulsa (toast), e so
// depois de passado um atraso de seguranca desde que o CLIENTE registrou o
// pedido (criado_em, quando ele escolhe o valor da caixinha ao fazer o
// pedido). Roda a cada ciclo do polling normal da rota atual.
function verificarCaixinhasParaNotificar(paradas) {
  const agora = Date.now();
  paradas.forEach((p) => {
    const valor = gorjetaDaEntrega(p);
    if (valor <= 0 || !p.criado_em || caixinhasJaNotificadas.has(p.id)) return;
    const minutosDesdeLancamento = (agora - new Date(p.criado_em).getTime()) / 60000;
    if (minutosDesdeLancamento < MINUTOS_ATRASO_AVISO_CAIXINHA) return;
    caixinhasJaNotificadas.add(p.id);
    mostrarToast(`🎉 Caixinha de ${formatarMoeda(valor)} no pedido #${p.numero_pedido ?? '-'}!`);
  });
}

async function verificarOfertaOuEntregaAtual() {
  try {
    // Prioridade 1: entrega(s) ja aceita(s) e em andamento (ex: reabriu o app,
    // ou o admin atribuiu mais de um pedido pra essa rota).
    const emAndamento = await chamarApi('/entregas/atual');
    if (Array.isArray(emAndamento) && emAndamento.length > 0) {
      paradasRotaAtual = emAndamento;
      verificarCaixinhasParaNotificar(paradasRotaAtual);
      await exibirRotaEmAndamento();
      return;
    }
    // Prioridade 2: oferta pendente aguardando aceite/recusa.
    const oferta = await chamarApi('/entregas/pendente');
    if (oferta) {
      pedidoOfertaAtual = oferta;
      exibirOfertaDeEntrega(oferta);
      return;
    }
    // Nenhuma das duas: continua esperando na fila.
    if (document.getElementById('tela-aguardando').classList.contains('oculto') && !telaMenuAberta()) {
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

  const temTroco = pedido.forma_pagamento === 'dinheiro' && pedido.troco_para !== null && pedido.troco_para !== undefined;
  document.getElementById('oferta-troco-linha').classList.toggle('oculto', !temTroco);
  if (temTroco) document.getElementById('oferta-troco').textContent = formatarMoeda(pedido.troco_para);

  mostrarTela('tela-oferta');
}

document.getElementById('botao-aceitar').addEventListener('click', async () => {
  if (!pedidoOfertaAtual) return;
  try {
    await chamarApi(`/entregas/${pedidoOfertaAtual.id}/aceitar`, { method: 'PUT' });
    pedidoOfertaAtual = null;
    verificarOfertaOuEntregaAtual();
  } catch (erro) {
    mostrarToast(erro.message, true);
    verificarOfertaOuEntregaAtual();
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
    verificarOfertaOuEntregaAtual();
  }
});

function enderecoParaLinkMaps(endereco) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco || '')}`;
}

function formatarHora(dataISO) {
  if (!dataISO) return '-';
  return new Date(dataISO).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Data + hora juntos (ex: "26/09/2026 · 20:46") -- usado pra mostrar quando
// o pedido foi LANÇADO (criado_em), diferente do "Recebida" (horario_saiu_entrega).
function formatarDataHora(dataISO) {
  if (!dataISO) return '-';
  return `${new Date(dataISO).toLocaleDateString('pt-BR')} · ${formatarHora(dataISO)}`;
}

// Renderiza a tela de "rota em andamento": a proxima parada em destaque
// (primeira da fila, por ordem de saida) + as demais paradas restantes
// (caso o admin tenha atribuido mais de um pedido pra essa rota) + resumo
// do dia (busca /plantao/atual em paralelo pra pegar entregas ja concluidas).
// Comissao do ENTREGADOR por entrega -- nunca o valor do pedido (isso e
// dinheiro da loja/produto, coisa completamente diferente). Usa a forma de
// pagamento configurada pro entregador (por entrega fixa ou por km) + a
// gorjeta que o cliente ja tiver dado no pedido (caixinha).
// Valor da ROTA (comissao) e valor da CAIXINHA (gorjeta) sao duas coisas
// diferentes e devem aparecer separadas na tela -- comissaoDaEntrega() da
// so a rota; gorjetaDaEntrega() da so a caixinha. Nunca somar os dois num
// campo so chamado "Valor da rota" (isso e o que causava o valor "errado"
// mostrado ao entregador).
function comissaoDaEntrega(pedido) {
  const dados = obterDados();
  const distanciaKm = parseFloat(pedido.distancia_km) || 0;
  // Comissao = valor fixo por entrega + (valor por km * km ALEM DO LIMITE
  // incluso no fixo). Com limite=0 (padrao), vira soma simples desde o
  // km 1 -- um so' calculo cobre todos os cenarios.
  const valorFixo = parseFloat(dados?.valorPorEntrega) || 0;
  const valorKm = parseFloat(dados?.valorPorKm) || 0;
  const kmIncluido = parseFloat(dados?.kmIncluidoNoFixo) || 0;
  const kmExcedente = Math.max(0, distanciaKm - kmIncluido);
  return valorFixo + kmExcedente * valorKm;
}

function gorjetaDaEntrega(pedido) {
  return parseFloat(pedido.gorjeta) || 0;
}

async function exibirRotaEmAndamento() {
  const paradas = paradasRotaAtual;
  const proxima = paradas[0];
  const restantes = paradas.slice(1);

  try {
    plantaoAtualCache = await chamarApi('/plantao/atual');
  } catch {
    plantaoAtualCache = null;
  }
  const realizadasHoje = plantaoAtualCache?.total_entregas ?? 0;
  const totalRota = paradas.length + realizadasHoje;
  const posicaoAtual = realizadasHoje + 1;

  document.getElementById('rota-contador').textContent = `${posicaoAtual} de ${totalRota} entregas`;
  renderizarMapaRota(paradas.length, posicaoAtual);

  document.getElementById('rota-proxima-numero').textContent = `#${proxima.numero_pedido ?? '-'}`;
  document.getElementById('rota-proxima-lancado').textContent = `Pedido lançado em ${formatarDataHora(proxima.criado_em)}`;
  document.getElementById('rota-proxima-cliente').textContent = proxima.cliente_nome || '-';
  document.getElementById('rota-proxima-endereco').textContent = proxima.cliente_endereco || '-';
  document.getElementById('rota-botao-navegar').href = enderecoParaLinkMaps(proxima.cliente_endereco);

  // O valor do produto (e o troco) so importa mostrar pro entregador quando
  // for ELE a receber o dinheiro na entrega -- pedido pago online/Pix nao
  // passa pela mao dele, entao o cartao inteiro de "A receber do cliente"
  // fica escondido nesse caso.
  const proximaEhDinheiro = proxima.forma_pagamento === 'dinheiro';
  document.getElementById('cartao-a-receber').classList.toggle('oculto', !proximaEhDinheiro);
  if (proximaEhDinheiro) {
    document.getElementById('rota-proxima-total').textContent = formatarMoeda(proxima.total);
    document.getElementById('rota-pago-momento').textContent = formatarMoeda(0);
    aplicarFormaPagamento(
      proxima,
      document.getElementById('rota-proxima-pagamento'),
      document.getElementById('rota-troco-bloco'),
      document.getElementById('rota-troco-para'),
      document.getElementById('rota-troco-valor')
    );
  }

  // Previsao de chegada / distancia restante / previsao total dependem de
  // uma integracao com mapa (Google Maps), que ainda nao esta configurada
  // (falta a chave de API) -- por enquanto ficam com "-" no lugar de um
  // valor inventado, e o botao abaixo abre a rota direto no Google Maps.
  document.getElementById('rota-previsao-chegada').textContent = '—';
  document.getElementById('rota-distancia-restante').textContent = '—';
  document.getElementById('rota-previsao-total').textContent = '—';

  const dataRota = proxima.horario_saiu_entrega ? new Date(proxima.horario_saiu_entrega) : new Date();
  document.getElementById('rota-data').textContent = dataRota.toLocaleDateString('pt-BR');
  document.getElementById('rota-inicio').textContent = formatarHora(proxima.horario_saiu_entrega);
  document.getElementById('rota-info-hora').textContent = formatarHora(proxima.horario_saiu_entrega);
  document.getElementById('rota-info-data').textContent = dataRota.toLocaleDateString('pt-BR');

  // "Valor da rota" e so a comissao (o que o entregador ganha por rodar),
  // nunca o valor do pedido (produto) nem a caixinha. A caixinha NAO tem
  // mais um campo fixo nesse painel -- ela so aparece como uma mensagem
  // avulsa (toast), e com atraso de 15 min desde o lancamento do pedido
  // (ver verificarCaixinhasParaNotificar). O valor continua entrando na
  // soma do "Total de rotas" do resumo do dia, so nao fica mais visivel
  // como um campo separado aqui.
  const valorRota = paradas.reduce((soma, p) => soma + comissaoDaEntrega(p), 0);
  const valorCaixinha = paradas.reduce((soma, p) => soma + gorjetaDaEntrega(p), 0);
  document.getElementById('rota-valor-total').textContent = formatarMoeda(valorRota);

  // ganhoHoje (plantaoAtualCache.valor_total) e a soma de comissao+caixinha
  // das entregas JA REALIZADAS hoje -- esse numero continua combinado de
  // proposito (e o "quanto ja caiu" no total do dia), diferente da rota
  // pendente acima, que agora mostra os dois valores em campos separados.
  const ganhoHoje = plantaoAtualCache?.valor_total ?? 0;
  document.getElementById('rota-resumo-andamento').textContent = paradas.length;
  document.getElementById('rota-resumo-andamento-valor').textContent = formatarMoeda(valorRota);
  document.getElementById('rota-resumo-realizadas').textContent = realizadasHoje;
  document.getElementById('rota-resumo-realizadas-valor').textContent = formatarMoeda(ganhoHoje);
  document.getElementById('rota-resumo-totalrotas').textContent = totalRota;
  document.getElementById('rota-resumo-totalrotas-valor').textContent = formatarMoeda(ganhoHoje + valorRota + valorCaixinha);
  document.getElementById('rota-resumo-a-receber').textContent = formatarMoeda(valorRota);

  const listaEl = document.getElementById('lista-paradas-restantes');
  if (restantes.length === 0) {
    listaEl.innerHTML = '';
  } else {
    listaEl.innerHTML = `<p class="rotulo-detalhe" style="margin-bottom:8px;">Próximas paradas da rota</p>` +
      restantes.map((p, i) => `
        <div class="parada-futura">
          <strong><span class="parada-futura__numero">${i + 2}</span>#${p.numero_pedido ?? '-'} · ${escaparHtml(p.cliente_nome || '-')}</strong>
          <span>${escaparHtml(p.cliente_endereco || '-')} · ${formatarMoeda(comissaoDaEntrega(p))}</span>
        </div>
      `).join('');
  }

  if (!telaMenuAberta()) {
    mostrarTela('tela-rota');
  }
}

// Desenha um diagrama simplificado da rota (paradas numeradas ligadas por
// linhas) no lugar de um mapa de verdade -- ainda nao ha integracao com
// Google Maps (falta configurar a chave de API). Parada atual em laranja,
// concluidas em verde, futuras em cinza.
function renderizarMapaRota(totalParadasRestantes, posicaoAtual) {
  const total = Math.max(totalParadasRestantes + (posicaoAtual - 1), 1);
  const container = document.getElementById('mapa-rota-visual');
  const larguraTotal = 320;
  const alturaTotal = 190;
  const passo = total > 1 ? larguraTotal / total : 0;
  const pontos = [];
  for (let i = 0; i < total; i++) {
    const x = 40 + i * passo;
    const y = 60 + (i % 2 === 0 ? -20 : 30) + (i === 0 ? 20 : 0);
    pontos.push({ x, y: Math.min(Math.max(y, 30), alturaTotal - 20) });
  }

  let linhasSvg = '';
  for (let i = 0; i < pontos.length - 1; i++) {
    const numeroParada = i + 1;
    const classe = numeroParada < posicaoAtual ? 'mapa-rota__linha-feita' : 'mapa-rota__linha-pendente';
    linhasSvg += `<line x1="${pontos[i].x}" y1="${pontos[i].y}" x2="${pontos[i + 1].x}" y2="${pontos[i + 1].y}" class="${classe}"></line>`;
  }

  let circulosSvg = '';
  pontos.forEach((p, i) => {
    const numeroParada = i + 1;
    let corFundo = '#c7cbc7';
    if (numeroParada === posicaoAtual) corFundo = '#f0932b';
    else if (numeroParada < posicaoAtual) corFundo = 'var(--cor-principal)';
    const raio = numeroParada === posicaoAtual ? 15 : 12;
    circulosSvg += `
      <circle cx="${p.x}" cy="${p.y}" r="${raio}" fill="${corFundo === 'var(--cor-principal)' ? '#1f8b3b' : corFundo}"></circle>
      <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" class="mapa-rota__parada">${numeroParada}</text>
    `;
  });

  container.innerHTML = `
    <svg class="mapa-rota__svg" viewBox="0 0 ${larguraTotal + 40} ${alturaTotal}" preserveAspectRatio="xMidYMid meet">
      ${linhasSvg}
      ${circulosSvg}
    </svg>
    <div class="mapa-rota__moto" style="left:${((pontos[0].x - 30) / (larguraTotal + 40)) * 100}%; top:${(pontos[0].y / alturaTotal) * 100}%;">🛵</div>
  `;
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

document.getElementById('botao-encerrar').addEventListener('click', async () => {
  const proxima = paradasRotaAtual[0];
  if (!proxima) return;

  let distanciaKm;
  const dados = obterDados();
  if (dados && parseFloat(dados.valorPorKm) > 0) {
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
    verificarOfertaOuEntregaAtual();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

document.getElementById('botao-sair-aguardando').addEventListener('click', () => {
  encerrarPlantaoEMostrarResumo();
});

// -------------------- Plantao (inicio/fim + resumo) --------------------
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
  const porKm = dados && parseFloat(dados.valorPorKm) > 0;

  document.getElementById('resumo-total-entregas').textContent = resumo.total_entregas ?? 0;
  document.getElementById('resumo-total-km').textContent = `${Number(resumo.total_km || 0).toLocaleString('pt-BR')} km`;
  document.getElementById('resumo-linha-km').classList.toggle('oculto', !porKm);
  document.getElementById('resumo-valor-total').textContent = formatarMoeda(resumo.valor_total);

  mostrarTela('tela-resumo-plantao');
}

document.getElementById('botao-sair-resumo-plantao').addEventListener('click', fazerLogout);

// -------------------- Menu lateral (painel deslizante) --------------------
// Secao atualmente aberta no menu -- usada pra saber se precisa
// re-renderizar em tempo real quando o polling da rota atual atualiza
// (topico 1) e pra parar o auto-atualizar quando o menu fecha.
let menuSecaoAtiva = null;
let intervaloAtualizacaoMenu = null;

// Estado de cada lista paginada por cursor (topicos 2, 3 e 4): guarda o
// periodo escolhido, os itens ja carregados (acumulados a cada "carregar
// mais") e o cursor pra proxima pagina.
let estadoListas = {};
// Estado da secao de pagamento (topico 5), paginada por numero de pagina
// (por plantao, nao por entrega individual).
let estadoPagamento = { pagina: 1, plantoesAcumulados: [] };

const PERIODOS_FILTRO = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 'semana', rotulo: 'Semana' },
  { valor: 'mes', rotulo: 'Mês' },
  { valor: '3meses', rotulo: '3 meses' },
  { valor: '6meses', rotulo: '6 meses' },
  { valor: 'ano', rotulo: 'Ano' },
  { valor: 'tudo', rotulo: 'Tudo' }
];

// Titulo mostrado no topo da tela de detalhe, conforme a secao aberta.
const TITULOS_MENU = {
  atual: 'Rota em andamento',
  historico: 'Rotas realizadas',
  'resumo-rotas': 'Resumo de rotas',
  caixinha: 'Caixinha recebida',
  pagamento: 'Pagamento'
};

// Guarda qual tela estava aberta antes do menu (pra voltar certo ao fechar
// -- pode ser a tela de espera ou a de rota em andamento).
let telaAnteriorMenu = 'tela-aguardando';

// -------------------- Persistencia do menu (sobrevive ao F5) --------------------
// As demais telas (checkin/aguardando/oferta/rota) ja se recalculam sozinhas
// a partir dos dados reais do servidor ao recarregar a pagina. O menu nao --
// entao guardamos aqui qual tela do menu estava aberta (lista, ou uma secao
// especifica) pra reabrir automaticamente depois que a pagina recarregar.
const CHAVE_MENU_ABERTO = 'mimenu_entregador_menu_aberto';
function salvarEstadoMenu(estado) {
  if (estado) {
    sessionStorage.setItem(CHAVE_MENU_ABERTO, JSON.stringify(estado));
  } else {
    sessionStorage.removeItem(CHAVE_MENU_ABERTO);
  }
}
function obterEstadoMenuSalvo() {
  const bruto = sessionStorage.getItem(CHAVE_MENU_ABERTO);
  return bruto ? JSON.parse(bruto) : null;
}

// Abre a LISTA de opcoes do menu, em tela cheia (nao e mais um painel/modal
// sobreposto -- cada opcao agora abre como uma tela propria, ver
// abrirSecaoDoMenu abaixo).
function abrirMenuLista() {
  telaAnteriorMenu = document.querySelector('.tela:not(.oculto)')?.id || telaAnteriorMenu;
  mostrarTela('tela-menu-lista');
  salvarEstadoMenu({ secao: null });
}
function fecharMenuLista() {
  salvarEstadoMenu(null);
  mostrarTela(telaAnteriorMenu);
}

// Abre uma secao do menu (Rota em andamento, Rotas realizadas, etc.) como
// uma tela cheia propria, com botao "Voltar" pra retornar a lista.
function abrirSecaoDoMenu(secao) {
  menuSecaoAtiva = secao;
  document.getElementById('menu-detalhe-titulo').textContent = TITULOS_MENU[secao] || '';
  mostrarTela('tela-menu-detalhe');
  exibirSecaoMenu(secao);
  salvarEstadoMenu({ secao });
  // Enquanto a tela "Rota em andamento" estiver aberta, mantem os dados
  // atualizados em tempo real (o valor da rota muda conforme o entregador
  // avança pelas paradas). Para nas outras secoes e quando sai da tela.
  clearInterval(intervaloAtualizacaoMenu);
  intervaloAtualizacaoMenu = setInterval(() => {
    if (menuSecaoAtiva === 'atual') exibirSecaoMenu('atual', { silencioso: true });
  }, INTERVALO_POLL_MS);
}
function voltarParaListaMenu() {
  clearInterval(intervaloAtualizacaoMenu);
  menuSecaoAtiva = null;
  mostrarTela('tela-menu-lista');
  salvarEstadoMenu({ secao: null });
}

// Reabre, apos o boot da pagina, a tela do menu que estava aberta antes de
// recarregar (se houver). Chamado depois que a tela base (aguardando/rota)
// ja foi definida corretamente pelos dados reais do servidor.
function restaurarTelaMenuSalva() {
  const estado = obterEstadoMenuSalvo();
  if (!estado) return;
  abrirMenuLista();
  if (estado.secao) abrirSecaoDoMenu(estado.secao);
}

document.getElementById('botao-abrir-menu-aguardando').addEventListener('click', abrirMenuLista);
document.getElementById('botao-abrir-menu-rota').addEventListener('click', abrirMenuLista);
document.getElementById('botao-fechar-menu').addEventListener('click', fecharMenuLista);
document.getElementById('botao-voltar-menu-detalhe').addEventListener('click', voltarParaListaMenu);

document.querySelectorAll('.menu-lateral__item').forEach(botao => {
  botao.addEventListener('click', () => abrirSecaoDoMenu(botao.getAttribute('data-menu-secao')));
});

// Delegacao de clique pros chips de periodo e botao "carregar mais",
// porque esses elementos sao recriados a cada renderizacao da lista.
document.getElementById('menu-detalhe-conteudo').addEventListener('click', (evento) => {
  const chip = evento.target.closest('[data-chip-secao]');
  if (chip) {
    const secao = chip.getAttribute('data-chip-secao');
    const periodo = chip.getAttribute('data-chip-periodo');
    estadoListas[secao] = { periodo, itens: [], cursor: null, temMais: false };
    exibirSecaoMenu(secao);
    return;
  }
  const botaoMais = evento.target.closest('[data-carregar-mais]');
  if (botaoMais) {
    const secao = botaoMais.getAttribute('data-carregar-mais');
    if (secao === 'pagamento') carregarMaisPagamento();
    else carregarMaisLista(secao);
  }
});

// Monta o objeto de endereco (rua/numero/complemento/cep/bairro + versao
// completa pra exibir) a partir de um pedido cru vindo de /entregas/atual
// -- espelha exatamente a logica que o backend usa no historico paginado,
// pra rota em andamento (topico 1) mostrar do mesmo jeito.
function construirEndereco(p) {
  const temEstruturado = p.cliente_endereco_rua || p.cliente_endereco_cep || p.cliente_endereco_bairro;
  if (!temEstruturado) {
    return { logradouro: p.cliente_endereco || '-', numero: null, complemento: null, cep: null, bairro: null, completo: p.cliente_endereco || '-' };
  }
  const partes = [];
  if (p.cliente_endereco_rua) partes.push(p.cliente_endereco_numero ? `${p.cliente_endereco_rua}, ${p.cliente_endereco_numero}` : p.cliente_endereco_rua);
  if (p.cliente_endereco_complemento) partes.push(p.cliente_endereco_complemento);
  if (p.cliente_endereco_bairro) partes.push(p.cliente_endereco_bairro);
  if (p.cliente_endereco_cep) partes.push(`CEP ${p.cliente_endereco_cep}`);
  return {
    logradouro: p.cliente_endereco_rua || p.cliente_endereco || '-',
    numero: p.cliente_endereco_numero || null,
    complemento: p.cliente_endereco_complemento || null,
    cep: p.cliente_endereco_cep || null,
    bairro: p.cliente_endereco_bairro || null,
    completo: partes.join(' - ') || (p.cliente_endereco || '-')
  };
}

// Renderiza o endereco em linhas separadas (rua, numero, complemento,
// bairro, CEP) quando o pedido tiver os campos estruturados; cai pra uma
// linha unica de texto livre pra pedidos antigos que so tem isso.
function renderEnderecoLinhas(end) {
  if (!end) return '';
  const temEstruturado = end.numero || end.cep || end.bairro || end.complemento;
  if (temEstruturado) {
    return `
      <div class="item-entrega-detalhe__linha"><span>Rua/Av.</span><span>${escaparHtml(end.logradouro || '-')}</span></div>
      <div class="item-entrega-detalhe__linha"><span>Número</span><span>${escaparHtml(end.numero || '-')}</span></div>
      ${end.complemento ? `<div class="item-entrega-detalhe__linha"><span>Complemento</span><span>${escaparHtml(end.complemento)}</span></div>` : ''}
      <div class="item-entrega-detalhe__linha"><span>Bairro</span><span>${escaparHtml(end.bairro || '-')}</span></div>
      <div class="item-entrega-detalhe__linha"><span>CEP</span><span>${escaparHtml(end.cep || '-')}</span></div>
    `;
  }
  return `<div class="item-entrega-detalhe__endereco">${escaparHtml(end.completo || '-')}</div>`;
}

function chipsPeriodoHtml(secao, periodoAtivo) {
  return `<div class="filtro-periodo">` + PERIODOS_FILTRO.map(p => `
    <button type="button" class="chip-periodo ${p.valor === periodoAtivo ? 'chip-periodo--ativo' : ''}" data-chip-secao="${secao}" data-chip-periodo="${p.valor}">${p.rotulo}</button>
  `).join('') + `</div>`;
}

function exibirSecaoMenu(secao, opcoes = {}) {
  menuSecaoAtiva = secao;
  const conteudo = document.getElementById('menu-detalhe-conteudo');

  // ---------------- Topico 1: Rota em andamento ----------------
  // Data/hora do recebimento da rota, destino completo (rua, numero,
  // complemento, CEP e nome do cliente) e valor da rota em tempo real
  // (recalculado a cada re-render, inclusive pelo auto-atualizar acima).
  if (secao === 'atual') {
    const paradas = paradasRotaAtual;
    let html = `<p class="resumo-geral-titulo">ROTA EM ANDAMENTO</p>`;
    if (paradas.length === 0) {
      html += '<p class="ajuda">Nenhuma rota em andamento agora.</p>';
    } else {
      html += `<div class="lista-com-rolagem">` + paradas.map((p) => {
        const ehDinheiro = p.forma_pagamento === 'dinheiro';
        const temTroco = ehDinheiro && p.troco_para !== null && p.troco_para !== undefined;
        return `
        <div class="item-entrega-detalhe">
          <div class="item-entrega-detalhe__topo">
            <span class="item-entrega-detalhe__horario">#${p.numero_pedido ?? '-'} · Recebida ${p.horario_saiu_entrega ? new Date(p.horario_saiu_entrega).toLocaleDateString('pt-BR') + ' · ' + formatarHora(p.horario_saiu_entrega) : 'agora'}</span>
            <span class="item-entrega-detalhe__valor">${formatarMoeda(comissaoDaEntrega(p))}</span>
          </div>
          <div class="item-entrega-detalhe__linha"><span>Lançado</span><span>${formatarDataHora(p.criado_em)}</span></div>
          <div class="item-entrega-detalhe__linha"><span>Cliente</span><span>${escaparHtml(p.cliente_nome || '-')}</span></div>
          ${renderEnderecoLinhas(construirEndereco(p))}
          ${ehDinheiro ? `<div class="item-entrega-detalhe__linha"><span>${temTroco ? 'Valor do pedido a receber' : 'Valor do pedido'}</span><span>${formatarMoeda(p.total)}</span></div>` : ''}
          ${temTroco ? `<div class="item-entrega-detalhe__linha"><span>Troco para</span><span>${formatarMoeda(p.troco_para)}</span></div>` : ''}
        </div>
      `;
      }).join('') + `</div>`;
    }
    conteudo.innerHTML = html;
    return;
  }

  // ---------------- Topico 2: Rotas realizadas ----------------
  // Ordem regressiva (mais recente primeiro), 5 visiveis por vez com
  // rolagem + "carregar mais", filtravel por periodo (hoje ate "tudo" --
  // sem teto, remonta desde a primeirissima entrega do entregador).
  if (secao === 'historico') {
    if (!estadoListas.historico) estadoListas.historico = { periodo: 'hoje', itens: [], cursor: null, temMais: false };
    const estado = estadoListas.historico;
    conteudo.innerHTML = chipsPeriodoHtml('historico', estado.periodo) + '<p class="ajuda">Carregando...</p>';
    buscarPaginaLista('historico', estado.periodo, null, true);
    return;
  }

  // ---------------- Topico 3: Resumo da rota ----------------
  // Igual ao historico, mas com valor do pedido, forma de pagamento e
  // troco (quando for dinheiro) -- fica permanente no historico, sem filtro
  // de periodo (mostra tudo, paginado por "carregar mais").
  if (secao === 'resumo-rotas') {
    if (!estadoListas['resumo-rotas']) estadoListas['resumo-rotas'] = { periodo: 'tudo', itens: [], cursor: null, temMais: false };
    conteudo.innerHTML = '<p class="resumo-geral-titulo">RESUMO DA ROTA</p><p class="ajuda">Carregando...</p>';
    buscarPaginaLista('resumo-rotas', 'tudo', null, true);
    return;
  }

  // ---------------- Topico 4: Caixinha recebida ----------------
  // Quantidade/valor do dia em tempo real + as 5 ultimas em ordem
  // decrescente, com "carregar mais" e filtro por periodo (semana, mes,
  // semestre, ano).
  if (secao === 'caixinha') {
    if (!estadoListas.caixinha) estadoListas.caixinha = { periodo: 'hoje', itens: [], cursor: null, temMais: false };
    const estado = estadoListas.caixinha;
    conteudo.innerHTML = chipsPeriodoHtml('caixinha', estado.periodo) + '<p class="ajuda">Carregando...</p>';
    buscarPaginaLista('caixinha', estado.periodo, null, true);
    return;
  }

  // ---------------- Topico 5: Pagamento ----------------
  // Soma do plantao atual (do inicio ao fim, conforme o checkin/checkout
  // controlado pelo dashboard do gestor) + quantidade de rotas e o codigo
  // de cada uma; "carregar mais" traz plantoes anteriores (5 por vez) e um
  // total geral somando tudo, igual ao Resumo de rotas.
  if (secao === 'pagamento') {
    estadoPagamento = { pagina: 1, plantoesAcumulados: [] };
    conteudo.innerHTML = '<p class="ajuda">Carregando...</p>';
    carregarPagamento();
    return;
  }
}

// ---------------- Busca paginada genérica (topicos 2, 3 e 4) ----------------
async function buscarPaginaLista(secao, periodo, cursor, resetar) {
  const conteudo = document.getElementById('menu-detalhe-conteudo');
  const rota = secao === 'caixinha' ? '/entregas/minhas-caixinhas' : '/entregas/minhas-historico';
  const parametros = new URLSearchParams({ limite: '5' });
  if (periodo && periodo !== 'tudo') parametros.set('periodo', periodo);
  if (secao === 'historico') parametros.set('periodo', periodo || 'hoje'); // topico 2 sempre manda periodo (default hoje)
  if (cursor) parametros.set('antes', cursor);

  try {
    const dados = await chamarApi(`${rota}?${parametros.toString()}`);
    if (menuSecaoAtiva !== secao) return; // usuario trocou de secao enquanto carregava

    const estado = estadoListas[secao];
    const itensNovos = secao === 'caixinha' ? (dados.caixinhas || []) : (dados.entregas || []);
    estado.itens = resetar ? itensNovos : estado.itens.concat(itensNovos);
    estado.cursor = dados.proximo_cursor;
    estado.temMais = dados.tem_mais;
    estado.totais = dados.totais; // so vem preenchido na caixinha

    renderizarListaNaTela(secao, estado);
  } catch (erro) {
    conteudo.innerHTML += `<p class="erro">${erro.message}</p>`;
  }
}

function carregarMaisLista(secao) {
  const estado = estadoListas[secao];
  if (!estado || !estado.temMais) return;
  buscarPaginaLista(secao, estado.periodo, estado.cursor, false);
}

function renderizarListaNaTela(secao, estado) {
  const conteudo = document.getElementById('menu-detalhe-conteudo');
  let cabecalho = '';
  let corpo = '';

  if (secao === 'historico') {
    const tp = estado.totais_periodo || {};
    cabecalho = chipsPeriodoHtml('historico', estado.periodo) +
      `<p class="resumo-geral-titulo">ROTAS REALIZADAS</p>
       <div class="resumo-geral-linha"><span>Rotas no período</span><strong>${tp.quantidade ?? 0}</strong></div>
       <div class="resumo-geral-linha"><span>Valor total no período</span><strong>${formatarMoeda(tp.valor_total)}</strong></div>`;
    corpo = estado.itens.map(e => `
      <div class="item-entrega-detalhe">
        <div class="item-entrega-detalhe__topo">
          <span class="item-entrega-detalhe__horario">#${e.numero_pedido ?? '-'} · ${new Date(e.horario_entregue).toLocaleDateString('pt-BR')}</span>
          <span class="item-entrega-detalhe__valor">${formatarMoeda(e.valor_rota)}</span>
        </div>
        <div class="item-entrega-detalhe__linha"><span>Recebida</span><span>${formatarHora(e.horario_saiu_entrega)}</span></div>
        <div class="item-entrega-detalhe__linha"><span>Finalizada</span><span>${formatarHora(e.horario_entregue)}</span></div>
        ${renderEnderecoLinhas(e.endereco)}
        ${e.valor_pedido !== null ? `<div class="item-entrega-detalhe__linha"><span>${e.troco_para !== null ? 'Valor do pedido a receber' : 'Valor do pedido'}</span><span>${formatarMoeda(e.valor_pedido)}</span></div>` : ''}
        ${e.troco_para !== null ? `<div class="item-entrega-detalhe__linha"><span>Troco para</span><span>${formatarMoeda(e.troco_para)}</span></div>` : ''}
      </div>
    `).join('');
  } else if (secao === 'resumo-rotas') {
    cabecalho = `<p class="resumo-geral-titulo">RESUMO DA ROTA</p>`;
    corpo = estado.itens.map(e => {
      const classePg = e.forma_pagamento === 'dinheiro' ? 'item-entrega-detalhe__pagamento--dinheiro' : e.forma_pagamento === 'pix' ? 'item-entrega-detalhe__pagamento--pix' : 'item-entrega-detalhe__pagamento--online';
      // So mostra o valor do pedido quando o entregador recebeu em dinheiro
      // (pedido pago online/Pix nao passa por ele, entao nao ha valor a
      // prestar contas). Quando tem troco combinado, o rotulo deixa isso
      // explicito: e dinheiro que ele ainda vai receber do cliente.
      const ehDinheiro = e.forma_pagamento === 'dinheiro';
      return `
        <div class="item-entrega-detalhe">
          <div class="item-entrega-detalhe__topo">
            <span class="item-entrega-detalhe__horario">#${e.numero_pedido ?? '-'} · ${new Date(e.horario_entregue).toLocaleDateString('pt-BR')} · ${formatarHora(e.horario_saiu_entrega)}</span>
            <span class="item-entrega-detalhe__valor">${formatarMoeda(e.valor_rota)}</span>
          </div>
          ${renderEnderecoLinhas(e.endereco)}
          ${ehDinheiro ? `<div class="item-entrega-detalhe__linha"><span>${e.troco_para !== null ? 'Valor do pedido a receber' : 'Valor do pedido'}</span><span>${formatarMoeda(e.total_pedido)}</span></div>` : ''}
          <span class="item-entrega-detalhe__pagamento ${classePg}">${formatarPagamento(e.forma_pagamento)}</span>
          ${ehDinheiro && e.troco !== null ? `<div class="item-entrega-detalhe__linha"><span>Troco</span><span>${formatarMoeda(e.troco)}</span></div>` : ''}
        </div>
      `;
    }).join('');
  } else if (secao === 'caixinha') {
    const t = estado.totais || {};
    cabecalho = chipsPeriodoHtml('caixinha', estado.periodo) +
      `<p class="resumo-geral-titulo">CAIXINHA RECEBIDA</p>
       <div class="resumo-geral-linha"><span>Hoje</span><strong>${formatarMoeda(t.hoje)}</strong></div>
       <div class="resumo-geral-linha"><span>Este mês</span><strong>${formatarMoeda(t.mes)}</strong></div>
       <div class="resumo-geral-linha"><span>Total acumulado</span><strong>${formatarMoeda(t.total)}</strong></div>
       <p class="resumo-geral-titulo" style="margin-top:16px;">ÚLTIMAS RECEBIDAS</p>`;
    // So data, hora e valor -- nunca o cliente que deu a caixinha.
    corpo = estado.itens.map(e => `
      <div class="item-entrega-detalhe">
        <div class="item-entrega-detalhe__topo">
          <span class="item-entrega-detalhe__horario">${new Date(e.horario_entregue).toLocaleDateString('pt-BR')} · ${formatarHora(e.horario_entregue)}</span>
          <span class="item-entrega-detalhe__valor">${formatarMoeda(e.valor)}</span>
        </div>
      </div>
    `).join('');
  }

  if (estado.itens.length === 0) corpo = '<p class="ajuda">Nada encontrado para esse período.</p>';

  const botaoMais = estado.temMais
    ? `<button type="button" class="botao-carregar-mais" data-carregar-mais="${secao}">Carregar mais</button>`
    : (estado.itens.length > 0 ? `<p class="ajuda" style="text-align:center;margin-top:8px;">Não há mais rotas nesse período.</p>` : '');

  conteudo.innerHTML = cabecalho + `<div class="lista-com-rolagem">${corpo}</div>` + botaoMais;
}

// ---------------- Topico 5: Pagamento ----------------
async function carregarPagamento() {
  try {
    const dados = await chamarApi(`/plantao/meu-pagamento?pagina=${estadoPagamento.pagina}`);
    if (menuSecaoAtiva !== 'pagamento') return;
    estadoPagamento.plantaoAtual = dados.plantao_atual;
    estadoPagamento.plantoesAcumulados = estadoPagamento.plantoesAcumulados.concat(dados.plantoes_anteriores || []);
    estadoPagamento.temMais = dados.tem_mais;
    estadoPagamento.totalGeral = dados.total_geral;
    renderizarPagamentoNaTela();
  } catch (erro) {
    document.getElementById('menu-detalhe-conteudo').innerHTML = `<p class="erro">${erro.message}</p>`;
  }
}
function carregarMaisPagamento() {
  if (!estadoPagamento.temMais) return;
  estadoPagamento.pagina += 1;
  carregarPagamento();
}
function renderizarPagamentoNaTela() {
  const conteudo = document.getElementById('menu-detalhe-conteudo');
  const atual = estadoPagamento.plantaoAtual;
  const g = estadoPagamento.totalGeral || {};

  let html = `<p class="resumo-geral-titulo">PLANTÃO ATUAL</p>`;
  if (atual) {
    html += `
      <div class="item-plantao-pagamento">
        <div class="item-plantao-pagamento__topo">
          <span>Desde ${formatarHora(atual.inicio)} <span class="badge-plantao-aberto">Em aberto</span></span>
          <span class="item-plantao-pagamento__valor">${formatarMoeda(atual.valor_total)}</span>
        </div>
        <div class="item-plantao-pagamento__sub">${atual.codigos_rota.length} rota(s) concluída(s) neste plantão</div>
        ${atual.codigos_rota.length ? `<div class="item-plantao-pagamento__codigos">${atual.codigos_rota.map(c => `<span class="tag-codigo-rota">#${c}</span>`).join('')}</div>` : ''}
      </div>
    `;
  } else {
    html += `<p class="ajuda">Nenhum plantão em aberto agora.</p>`;
  }

  html += `<p class="resumo-geral-titulo" style="margin-top:16px;">PLANTÕES ANTERIORES</p>`;
  const corpo = estadoPagamento.plantoesAcumulados.map(p => `
    <div class="item-plantao-pagamento">
      <div class="item-plantao-pagamento__topo">
        <span>${new Date(p.inicio).toLocaleDateString('pt-BR')} · ${formatarHora(p.inicio)} – ${formatarHora(p.fim)}</span>
        <span class="item-plantao-pagamento__valor">${formatarMoeda(p.valor_total)}</span>
      </div>
      <div class="item-plantao-pagamento__sub">${p.codigos_rota.length} rota(s) · caixinha ${formatarMoeda(p.total_gorjetas)}</div>
      ${p.codigos_rota.length ? `<div class="item-plantao-pagamento__codigos">${p.codigos_rota.map(c => `<span class="tag-codigo-rota">#${c}</span>`).join('')}</div>` : ''}
    </div>
  `).join('') || '<p class="ajuda">Nenhum plantão fechado ainda.</p>';

  const botaoMais = estadoPagamento.temMais
    ? `<button type="button" class="botao-carregar-mais" data-carregar-mais="pagamento">Carregar mais</button>` : '';

  html += `<div class="lista-com-rolagem">${corpo}</div>${botaoMais}`;

  html += `
    <p class="resumo-geral-titulo" style="margin-top:16px;">TOTAL GERAL</p>
    <div class="resumo-geral-linha"><span>Plantões</span><strong>${g.total_plantoes ?? 0}</strong></div>
    <div class="resumo-geral-linha"><span>Rotas realizadas</span><strong>${g.total_entregas ?? 0}</strong></div>
    <div class="resumo-geral-linha"><span>Caixinha acumulada</span><strong>${formatarMoeda(g.total_gorjetas)}</strong></div>
    <div class="resumo-geral-linha"><span>Valor total</span><strong>${formatarMoeda(g.valor_total)}</strong></div>
  `;

  conteudo.innerHTML = html;
}

function fazerLogout() {
  pararCamera();
  pararPolling();
  limparSessao();
  salvarEstadoMenu(null);
  mostrarTela('tela-login');
}

// -------------------- Inicializacao --------------------
// So mostra a tela de check-in (camera) quando realmente PRECISA checar in
// hoje. Se o entregador ja fez check-in (tem plantao aberto), pula direto
// pra tela de espera/rota -- assim recarregar a pagina no meio de uma
// entrega nao manda ele de volta pra camera (ele pode estar longe da loja
// nesse momento e nao ter como escanear o QR de novo).
async function iniciarAppLogado() {
  try {
    const plantaoAtual = await chamarApi('/plantao/atual');
    if (plantaoAtual) {
      await iniciarAguardandoPedido();
      restaurarTelaMenuSalva();
      return;
    }
  } catch {
    // Se der erro de rede/servidor, cai no fluxo normal de check-in abaixo
    // (mais seguro do que travar a tela em branco).
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
