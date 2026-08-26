// ===================================================================
// Redefinicao de senha - conta do cliente final (app do cliente).
// Espelha o mesmo fluxo de admin/js/redefinir-senha.js, mas chamando
// a rota publica de clientes e usando os componentes visuais/classes
// de css/cliente-auth.css (mesma pagina de login/cadastro do cliente).
// ===================================================================

const linkVoltarLogin = document.getElementById('link-voltar-login');
if (linkVoltarLogin) {
  linkVoltarLogin.setAttribute('href', linkComSlug(linkVoltarLogin.getAttribute('href')));
}

document.querySelectorAll('.auth-campo__olho').forEach((botao) => {
  botao.addEventListener('click', () => {
    const input = document.getElementById(botao.getAttribute('data-alvo-senha'));
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

function mostrarAvisoRedefinir(elemento, mensagem, tipo) {
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.classList.remove('visivel', 'auth-aviso--sucesso');
  if (tipo === 'sucesso') elemento.classList.add('auth-aviso--sucesso');
  elemento.classList.add('visivel');
}

const formRedefinirSenha = document.getElementById('form-redefinir-senha');
if (formRedefinirSenha) {
  formRedefinirSenha.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const avisoEl = document.getElementById('redefinir-aviso');
    const botao = document.getElementById('botao-salvar-senha');

    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get('token');

    if (!token) {
      mostrarAvisoRedefinir(avisoEl, 'Link invalido. Solicite a recuperacao de senha novamente.');
      return;
    }

    const novaSenha = document.getElementById('redefinir-senha-nova').value;
    const confirmar = document.getElementById('redefinir-senha-confirmar').value;

    if (novaSenha !== confirmar) {
      mostrarAvisoRedefinir(avisoEl, 'As senhas nao coincidem.');
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Aguarde...';

    try {
      const resposta = await fetch(`${API_BASE_URL}/clientes/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha })
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel redefinir a senha.');

      mostrarAvisoRedefinir(avisoEl, dados.mensagem || 'Sua senha foi cadastrada com sucesso.', 'sucesso');
      formRedefinirSenha.style.display = 'none';
    } catch (erro) {
      mostrarAvisoRedefinir(avisoEl, erro.message);
      botao.disabled = false;
      botao.textContent = 'Salvar nova senha';
    }
  });
}
