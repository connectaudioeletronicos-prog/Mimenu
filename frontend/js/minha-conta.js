// ===================================================================
// Pagina "Meus dados" -- mostra e edita os dados reais da conta logada,
// via GET/PUT /clientes/auth/me. Design segue a mesma identidade visual
// das telas de login/cadastro (cores/fonte de cliente-auth.css).
// "Meus pedidos" e "Minhas reservas" agora sao paginas proprias
// (meus-pedidos.html / minhas-reservas.html) -- ver js/meus-pedidos.js
// e js/minhas-reservas.js. O carregamento da conta e a navegacao do
// topo (Voltar/Sair/3 botoes) ficam em js/conta-comum.js, compartilhado
// pelas 3 paginas.
// ===================================================================

document.addEventListener('DOMContentLoaded', iniciarMinhaConta);

async function iniciarMinhaConta() {
  const conta = await carregarContaCliente();
  if (!conta) return;

  preencherSaudacaoConta(conta);
  preencherDadosConta();
  configurarNavegacaoConta('dados');
  configurarEventosMinhaConta();
  atualizarBadgeAbaNotificacoes();

  document.getElementById('tela-carregando').classList.add('oculto');
  document.getElementById('tela-cliente').classList.remove('oculto');
}

function preencherDadosConta() {
  const c = CONTA_ATUAL;
  const nomeCompleto = `${c.nome || ''} ${c.sobrenome || ''}`.trim();
  document.getElementById('conta-campo-nome-completo').value = nomeCompleto;
  document.getElementById('conta-campo-nascimento').value = c.data_nascimento ? c.data_nascimento.substring(0, 10) : '';
  document.getElementById('conta-campo-telefone').value = c.telefone || '';
  document.getElementById('conta-campo-email').value = c.email || '';
  document.getElementById('conta-campo-cpf').value = c.cpf || '';
  document.getElementById('conta-campo-cep').value = c.cep || '';
  document.getElementById('conta-campo-logradouro').value = c.logradouro || '';
  document.getElementById('conta-campo-numero').value = c.numero || '';
  document.getElementById('conta-campo-complemento').value = c.complemento || '';
  document.getElementById('conta-campo-bairro').value = c.bairro || '';
  document.getElementById('conta-campo-cidade').value = c.cidade || '';
  document.getElementById('conta-campo-uf').value = c.uf || '';
  document.getElementById('conta-campo-notificacoes').checked = c.receber_notificacoes !== false;
}

function configurarEventosMinhaConta() {
  aplicarMascaraTelefone(document.getElementById('conta-campo-telefone'));
  aplicarMascaraCep(document.getElementById('conta-campo-cep'));
  aplicarMascaraCpf(document.getElementById('conta-campo-cpf'));

  document.getElementById('botao-buscar-cep-conta').addEventListener('click', async () => {
    const cepBruto = document.getElementById('conta-campo-cep').value.replace(/\D/g, '');
    if (cepBruto.length !== 8) return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepBruto}/json/`);
      const dados = await resposta.json();
      if (dados.erro) return;
      document.getElementById('conta-campo-logradouro').value = dados.logradouro || '';
      document.getElementById('conta-campo-bairro').value = dados.bairro || '';
      document.getElementById('conta-campo-cidade').value = dados.localidade || '';
      document.getElementById('conta-campo-uf').value = dados.uf || '';
    } catch (erro) {
      // Sem conexao com o ViaCEP: cliente preenche o endereco manualmente.
    }
  });

  document.getElementById('form-meus-dados').addEventListener('submit', salvarMeusDados);
}

async function salvarMeusDados(evento) {
  evento.preventDefault();
  const mensagem = document.getElementById('conta-mensagem');
  mensagem.classList.add('oculto');

  const nomeCompleto = document.getElementById('conta-campo-nome-completo').value.trim();
  const partesNome = nomeCompleto.split(' ');
  const nome = partesNome[0] || '';
  const sobrenome = partesNome.slice(1).join(' ');

  const corpo = {
    nome, sobrenome,
    telefone: document.getElementById('conta-campo-telefone').value.trim(),
    cpf: document.getElementById('conta-campo-cpf').value.trim(),
    data_nascimento: document.getElementById('conta-campo-nascimento').value || null,
    cep: document.getElementById('conta-campo-cep').value.trim(),
    logradouro: document.getElementById('conta-campo-logradouro').value.trim(),
    numero: document.getElementById('conta-campo-numero').value.trim(),
    complemento: document.getElementById('conta-campo-complemento').value.trim(),
    bairro: document.getElementById('conta-campo-bairro').value.trim(),
    cidade: document.getElementById('conta-campo-cidade').value.trim(),
    uf: document.getElementById('conta-campo-uf').value,
    receber_notificacoes: document.getElementById('conta-campo-notificacoes').checked
  };

  if (!nome || !sobrenome) {
    mensagem.textContent = 'Informe seu nome completo (nome e sobrenome).';
    mensagem.style.color = 'var(--auth-erro)';
    mensagem.classList.remove('oculto');
    return;
  }

  const token = sessionStorage.getItem(CHAVE_TOKEN_CLIENTE_CONTA);
  const botao = document.getElementById('botao-salvar-meus-dados');
  botao.disabled = true;

  try {
    const resposta = await fetch(`${API_BASE_URL}/clientes/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo)
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Nao foi possivel salvar seus dados.');

    CONTA_ATUAL = dados;
    sessionStorage.setItem(CHAVE_CONTA_CLIENTE_CONTA, JSON.stringify(dados));
    document.getElementById('conta-nome-topo').textContent = dados.nome;
    mensagem.textContent = 'Dados salvos com sucesso!';
    mensagem.style.color = 'var(--auth-verde-texto)';
    mensagem.classList.remove('oculto');
  } catch (erro) {
    mensagem.textContent = erro.message;
    mensagem.style.color = 'var(--auth-erro)';
    mensagem.classList.remove('oculto');
  } finally {
    botao.disabled = false;
  }
}
