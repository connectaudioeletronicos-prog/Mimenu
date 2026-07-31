// ===================================================================
// Autenticacao do cliente: login.html e cadastro.html usam este mesmo
// arquivo (cada pagina so tem os elementos que usa, entao os seletores
// abaixo so agem quando o elemento existe na pagina atual).
// ===================================================================

// Ajusta os links "Criar conta" / "Entrar" do rodape pra levar o slug junto
document.querySelectorAll('#link-ir-cadastro, #link-ir-login').forEach((link) => {
  link.setAttribute('href', linkComSlug(link.getAttribute('href')));
});

function mostrarAviso(elemento, mensagem, tipo) {
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.classList.remove('visivel', 'auth-aviso--sucesso');
  if (tipo === 'sucesso') elemento.classList.add('auth-aviso--sucesso');
  elemento.classList.add('visivel');
}

function ocultarAviso(elemento) {
  if (!elemento) return;
  elemento.classList.remove('visivel');
}

function definirCarregando(botao, carregando, textoOriginal) {
  if (!botao) return;
  botao.disabled = carregando;
  if (carregando) {
    botao.dataset.textoOriginal = botao.dataset.textoOriginal || botao.innerHTML;
    botao.innerHTML = 'Aguarde...';
  } else {
    botao.innerHTML = textoOriginal || botao.dataset.textoOriginal || botao.innerHTML;
  }
}

function apresLoginBemSucedido(token, conta) {
  sessionStorage.setItem('palatos_token_cliente', token);
  if (conta && conta.nome) {
    salvarDadosCliente({ nome: `${conta.nome} ${conta.sobrenome || ''}`.trim() });
  }
  window.location.href = linkComSlug('index.html');
}

// -------------------------------------------------------------
// Mostrar/ocultar senha (reaproveitado em todos os campos de senha)
// -------------------------------------------------------------
document.querySelectorAll('.auth-campo__olho').forEach((botao) => {
  botao.addEventListener('click', () => {
    const input = document.getElementById(botao.getAttribute('data-alvo-senha'));
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// -------------------------------------------------------------
// Mascaras simples de digitacao
// -------------------------------------------------------------
function aplicarMascaraCpf(input) {
  if (!input) return;
  input.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 11);
    let valor = numeros;
    if (numeros.length > 9) valor = `${numeros.slice(0,3)}.${numeros.slice(3,6)}.${numeros.slice(6,9)}-${numeros.slice(9)}`;
    else if (numeros.length > 6) valor = `${numeros.slice(0,3)}.${numeros.slice(3,6)}.${numeros.slice(6)}`;
    else if (numeros.length > 3) valor = `${numeros.slice(0,3)}.${numeros.slice(3)}`;
    this.value = valor;
  });
}

aplicarMascaraTelefone(document.getElementById('cadastro-telefone'));
aplicarMascaraCep(document.getElementById('cadastro-cep'));
aplicarMascaraCpf(document.getElementById('cadastro-cpf'));

// ===================================================================
// LOGIN
// ===================================================================
const formLogin = document.getElementById('form-login');
if (formLogin) {
  formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const avisoEl = document.getElementById('login-aviso');
    ocultarAviso(avisoEl);

    const identificador = document.getElementById('login-identificador').value.trim();
    const senha = document.getElementById('login-senha').value;
    const botao = document.getElementById('botao-entrar');

    definirCarregando(botao, true);
    try {
      const resposta = await fetch(`${API_BASE_URL}/clientes/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identificador, senha })
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        mostrarAviso(avisoEl, dados.erro || 'Nao foi possivel entrar. Tente novamente.');
        return;
      }
      apresLoginBemSucedido(dados.token, dados.conta);
    } catch (erro) {
      mostrarAviso(avisoEl, 'Sem conexao com o servidor. Verifique sua internet e tente novamente.');
    } finally {
      definirCarregando(botao, false, 'Entrar');
    }
  });
}

// -------- Esqueci minha senha (alterna pra um painel dentro da mesma pagina) --------
const linkEsqueciSenha = document.getElementById('link-esqueci-senha');
const painelLogin = document.getElementById('painel-login');
const painelEsqueciSenha = document.getElementById('painel-esqueci-senha');

if (linkEsqueciSenha) {
  linkEsqueciSenha.addEventListener('click', (evento) => {
    evento.preventDefault();
    painelLogin.classList.add('oculto');
    painelEsqueciSenha.classList.remove('oculto');
  });
}
const botaoVoltarLogin = document.getElementById('botao-voltar-login');
if (botaoVoltarLogin) {
  botaoVoltarLogin.addEventListener('click', () => {
    painelEsqueciSenha.classList.add('oculto');
    painelLogin.classList.remove('oculto');
  });
}
const formEsqueciSenha = document.getElementById('form-esqueci-senha');
if (formEsqueciSenha) {
  formEsqueciSenha.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const avisoEl = document.getElementById('esqueci-aviso');
    const botao = document.getElementById('botao-enviar-recuperacao');
    const email = document.getElementById('esqueci-email').value.trim();

    definirCarregando(botao, true);
    try {
      const resposta = await fetch(`${API_BASE_URL}/clientes/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const dados = await resposta.json();
      mostrarAviso(avisoEl, dados.mensagem || 'Se esse e-mail estiver cadastrado, enviamos um link de recuperacao.', 'sucesso');
      formEsqueciSenha.reset();
    } catch (erro) {
      mostrarAviso(avisoEl, 'Sem conexao com o servidor. Tente novamente em instantes.');
    } finally {
      definirCarregando(botao, false, 'Enviar link de recuperação');
    }
  });
}

