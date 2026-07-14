document.querySelectorAll('.botao-olho').forEach(botao => {
  botao.addEventListener('click', () => {
    const input = document.getElementById(botao.getAttribute('data-alvo-senha'));
    if (!input) return;
    const oculta = input.type === 'password';
    input.type = oculta ? 'text' : 'password';
    botao.textContent = oculta ? '🙈' : '👁';
  });
});

document.getElementById('form-redefinir-senha').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const erroEl = document.getElementById('redefinir-senha-erro');
  const sucessoEl = document.getElementById('redefinir-senha-sucesso');
  erroEl.classList.add('oculto');
  sucessoEl.classList.add('oculto');

  const parametros = new URLSearchParams(window.location.search);
  const token = parametros.get('token');

  if (!token) {
    erroEl.textContent = 'Link invalido. Solicite a recuperacao de senha novamente.';
    erroEl.classList.remove('oculto');
    return;
  }

  const novaSenha = document.getElementById('redefinir-senha-nova').value;
  const confirmar = document.getElementById('redefinir-senha-confirmar').value;

  if (novaSenha !== confirmar) {
    erroEl.textContent = 'As senhas nao coincidem.';
    erroEl.classList.remove('oculto');
    return;
  }

  const botao = evento.target.querySelector('button[type="submit"]');
  botao.disabled = true;

  try {
    const resposta = await fetch(`${API_BASE_URL}/auth/redefinir-senha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, novaSenha })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel redefinir a senha.');

    sucessoEl.textContent = dados.mensagem + ' Redirecionando para o login...';
    sucessoEl.classList.remove('oculto');
    evento.target.querySelector('button[type="submit"]').style.display = 'none';
    setTimeout(() => { window.location.href = 'index.html'; }, 2500);
  } catch (erro) {
    erroEl.textContent = erro.message;
    erroEl.classList.remove('oculto');
    botao.disabled = false;
  }
});
