// ===================================================================
// Autenticacao do cliente (Palatos) - cadastro e login
// ===================================================================

const CHAVE_TOKEN_CLIENTE = 'palatos_token_cliente';
const CHAVE_CONTA_CLIENTE = 'palatos_conta_cliente';

function salvarSessaoCliente(token, conta) {
  localStorage.setItem(CHAVE_TOKEN_CLIENTE, token);
  localStorage.setItem(CHAVE_CONTA_CLIENTE, JSON.stringify(conta));
}

function mostrarErro(id, mensagem) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = mensagem;
  el.classList.remove('oculto');
}

function esconderErro(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('oculto');
}

// -------------------------------------------------------------
// Pagina de cadastro (wizard de 2 etapas)
// -------------------------------------------------------------
const formCadastro = document.getElementById('form-cadastro-cliente');
if (formCadastro) {
  const irParaEtapa = (numero) => {
    document.getElementById('etapa-1').classList.toggle('oculto', numero !== 1);
    document.getElementById('etapa-2').classList.toggle('oculto', numero !== 2);
    document.querySelectorAll('[data-passo-bolha]').forEach(b => {
      b.classList.toggle('auth-passo__bolha--ativa', parseInt(b.getAttribute('data-passo-bolha'), 10) <= numero);
    });
  };

  document.getElementById('botao-avancar').addEventListener('click', () => {
    esconderErro('erro-etapa-1');
    const nome = document.getElementById('cad-nome').value.trim();
    const sobrenome = document.getElementById('cad-sobrenome').value.trim();
    const email = document.getElementById('cad-email').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const senha = document.getElementById('cad-senha').value;

    if (!nome || !sobrenome || !senha) {
      return mostrarErro('erro-etapa-1', 'Preencha nome, sobrenome e senha.');
    }
    if (!email && !telefone) {
      return mostrarErro('erro-etapa-1', 'Informe pelo menos um e-mail ou telefone.');
    }
    if (senha.length < 6) {
      return mostrarErro('erro-etapa-1', 'A senha deve ter pelo menos 6 caracteres.');
    }
    irParaEtapa(2);
  });

  document.getElementById('botao-voltar').addEventListener('click', () => irParaEtapa(1));

  document.getElementById('botao-buscar-cep').addEventListener('click', async () => {
    esconderErro('erro-etapa-2');
    const cepBruto = document.getElementById('cad-cep').value.replace(/\D/g, '');
    if (cepBruto.length !== 8) {
      return mostrarErro('erro-etapa-2', 'Informe um CEP valido (8 digitos).');
    }
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepBruto}/json/`);
      const dados = await resposta.json();
      if (dados.erro) {
        return mostrarErro('erro-etapa-2', 'CEP nao encontrado.');
      }
      document.getElementById('cad-logradouro').value = dados.logradouro || '';
      document.getElementById('cad-bairro').value = dados.bairro || '';
      document.getElementById('cad-cidade').value = dados.localidade || '';
      document.getElementById('cad-uf').value = dados.uf || '';
      document.getElementById('cad-numero').focus();
    } catch (erro) {
      mostrarErro('erro-etapa-2', 'Nao foi possivel buscar o CEP agora. Preencha o endereco manualmente.');
    }
  });

  formCadastro.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    esconderErro('erro-etapa-2');

    const corpo = {
      nome: document.getElementById('cad-nome').value.trim(),
      sobrenome: document.getElementById('cad-sobrenome').value.trim(),
      email: document.getElementById('cad-email').value.trim() || null,
      telefone: document.getElementById('cad-telefone').value.trim() || null,
      senha: document.getElementById('cad-senha').value,
      cpf: document.getElementById('cad-cpf').value.trim(),
      cep: document.getElementById('cad-cep').value.trim(),
      logradouro: document.getElementById('cad-logradouro').value.trim(),
      numero: document.getElementById('cad-numero').value.trim(),
      bairro: document.getElementById('cad-bairro').value.trim(),
      cidade: document.getElementById('cad-cidade').value.trim(),
      uf: document.getElementById('cad-uf').value
    };

    if (!corpo.cpf || !corpo.cep || !corpo.logradouro || !corpo.numero || !corpo.bairro || !corpo.cidade || !corpo.uf) {
      return mostrarErro('erro-etapa-2', 'Preencha todos os dados de endereco.');
    }

    const botao = document.getElementById('botao-finalizar');
    botao.disabled = true;
    botao.textContent = 'Enviando...';

    try {
      const resposta = await fetch(`${API_BASE_URL}/clientes/auth/cadastrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        throw new Error(dados.erro || 'Nao foi possivel concluir o cadastro.');
      }
      salvarSessaoCliente(dados.token, dados.conta);
      window.location.href = 'index.html';
    } catch (erro) {
      mostrarErro('erro-etapa-2', erro.message);
      botao.disabled = false;
      botao.textContent = '🔒 Finalizar cadastro';
    }
  });
}

// -------------------------------------------------------------
// Login/cadastro com Google
// -------------------------------------------------------------
function iniciarLoginGoogle(botaoId, mensagemErroId) {
  const botao = document.getElementById(botaoId);
  if (!botao) return;

  botao.addEventListener('click', () => {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      return mostrarErro(mensagemErroId, 'Ainda carregando o Google. Aguarde um instante e tente de novo.');
    }
    esconderErro(mensagemErroId);

    const textoOriginal = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = 'Conectando...';

    const restaurarBotao = () => {
      botao.disabled = false;
      botao.innerHTML = textoOriginal;
    };

    const clienteCodigo = google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: async (resposta) => {
        if (!resposta || !resposta.code) {
          restaurarBotao();
          return mostrarErro(mensagemErroId, 'Nao foi possivel conectar com o Google.');
        }
        try {
          const r = await fetch(`${API_BASE_URL}/clientes/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: resposta.code })
          });
          const dados = await r.json();
          if (!r.ok) {
            throw new Error(dados.erro || 'Nao foi possivel entrar com o Google.');
          }
          salvarSessaoCliente(dados.token, dados.conta);
          window.location.href = 'index.html';
        } catch (erro) {
          mostrarErro(mensagemErroId, erro.message);
          restaurarBotao();
        }
      },
      error_callback: () => restaurarBotao()
    });

    clienteCodigo.requestCode();
  });
}

iniciarLoginGoogle('botao-google-login', 'erro-login');
iniciarLoginGoogle('botao-google-cadastro', 'erro-etapa-1');

// -------------------------------------------------------------
// Pagina de login
// -------------------------------------------------------------
const formLogin = document.getElementById('form-login-cliente');
if (formLogin) {
  formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    esconderErro('erro-login');

    const email = document.getElementById('login-identificador').value.trim();
    const senha = document.getElementById('login-senha').value;

    if (!email || !senha) {
      return mostrarErro('erro-login', 'Preencha e-mail e senha.');
    }

    try {
      const resposta = await fetch(`${API_BASE_URL}/clientes/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        throw new Error(dados.erro || 'Nao foi possivel entrar.');
      }
      salvarSessaoCliente(dados.token, dados.conta);
      window.location.href = 'index.html';
    } catch (erro) {
      mostrarErro('erro-login', erro.message);
    }
  });
}
