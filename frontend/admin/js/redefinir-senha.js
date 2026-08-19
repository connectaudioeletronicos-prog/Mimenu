const ICONE_OLHO_ABERTO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONE_OLHO_FECHADO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

document.querySelectorAll('.botao-olho').forEach(botao => {
  botao.addEventListener('click', () => {
    const input = document.getElementById(botao.getAttribute('data-alvo-senha'));
    if (!input) return;
    const oculta = input.type === 'password';
    input.type = oculta ? 'text' : 'password';
    botao.innerHTML = oculta ? ICONE_OLHO_FECHADO : ICONE_OLHO_ABERTO;
    botao.setAttribute('aria-label', oculta ? 'Ocultar senha' : 'Mostrar senha');
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
