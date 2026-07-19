const ChaveSessao = 'cardapio_admin_token';
const ChaveEstabelecimento = 'cardapio_admin_estabelecimento';

function obterToken() {
  return sessionStorage.getItem(ChaveSessao);
}

function salvarSessao(token, estabelecimento) {
  sessionStorage.setItem(ChaveSessao, token);
  sessionStorage.setItem(ChaveEstabelecimento, JSON.stringify({
    ...estabelecimento,
    estabelecimentoNome: estabelecimento.nome
  }));
}

// Mesma sessao, mas para quando quem entrou foi um funcionario (nao o dono)
function salvarSessaoFuncionario(token, funcionario) {
  sessionStorage.setItem(ChaveSessao, token);
  sessionStorage.setItem(ChaveEstabelecimento, JSON.stringify({
    nome: funcionario.nome,
    slug: funcionario.slug,
    cargo: funcionario.cargo,
    permissoes: funcionario.permissoes || [],
    estabelecimentoNome: funcionario.estabelecimentoNome || '',
    funcionarioId: funcionario.id,
    tipo: 'funcionario'
  }));
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

async function apiTrocarSenha(senhaAtual, novaSenha) {
  const resposta = await fetch(`${API_BASE_URL}/auth/trocar-senha`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obterToken()}` },
    body: JSON.stringify({ senhaAtual, novaSenha })
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel trocar a senha.');
  return dados;
}

async function apiSolicitarRecuperacaoSenha(email) {
  const resposta = await fetch(`${API_BASE_URL}/auth/esqueci-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel enviar o link de recuperacao.');
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

const apiListarCarrosseis = () => chamarApiAdmin('/carrosseis');
const apiCriarCarrossel = (dados) => chamarApiAdmin('/carrosseis', { method: 'POST', body: dados });
const apiAtualizarCarrossel = (id, dados) => chamarApiAdmin(`/carrosseis/${id}`, { method: 'PUT', body: dados });
const apiExcluirCarrossel = (id) => chamarApiAdmin(`/carrosseis/${id}`, { method: 'DELETE' });
const apiAdicionarImagemCarrossel = (id, formData) => chamarApiAdmin(`/carrosseis/${id}/imagens`, { method: 'POST', body: formData, isFormData: true });
const apiAtualizarImagemCarrossel = (imagemId, dados) => chamarApiAdmin(`/carrosseis/imagens/${imagemId}`, { method: 'PUT', body: dados });
const apiRemoverImagemCarrossel = (imagemId) => chamarApiAdmin(`/carrosseis/imagens/${imagemId}`, { method: 'DELETE' });

const apiListarVitrines = () => chamarApiAdmin('/vitrines');
const apiCriarVitrine = (formData) => chamarApiAdmin('/vitrines', { method: 'POST', body: formData, isFormData: true });
const apiAtualizarVitrine = (id, formData) => chamarApiAdmin(`/vitrines/${id}`, { method: 'PUT', body: formData, isFormData: true });
const apiExcluirVitrine = (id) => chamarApiAdmin(`/vitrines/${id}`, { method: 'DELETE' });

const apiListarCaixasTexto = () => chamarApiAdmin('/caixas-texto');
const apiCriarCaixaTexto = (dados) => chamarApiAdmin('/caixas-texto', { method: 'POST', body: JSON.stringify(dados) });
const apiAtualizarCaixaTexto = (id, dados) => chamarApiAdmin(`/caixas-texto/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
const apiExcluirCaixaTexto = (id) => chamarApiAdmin(`/caixas-texto/${id}`, { method: 'DELETE' });

async function chamarApiFuncionarios(caminho, { method = 'GET', body = null } = {}) {
  const headers = { 'Authorization': `Bearer ${obterToken()}`, 'Content-Type': 'application/json' };
  const resposta = await fetch(`${API_BASE_URL}/funcionarios${caminho}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (resposta.status === 401) {
    limparSessao();
    window.location.reload();
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  const dados = await resposta.json();
  if (!resposta.ok) throw new Error((dados.erro || 'Ocorreu um erro ao processar a solicitacao.') + (dados.detalhe ? ` [${dados.detalhe}]` : ''));
  return dados;
}

async function apiLoginFuncionario(slug, login, senha) {
  const resposta = await fetch(`${API_BASE_URL}/funcionarios/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, login, senha })
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel entrar.');
  return dados;
}

const apiListarFuncionarios = () => chamarApiFuncionarios('/');
const apiCriarFuncionario = (dados) => chamarApiFuncionarios('/', { method: 'POST', body: dados });
const apiAtualizarFuncionario = (id, dados) => chamarApiFuncionarios(`/${id}`, { method: 'PUT', body: dados });
const apiTrocarSenhaFuncionario = (id, dados) => chamarApiFuncionarios(`/${id}/senha`, { method: 'PUT', body: dados });
const apiExcluirFuncionario = (id, senhaConfirmacao) => chamarApiFuncionarios(`/${id}`, { method: 'DELETE', body: { senhaConfirmacao } });

const apiCorrigirValoresPedido = (id, dados) => chamarApiAdmin(`/pedidos/${id}/valores`, { method: 'PUT', body: dados });

const apiListarPedidos = (status = '') => chamarApiAdmin(`/pedidos${status ? `?status=${status}` : ''}`);
const apiContarPedidos = () => chamarApiAdmin('/pedidos/contagem');
const apiAtualizarStatusPedido = (id, status_pedido) => chamarApiAdmin(`/pedidos/${id}/status`, { method: 'PUT', body: { status_pedido } });

const apiObterCaixaGeral = (dataInicio = '', dataFim = '') => {
  const parametros = new URLSearchParams();
  if (dataInicio) parametros.set('data_inicio', dataInicio);
  if (dataFim) parametros.set('data_fim', dataFim);
  const query = parametros.toString();
  return chamarApiAdmin(`/caixa-geral${query ? `?${query}` : ''}`);
};
