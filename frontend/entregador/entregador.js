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
    if (resposta.ok && dados.logo_url) {
      imagemEl.src = dados.logo_url;
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
    const resultado = await chamarApi('/checkin', { method: 'POST', body: { token: codigo } });
    mostrarToast(resultado.mensagem || 'Checkin realizado!');
    iniciarAguardandoPedido();
  } catch (erro) {
    if (erro.foraDoHorario) return; // ja trocou pra tela-fora-horario
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
  verificarOfertaOuEntregaAtual();
  atualizarPosicaoNaFila();
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

async function verificarOfertaOuEntregaAtual() {
  try {
    // Prioridade 1: entrega(s) ja aceita(s) e em andamento (ex: reabriu o app,
    // ou o admin atribuiu mais de um pedido pra essa rota).
    const emAndamento = await chamarApi('/entregas/atual');
    if (Array.isArray(emAndamento) && emAndamento.length > 0) {
      paradasRotaAtual = emAndamento;
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

// Renderiza a tela de "rota em andamento": a proxima parada em destaque
// (primeira da fila, por ordem de saida) + as demais paradas restantes
// (caso o admin tenha atribuido mais de um pedido pra essa rota) + resumo
// do dia (busca /plantao/atual em paralelo pra pegar entregas ja concluidas).
// Comissao do ENTREGADOR por entrega -- nunca o valor do pedido (isso e
// dinheiro da loja/produto, coisa completamente diferente). Usa a forma de
// pagamento configurada pro entregador (por entrega fixa ou por km) + a
// gorjeta que o cliente ja tiver dado no pedido (caixinha).
function comissaoDaEntrega(pedido) {
  const dados = obterDados();
  const comissao = dados?.formaPagamentoEntrega === 'km'
    ? (parseFloat(pedido.distancia_km) || 0) * (parseFloat(dados?.valorPorKm) || 0)
    : (parseFloat(dados?.valorPorEntrega) || 0);
  const gorjeta = parseFloat(pedido.gorjeta) || 0;
  return comissao + gorjeta;
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

  document.getElementById('rota-proxima-cliente').textContent = proxima.cliente_nome || '-';
  document.getElementById('rota-proxima-endereco').textContent = proxima.cliente_endereco || '-';
  document.getElementById('rota-proxima-total').textContent = formatarMoeda(proxima.total);
  document.getElementById('rota-botao-navegar').href = enderecoParaLinkMaps(proxima.cliente_endereco);
  document.getElementById('rota-pago-momento').textContent = formatarMoeda(0);

  aplicarFormaPagamento(
    proxima,
    document.getElementById('rota-proxima-pagamento'),
    document.getElementById('rota-troco-bloco'),
    document.getElementById('rota-troco-para'),
    document.getElementById('rota-troco-valor')
  );

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

  // "Valor da rota" e o quanto o ENTREGADOR ganha nessa rota (comissao +
  // caixinha), nunca o valor dos pedidos (isso pertence a loja/produto e
  // fica separado, so aparece em "A receber do cliente" abaixo).
  const valorRota = paradas.reduce((soma, p) => soma + comissaoDaEntrega(p), 0);
  document.getElementById('rota-valor-total').textContent = formatarMoeda(valorRota);

  const ganhoHoje = plantaoAtualCache?.valor_total ?? 0;
  document.getElementById('rota-resumo-andamento').textContent = paradas.length;
  document.getElementById('rota-resumo-andamento-valor').textContent = formatarMoeda(valorRota);
  document.getElementById('rota-resumo-realizadas').textContent = realizadasHoje;
  document.getElementById('rota-resumo-realizadas-valor').textContent = formatarMoeda(ganhoHoje);
  document.getElementById('rota-resumo-totalrotas').textContent = totalRota;
  document.getElementById('rota-resumo-totalrotas-valor').textContent = formatarMoeda(ganhoHoje + valorRota);
  document.getElementById('rota-resumo-a-receber').textContent = formatarMoeda(valorRota);

  const listaEl = document.getElementById('lista-paradas-restantes');
  if (restantes.length === 0) {
    listaEl.innerHTML = '';
  } else {
    listaEl.innerHTML = `<p class="rotulo-detalhe" style="margin-bottom:8px;">Próximas paradas da rota</p>` +
      restantes.map((p, i) => `
        <div class="parada-futura">
          <strong><span class="parada-futura__numero">${i + 2}</span>${escaparHtml(p.cliente_nome || '-')}</strong>
          <span>${escaparHtml(p.cliente_endereco || '-')} · ${formatarMoeda(comissaoDaEntrega(p))}</span>
        </div>
      `).join('');
  }

  mostrarTela('tela-rota');
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
    verificarOfertaOuEntregaAtual();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

document.getElementById('botao-sair-aguardando').addEventListener('click', () => {
  encerrarPlantaoEMostrarResumo();
});
document.getElementById('botao-sair-fora-horario').addEventListener('click', fazerLogout);

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
    const valorPendente = paradasRotaAtual.reduce((s, p) => s + (comissaoDaEntrega(p)), 0);
    const realizadas = plantaoAtualCache?.total_entregas ?? 0;
    const valorUltimaRota = plantaoAtualCache?.valor_ultima_rota;
    const gorjetasHoje = plantaoAtualCache?.total_gorjetas ?? 0;
    conteudo.innerHTML = `
      <p class="resumo-geral-titulo">PLANTÃO DE HOJE</p>
      <div class="resumo-geral-linha"><span>Em andamento</span><strong>${emRota}</strong></div>
      <div class="resumo-geral-linha"><span>Entregas realizadas</span><strong>${realizadas}</strong></div>
      <div class="resumo-geral-linha"><span>Valor pendente (em rota)</span><strong>${formatarMoeda(valorPendente)}</strong></div>
      <div class="resumo-geral-linha"><span>Valor da última rota</span><strong>${valorUltimaRota == null ? '-' : formatarMoeda(valorUltimaRota)}</strong></div>
      <div class="resumo-geral-linha"><span>Caixinha recebida hoje</span><strong>${formatarMoeda(gorjetasHoje)}</strong></div>
    `;
    return;
  }

  if (secao === 'historico') {
    conteudo.innerHTML = '<p class="ajuda">Carregando...</p>';
    chamarApi('/plantao/meu-historico').then(dados => {
      const r = dados.resumo || {};
      let html = `
        <p class="resumo-geral-titulo">RESUMO GERAL</p>
        <div class="resumo-geral-linha"><span>Total de plantões</span><strong>${r.total_plantoes ?? 0}</strong></div>
        <div class="resumo-geral-linha"><span>Entregas realizadas</span><strong>${r.total_entregas ?? 0}</strong></div>
        <div class="resumo-geral-linha"><span>Total em caixinhas</span><strong>${formatarMoeda(r.total_gorjetas)}</strong></div>
        <div class="resumo-geral-linha"><span>Valor total a receber</span><strong>${formatarMoeda(r.valor_total)}</strong></div>
        <p class="resumo-geral-titulo" style="margin-top:18px;">ROTAS (PLANTÕES) REALIZADAS</p>
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
    return;
  }

  // "Resumo de rotas": contagem de rotas do dia + detalhe de cada uma
  // (valor, forma de pagamento, troco quando for dinheiro).
  if (secao === 'resumo-rotas') {
    conteudo.innerHTML = '<p class="ajuda">Carregando...</p>';
    chamarApi('/entregas/minhas-hoje').then(dados => {
      const entregas = dados.entregas || [];
      const valorTotalHoje = entregas.reduce((s, e) => s + (e.valor_rota || 0), 0);
      let html = `
        <p class="resumo-geral-titulo">ROTAS DE HOJE</p>
        <div class="resumo-geral-linha"><span>Quantidade de rotas</span><strong>${entregas.length}</strong></div>
        <div class="resumo-geral-linha"><span>Valor total do dia</span><strong>${formatarMoeda(valorTotalHoje)}</strong></div>
        <p class="resumo-geral-titulo" style="margin-top:18px;">DETALHE DE CADA ROTA</p>
      `;
      if (entregas.length === 0) {
        html += '<p class="ajuda">Nenhuma rota concluída hoje ainda.</p>';
      } else {
        html += entregas.map(e => {
          const pagamento = formatarPagamento(e.forma_pagamento);
          const linhaTroco = (e.forma_pagamento === 'dinheiro' && e.troco !== null)
            ? `<div class="item-entrega-detalhe__linha"><span>Troco</span><span>${formatarMoeda(e.troco)}</span></div>` : '';
          return `
            <div class="item-entrega-detalhe">
              <div class="item-entrega-detalhe__topo">
                <span class="item-entrega-detalhe__horario">${formatarHora(e.horario_entregue)}</span>
                <span class="item-entrega-detalhe__valor">${formatarMoeda(e.valor_rota)}</span>
              </div>
              <div class="item-entrega-detalhe__linha"><span>Pedido</span><span>${formatarMoeda(e.total_pedido)}</span></div>
              <div class="item-entrega-detalhe__linha"><span>Pagamento</span><span>${escaparHtml(pagamento)}</span></div>
              ${linhaTroco}
              <div class="item-entrega-detalhe__linha"><span>Caixinha</span><span>${formatarMoeda(e.gorjeta)}</span></div>
            </div>
          `;
        }).join('');
      }
      conteudo.innerHTML = html;
    }).catch(erro => {
      conteudo.innerHTML = `<p class="erro">${erro.message}</p>`;
    });
    return;
  }

  // "Caixinha recebida": total de gorjetas de hoje + historico geral.
  if (secao === 'caixinha') {
    conteudo.innerHTML = '<p class="ajuda">Carregando...</p>';
    Promise.all([
      chamarApi('/entregas/minhas-hoje').catch(() => ({ entregas: [] })),
      chamarApi('/plantao/meu-historico').catch(() => ({ resumo: {} }))
    ]).then(([hoje, historico]) => {
      const entregasComCaixinha = (hoje.entregas || []).filter(e => (e.gorjeta || 0) > 0);
      const gorjetaHoje = (hoje.entregas || []).reduce((s, e) => s + (e.gorjeta || 0), 0);
      const gorjetaTotal = historico.resumo?.total_gorjetas ?? 0;
      let html = `
        <p class="resumo-geral-titulo">CAIXINHA RECEBIDA</p>
        <div class="resumo-geral-linha"><span>Recebida hoje</span><strong>${formatarMoeda(gorjetaHoje)}</strong></div>
        <div class="resumo-geral-linha"><span>Total acumulado</span><strong>${formatarMoeda(gorjetaTotal)}</strong></div>
        <p class="resumo-geral-titulo" style="margin-top:18px;">CAIXINHAS DE HOJE</p>
      `;
      if (entregasComCaixinha.length === 0) {
        html += '<p class="ajuda">Nenhuma caixinha recebida hoje ainda.</p>';
      } else {
        html += entregasComCaixinha.map(e => `
          <div class="item-entrega-detalhe">
            <div class="item-entrega-detalhe__topo">
              <span class="item-entrega-detalhe__horario">${formatarHora(e.horario_entregue)}</span>
              <span class="item-entrega-detalhe__valor">${formatarMoeda(e.gorjeta)}</span>
            </div>
            <div class="item-entrega-detalhe__linha"><span>Cliente</span><span>${escaparHtml(e.cliente_nome || '-')}</span></div>
          </div>
        `).join('');
      }
      conteudo.innerHTML = html;
    }).catch(erro => {
      conteudo.innerHTML = `<p class="erro">${erro.message}</p>`;
    });
    return;
  }

  // "Recebimento": quanto ja recebeu vs. quanto ainda tem a receber.
  if (secao === 'recebimento') {
    conteudo.innerHTML = '<p class="ajuda">Carregando...</p>';
    chamarApi('/plantao/meu-historico').then(dados => {
      const r = dados.resumo || {};
      const valorPendenteAtual = paradasRotaAtual.reduce((s, p) => s + (comissaoDaEntrega(p)), 0);
      const ganhoHoje = plantaoAtualCache?.valor_total ?? 0;
      const html = `
        <p class="resumo-geral-titulo">A RECEBER</p>
        <div class="resumo-geral-linha"><span>Ganhos de hoje (plantão atual)</span><strong>${formatarMoeda(ganhoHoje)}</strong></div>
        <div class="resumo-geral-linha"><span>Em rota agora</span><strong>${formatarMoeda(valorPendenteAtual)}</strong></div>
        <p class="resumo-geral-titulo" style="margin-top:18px;">HISTÓRICO GERAL</p>
        <div class="resumo-geral-linha"><span>Total de plantões encerrados</span><strong>${r.total_plantoes ?? 0}</strong></div>
        <div class="resumo-geral-linha"><span>Valor total a receber</span><strong>${formatarMoeda(r.valor_total)}</strong></div>
        <p class="ajuda" style="margin-top:14px;">Os valores de plantões encerrados são fechados com o seu gestor conforme a política da loja.</p>
      `;
      conteudo.innerHTML = html;
    }).catch(erro => {
      conteudo.innerHTML = `<p class="erro">${erro.message}</p>`;
    });
  }
}

function fazerLogout() {
  pararCamera();
  pararPolling();
  limparSessao();
  mostrarTela('tela-login');
}

// -------------------- Inicializacao --------------------
function iniciarAppLogado() {
  // Sempre passa pelo checkin do dia ao entrar/recarregar a pagina; o
  // proprio checkin de hoje ja feito nao tem problema em repetir (o
  // backend so atualiza a data, e idempotente).
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