// ===================================================================
// CADASTRO (2 etapas)
// ===================================================================
const formEtapa1 = document.getElementById('form-etapa-1');
const formEtapa2 = document.getElementById('form-etapa-2');
let dadosEtapa1 = null;

if (formEtapa1) {
  // Preenche com dados de um pedido anterior como convidado, se houver.
  const dadosSalvos = obterDadosCliente();
  if (dadosSalvos.telefone) document.getElementById('cadastro-telefone').value = dadosSalvos.telefone;
  if (dadosSalvos.nome) {
    const partes = dadosSalvos.nome.trim().split(' ');
    document.getElementById('cadastro-nome').value = partes[0] || '';
    document.getElementById('cadastro-sobrenome').value = partes.slice(1).join(' ') || '';
  }
  if (dadosSalvos.rua) document.getElementById('cadastro-logradouro').value = dadosSalvos.rua;
  if (dadosSalvos.numero) document.getElementById('cadastro-numero').value = dadosSalvos.numero;
  if (dadosSalvos.cep) document.getElementById('cadastro-cep').value = dadosSalvos.cep;

  formEtapa1.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const avisoEl = document.getElementById('cadastro-aviso');
    ocultarAviso(avisoEl);

    const nome = document.getElementById('cadastro-nome').value.trim();
    const sobrenome = document.getElementById('cadastro-sobrenome').value.trim();
    const email = document.getElementById('cadastro-email').value.trim();
    const telefone = document.getElementById('cadastro-telefone').value.trim();
    const senha = document.getElementById('cadastro-senha').value;
    const confirmarSenha = document.getElementById('cadastro-confirmar-senha').value;

    if (!nome || !sobrenome) return mostrarAviso(avisoEl, 'Informe seu nome e sobrenome.');
    if (!email && !telefone) return mostrarAviso(avisoEl, 'Informe pelo menos um e-mail ou telefone para contato.');
    if (senha.length < 6) return mostrarAviso(avisoEl, 'A senha deve ter pelo menos 6 caracteres.');
    if (senha !== confirmarSenha) return mostrarAviso(avisoEl, 'As senhas nao coincidem.');

    dadosEtapa1 = { nome, sobrenome, email, telefone, senha };

    formEtapa1.classList.add('oculto');
    formEtapa2.classList.remove('oculto');
    document.getElementById('indicador-etapa-1').classList.remove('auth-etapa--ativa');
    document.getElementById('indicador-etapa-1').classList.add('auth-etapa--concluida');
    document.getElementById('indicador-etapa-2').classList.add('auth-etapa--ativa');
    document.getElementById('linha-etapas').classList.add('auth-etapa__linha--concluida');
  });
}

const botaoVoltarEtapa1 = document.getElementById('botao-voltar-etapa-1');
if (botaoVoltarEtapa1) {
  botaoVoltarEtapa1.addEventListener('click', () => {
    formEtapa2.classList.add('oculto');
    formEtapa1.classList.remove('oculto');
    document.getElementById('indicador-etapa-2').classList.remove('auth-etapa--ativa');
    document.getElementById('indicador-etapa-1').classList.remove('auth-etapa--concluida');
    document.getElementById('indicador-etapa-1').classList.add('auth-etapa--ativa');
    document.getElementById('linha-etapas').classList.remove('auth-etapa__linha--concluida');
  });
}

