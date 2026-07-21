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

  const caminho = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (caminho) {
    return caminho.split('/')[0];
  }

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
