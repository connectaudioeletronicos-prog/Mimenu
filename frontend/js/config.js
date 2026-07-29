const API_BASE_URL = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return 'https://mimenu-bcsl.onrender.com/api';
})();

function obterSlugDaURL() {
  const parametros = new URLSearchParams(window.location.search);
  if (parametros.has('slug')) {
    return parametros.get('slug');
  }

  // Sem "?slug=" na URL nao tem como saber de qual loja se trata -- o
  // fallback antigo tentava adivinhar pelo primeiro pedaco do caminho
  // (ex: "/frontend/index.html" -> "frontend"), mas como o site fica
  // hospedado dentro de uma pasta chamada justamente "frontend", isso
  // sempre devolvia "frontend" como se fosse o slug de uma loja de
  // verdade, causando "Estabelecimento nao encontrado". As duas formas
  // legitimas de chegar aqui (link direto com ?slug=... ou a URL limpa
  // tipo palatos.com.br/loja-teste, redirecionada pelo 404.html da raiz)
  // sempre preenchem esse parametro, entao null aqui e o comportamento
  // correto quando ele realmente nao veio.
  return null;
}

// ID de cliente OAuth do Google (publico, usado so pelo navegador para
// abrir a janela de login do Google - nao e um segredo).
const GOOGLE_CLIENT_ID = '903108778717-t74g7vt3o16fkh86pkcvv8ompc15i925.apps.googleusercontent.com';

const SLUG_ESTABELECIMENTO = obterSlugDaURL();
const DOMINIO_ATUAL = window.location.hostname;

const CHAVE_DADOS_CLIENTE = 'mimenu_dados_cliente';

function salvarDadosCliente(dados) {
  localStorage.setItem(CHAVE_DADOS_CLIENTE, JSON.stringify(dados));
}

function obterDadosCliente() {
  const dados = localStorage.getItem(CHAVE_DADOS_CLIENTE);
  return dados ? JSON.parse(dados) : { nome: '', telefone: '', endereco: '' };
}

// -------------------------------------------------------------
// Corrige automaticamente os links internos (Entrar / Criar conta)
// para sempre levarem o slug da loja junto, evitando cair na tela
// de "Cardapio nao encontrado" ao trocar de pagina.
// -------------------------------------------------------------
(function corrigirLinksComSlug() {
  if (!SLUG_ESTABELECIMENTO) return;
  document.querySelectorAll('a[href="cliente-login.html"], a[href="cliente-cadastro.html"]').forEach((link) => {
    const hrefBase = link.getAttribute('href').split('?')[0];
    link.setAttribute('href', `${hrefBase}?slug=${encodeURIComponent(SLUG_ESTABELECIMENTO)}`);
  });
})();
