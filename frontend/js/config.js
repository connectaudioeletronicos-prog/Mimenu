const API_BASE_URL = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return 'https://SEU-BACKEND.onrender.com/api';
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

const SLUG_ESTABELECIMENTO = obterSlugDaURL();
const DOMINIO_ATUAL = window.location.hostname;
