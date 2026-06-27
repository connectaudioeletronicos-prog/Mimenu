const ChaveSessao = 'cardapio_admin_token';
const ChaveEstabelecimento = 'cardapio_admin_estabelecimento';

function obterToken() {
  return sessionStorage.getItem(ChaveSessao);
}

function salvarSessao(token, estabelecimento) {
  sessionStorage.setItem(ChaveSessao, token);
  sessionStorage.setItem(ChaveEstabelecimento, JSON.stringify(estabelecimento));
}

function obterEstabelecimentoSessao() {
  const dados = sessionStorage.getItem(ChaveEstabelecimento);
  return dados ? JSON.parse(dados) : null;
}

function limparSessao() {
  sessionStorage.removeItem(ChaveSessao);
  sessionStorage.removeItem(ChaveEstabelecimento);
}

async function chamarApiAdmin(caminho, { method = 'GET', body = null, isFormData = false } = {}) {
  const headers = { 'Authorization': `Bearer ${obterToken()}` };
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const resposta = await fetch(`${API_BASE_URL}/admin${caminho}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined)
  });

  if (resposta.status === 401) {
    limparSessao();
    window.location.reload();
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(dados.erro || 'Ocorreu um erro ao processar a solicitacao.');
  }
  return dados;
}

async function apiLogin(email, senha) {
  const resposta = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha })
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel entrar.');
  return dados;
}

const apiBuscarEstabelecimento = () => chamarApiAdmin('/estabelecimento');
const apiAtualizarEstabelecimento = (dados) => chamarApiAdmin('/estabelecimento', { method: 'PUT', body: dados });
const apiUploadLogo = (formData) => chamarApiAdmin('/estabelecimento/logo', { method: 'POST', body: formData, isFormData: true });
const apiUploadBanner = (formData) => chamarApiAdmin('/estabelecimento/banner', { method: 'POST', body: formData, isFormData: true });

const apiListarCategorias = () => chamarApiAdmin('/categorias');
const apiCriarCategoria = (formData) => chamarApiAdmin('/categorias', { method: 'POST', body: formData, isFormData: true });
const apiAtualizarCategoria = (id, formData) => chamarApiAdmin(`/categorias/${id}`, { method: 'PUT', body: formData, isFormData: true });
const apiExcluirCategoria = (id) => chamarApiAdmin(`/categorias/${id}`, { method: 'DELETE' });

const apiListarProdutos = () => chamarApiAdmin('/produtos');
const apiCriarProduto = (formData) => chamarApiAdmin('/produtos', { method: 'POST', body: formData, isFormData: true });
const apiAtualizarProduto = (id, formData) => chamarApiAdmin(`/produtos/${id}`, { method: 'PUT', body: formData, isFormData: true });
const apiExcluirProduto = (id) => chamarApiAdmin(`/produtos/${id}`, { method: 'DELETE' });

const apiListarPromocoes = () => chamarApiAdmin('/promocoes');
const apiCriarPromocao = (formData) => chamarApiAdmin('/promocoes', { method: 'POST', body: formData, isFormData: true });
const apiAtualizarPromocao = (id, formData) => chamarApiAdmin(`/promocoes/${id}`, { method: 'PUT', body: formData, isFormData: true });
const apiExcluirPromocao = (id) => chamarApiAdmin(`/promocoes/${id}`, { method: 'DELETE' });

const apiListarPedidos = (status = '') => chamarApiAdmin(`/pedidos${status ? `?status=${status}` : ''}`);
const apiAtualizarStatusPedido = (id, status_pedido) => chamarApiAdmin(`/pedidos/${id}/status`, { method: 'PUT', body: { status_pedido } });
