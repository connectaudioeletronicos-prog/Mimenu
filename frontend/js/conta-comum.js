// ===================================================================
// Codigo compartilhado entre as 3 paginas da area do cliente:
// minha-conta.html (Meus dados), meus-pedidos.html (Meus pedidos) e
// minhas-reservas.html (Minhas reservas). Antes essas 3 telas eram uma
// unica pagina com "abas" que so escondiam/mostravam divs -- agora sao
// paginas de verdade, e este arquivo cuida do que e' igual nas 3:
// carregar a conta logada e montar a navegacao do topo (Voltar, Sair,
// e os 3 botoes Meus dados / Meus pedidos / Minhas reservas).
// Precisa ser carregado DEPOIS de config.js e utils.js, e ANTES do
// script especifico de cada pagina (minha-conta.js, meus-pedidos.js
// ou minhas-reservas.js).
// ===================================================================

const CHAVE_TOKEN_CLIENTE_CONTA = 'palatos_token_cliente';
const CHAVE_CONTA_CLIENTE_CONTA = 'palatos_conta_cliente';

let CONTA_ATUAL = null;

// Busca a conta logada em /clientes/auth/me. Se nao tiver token ou o
// token for invalido, manda pro login e devolve null (quem chamou deve
// parar a propria inicializacao nesse caso).
async function carregarContaCliente() {
  const token = sessionStorage.getItem(CHAVE_TOKEN_CLIENTE_CONTA);
  if (!token) {
    window.location.href = linkComSlug('cliente-login.html');
    return null;
  }

  try {
    const resposta = await fetch(`${API_BASE_URL}/clientes/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resposta.ok) {
      sessionStorage.removeItem(CHAVE_TOKEN_CLIENTE_CONTA);
      sessionStorage.removeItem(CHAVE_CONTA_CLIENTE_CONTA);
      window.location.href = linkComSlug('cliente-login.html');
      return null;
    }
    CONTA_ATUAL = await resposta.json();
    return CONTA_ATUAL;
  } catch (erro) {
    document.getElementById('tela-carregando').innerHTML =
      '<p style="padding:20px;text-align:center;">Nao foi possivel carregar sua conta agora. Verifique sua conexao e tente novamente.</p>';
    return null;
  }
}

// Monta a navegacao do topo, igual nas 3 paginas:
// - Botao "Voltar": em "dados" volta pro cardapio; em "pedidos"/"reservas"
//   volta para "Meus dados" (minha-conta.html), que e' a tela inicial.
// - Link "Suporte": abre o e-mail de suporte.
// - Os 3 botoes de navegacao (Meus dados / Meus pedidos / Minhas reservas):
//   marca o botao da paginaAtual como ativo e liga os outros dois para
//   navegar de verdade (mudar de pagina), sem esconder/mostrar div.
// - Botao "Sair da conta".
function configurarNavegacaoConta(paginaAtual) {
  const botaoVoltar = document.getElementById('botao-voltar-cardapio');
  if (botaoVoltar) {
    botaoVoltar.addEventListener('click', () => {
      if (paginaAtual === 'dados') {
        window.location.href = linkComSlug('index.html');
      } else {
        window.location.href = linkComSlug('minha-conta.html');
      }
    });
  }

  const linkSuporte = document.getElementById('link-suporte');
  if (linkSuporte) {
    linkSuporte.setAttribute('href', 'mailto:suporte@palatos.com.br');
  }

  document.querySelectorAll('[data-aba-cliente]').forEach(botao => {
    const destino = botao.dataset.abaCliente;
    if (destino === paginaAtual) {
      botao.classList.add('ativo');
      return;
    }
    botao.classList.remove('ativo');
    const paginas = { dados: 'minha-conta.html', pedidos: 'meus-pedidos.html', reservas: 'minhas-reservas.html' };
    botao.addEventListener('click', () => {
      window.location.href = linkComSlug(paginas[destino]);
    });
  });

  const botaoSair = document.getElementById('botao-sair-conta');
  if (botaoSair) {
    botaoSair.addEventListener('click', () => {
      sessionStorage.removeItem(CHAVE_TOKEN_CLIENTE_CONTA);
      sessionStorage.removeItem(CHAVE_CONTA_CLIENTE_CONTA);
      window.location.href = linkComSlug('index.html');
    });
  }
}

// Preenche a saudacao "Ola, <nome>" no topo -- igual nas 3 paginas.
function preencherSaudacaoConta(conta) {
  const elemento = document.getElementById('conta-nome-topo');
  if (elemento) elemento.textContent = conta.nome || 'usuário';
}