// -------- Busca de CEP (ViaCEP) --------
const botaoBuscarCep = document.getElementById('botao-buscar-cep');
if (botaoBuscarCep) {
  botaoBuscarCep.addEventListener('click', async () => {
    const cepInput = document.getElementById('cadastro-cep');
    const cepLimpo = cepInput.value.replace(/\D/g, '');
    const avisoEl = document.getElementById('cadastro-aviso');
    ocultarAviso(avisoEl);

    if (cepLimpo.length !== 8) {
      mostrarAviso(avisoEl, 'Informe um CEP valido com 8 digitos.');
      return;
    }
    definirCarregando(botaoBuscarCep, true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (dados.erro) {
        mostrarAviso(avisoEl, 'CEP nao encontrado. Confira e tente novamente.');
        return;
      }
      document.getElementById('cadastro-logradouro').value = dados.logradouro || '';
      document.getElementById('cadastro-bairro').value = dados.bairro || '';
      document.getElementById('cadastro-cidade').value = dados.localidade || '';
      if (dados.uf) document.getElementById('cadastro-uf').value = dados.uf;
      document.getElementById('cadastro-numero').focus();
    } catch (erro) {
      mostrarAviso(avisoEl, 'Nao foi possivel buscar o CEP agora. Preencha o endereco manualmente.');
    } finally {
      definirCarregando(botaoBuscarCep, false, '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg> Buscar CEP');
    }
  });
}

if (formEtapa2) {
  formEtapa2.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const avisoEl = document.getElementById('cadastro-aviso');
    ocultarAviso(avisoEl);

    if (!dadosEtapa1) {
      mostrarAviso(avisoEl, 'Sessao de cadastro perdida. Volte e preencha a etapa 1 novamente.');
      return;
    }

    const cpf = document.getElementById('cadastro-cpf').value.trim();
    const cep = document.getElementById('cadastro-cep').value.trim();
    const logradouro = document.getElementById('cadastro-logradouro').value.trim();
    const numero = document.getElementById('cadastro-numero').value.trim();
    const bairro = document.getElementById('cadastro-bairro').value.trim();
    const cidade = document.getElementById('cadastro-cidade').value.trim();
    const uf = document.getElementById('cadastro-uf').value;

    if (cpf.replace(/\D/g, '').length !== 11) return mostrarAviso(avisoEl, 'Informe um CPF valido.');
    if (!cep || !logradouro || !numero || !bairro || !cidade || !uf) {
      return mostrarAviso(avisoEl, 'Preencha todos os dados de endereco.');
    }

    const botao = document.getElementById('botao-finalizar-cadastro');
    definirCarregando(botao, true);
    try {
      const resposta = await fetch(`${API_BASE_URL}/clientes/auth/cadastrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dadosEtapa1, cpf, cep, logradouro, numero, bairro, cidade, uf })
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        mostrarAviso(avisoEl, dados.erro || 'Nao foi possivel criar sua conta. Tente novamente.');
        return;
      }
      apresLoginBemSucedido(dados.token, dados.conta);
    } catch (erro) {
      mostrarAviso(avisoEl, 'Sem conexao com o servidor. Verifique sua internet e tente novamente.');
    } finally {
      definirCarregando(botao, false, '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Finalizar cadastro');
    }
  });
}

// ===================================================================
// LOGIN / CADASTRO COM GOOGLE (usado nas duas paginas)
// ===================================================================
function iniciarFluxoGoogle() {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      reject(new Error('Nao foi possivel carregar o login do Google. Verifique sua conexao.'));
      return;
    }
    const cliente = google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: (resposta) => {
        if (resposta.code) resolve(resposta.code);
        else reject(new Error('Login com Google cancelado.'));
      },
      error_callback: () => reject(new Error('Login com Google cancelado.'))
    });
    cliente.requestCode();
  });
}

async function processarLoginGoogle(botao, avisoEl) {
  ocultarAviso(avisoEl);
  definirCarregando(botao, true);
  try {
    const code = await iniciarFluxoGoogle();
    const resposta = await fetch(`${API_BASE_URL}/clientes/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      mostrarAviso(avisoEl, dados.erro || 'Nao foi possivel entrar com o Google.');
      return;
    }
    apresLoginBemSucedido(dados.token, dados.conta);
  } catch (erro) {
    mostrarAviso(avisoEl, erro.message || 'Nao foi possivel entrar com o Google.');
  } finally {
    definirCarregando(botao, false, botao.dataset.textoOriginal);
  }
}

const botaoGoogleLogin = document.getElementById('botao-google-login');
if (botaoGoogleLogin) {
  botaoGoogleLogin.addEventListener('click', () => {
    processarLoginGoogle(botaoGoogleLogin, document.getElementById('login-aviso'));
  });
}
const botaoGoogleCadastro = document.getElementById('botao-google-cadastro');
if (botaoGoogleCadastro) {
  botaoGoogleCadastro.addEventListener('click', () => {
    processarLoginGoogle(botaoGoogleCadastro, document.getElementById('cadastro-aviso'));
  });
}

// Carrega o SDK do Google Identity Services (usado pelos dois botoes acima)
(function carregarSdkGoogle() {
  if (!document.getElementById('botao-google-login') && !document.getElementById('botao-google-cadastro')) return;
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  document.head.appendChild(script);
})();
