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
    throw new Error(dados.erro);
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

function formatarMoeda(valor) {
  return `R$ ${parseFloat(valor || 0).toFixed(2).replace('.', ',')}`;
}

function formatarPagamento(forma) {
  const nomes = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito' };
  return nomes[forma] || forma || '-';
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
async function iniciarLeituraQR() {
  mostrarTela('tela-checkin');
  const video = document.getElementById('video-qr');
  const statusEl = document.getElementById('checkin-status');
  const erroEl = document.getElementById('checkin-erro');
  erroEl.classList.add('oculto');
  statusEl.textContent = 'Abrindo câmera...';

  try {
    streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = streamCamera;
    await video.play();
    statusEl.textContent = 'Aponte para o QR Code da loja.';

    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('2d');

    const lerFrame = async () => {
      if (!streamCamera) return; // tela foi trocada / camera parada
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imagem = contexto.getImageData(0, 0, canvas.width, canvas.height);
        const codigo = window.jsQR(imagem.data, imagem.width, imagem.height);
        if (codigo && codigo.data) {
          pararCamera();
          statusEl.textContent = 'Confirmando checkin...';
          try {
            const resultado = await chamarApi('/checkin', { method: 'POST', body: { token: codigo.data } });
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
      }
      requestAnimationFrame(lerFrame);
    };
    requestAnimationFrame(lerFrame);
  } catch (erro) {
    erroEl.textContent = 'Não foi possível acessar a câmera. Verifique as permissões do navegador.';
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
  mostrarTela('tela-aguardando');
  pararPolling();
  intervaloPolling = setInterval(verificarOfertaOuEntregaAtual, INTERVALO_POLL_MS);
  verificarOfertaOuEntregaAtual();
}

function pararPolling() {
  if (intervaloPolling) {
    clearInterval(intervaloPolling);
    intervaloPolling = null;
  }
}

let pedidoOfertaAtual = null;
let pedidoAndamentoAtual = null;

async function verificarOfertaOuEntregaAtual() {
  try {
    // Prioridade 1: entrega ja aceita e em andamento (ex: reabriu o app).
    const emAndamento = await chamarApi('/entregas/atual');
    if (emAndamento) {
      pedidoAndamentoAtual = emAndamento;
      exibirEntregaEmAndamento(emAndamento);
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
    const pedido = await chamarApi(`/entregas/${pedidoOfertaAtual.id}/aceitar`, { method: 'PUT' });
    pedidoAndamentoAtual = pedido;
    exibirEntregaEmAndamento(pedido);
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

function exibirEntregaEmAndamento(pedido) {
  document.getElementById('andamento-cliente').textContent = pedido.cliente_nome || '-';
  document.getElementById('andamento-endereco').textContent = pedido.cliente_endereco || '-';
  document.getElementById('andamento-telefone').textContent = pedido.cliente_telefone || '-';
  document.getElementById('andamento-total').textContent = formatarMoeda(pedido.total);
  document.getElementById('andamento-pagamento').textContent = formatarPagamento(pedido.forma_pagamento);
  mostrarTela('tela-em-andamento');
}

document.getElementById('botao-encerrar').addEventListener('click', async () => {
  if (!pedidoAndamentoAtual) return;
  try {
    await chamarApi(`/entregas/${pedidoAndamentoAtual.id}/encerrar`, { method: 'PUT' });
    pedidoAndamentoAtual = null;
    mostrarToast('Entrega encerrada. Você voltou para a fila.');
    iniciarAguardandoPedido();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
});

document.getElementById('botao-sair-aguardando').addEventListener('click', fazerLogout);
document.getElementById('botao-sair-fora-horario').addEventListener('click', fazerLogout);

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
