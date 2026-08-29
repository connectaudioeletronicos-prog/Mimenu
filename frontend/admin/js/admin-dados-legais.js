// ===================================================================
// DADOS CADASTRAIS (KYC) -- protegido pela senha de login do dono
// Caminho no projeto: frontend/admin/js/admin-dados-legais.js
// ===================================================================

let DADOS_LEGAIS_DESBLOQUEADO = false;

function renderizarDadosLegais(dados) {
  const linha = (rotulo, valor) => `
    <div style="margin-bottom:8px;">
      <strong style="display:block; font-size:12px; color:#888;">${rotulo}</strong>
      <span>${valor || '-'}</span>
    </div>`;

  if (!dados || (!dados.nome && !dados.cpf && !dados.cnpj)) {
    return '<p>Nenhum dado cadastral (KYC) encontrado para esta loja.</p>';
  }

  const enderecoPartes = [dados.rua, dados.numero, dados.bairro, dados.cidade, dados.uf, dados.cep].filter(Boolean).join(', ');

  return `
    ${linha('Responsavel', [dados.nome, dados.sobrenome].filter(Boolean).join(' '))}
    ${linha('Telefone do responsavel', dados.telefone)}
    ${dados.cpf ? linha('CPF (ultimos 4 digitos)', dados.cpf) : ''}
    ${dados.cnpj ? linha('CNPJ (primeiros 4 digitos)', dados.cnpj) : ''}
    ${dados.razao_social ? linha('Razao social', dados.razao_social) : ''}
    ${dados.nome_fantasia ? linha('Nome fantasia', dados.nome_fantasia) : ''}
    ${linha('Endereco cadastral', enderecoPartes)}
  `;
}

async function carregarDadosLegaisLojista() {
  const container = document.getElementById('dados-legais-somente-leitura');
  if (!container) return;
  container.innerHTML = 'Carregando...';
  try {
    const dados = await chamarApiAdmin('/estabelecimento/dados-legais');
    container.innerHTML = renderizarDadosLegais(dados);
  } catch (erro) {
    container.innerHTML = `<p class="msg erro">${erro.message}</p>`;
  }
}

function configurarEntradaDadosLegais() {
  const botaoAbrir = document.getElementById('botao-ir-para-dados-legais');
  if (!botaoAbrir) return;

  botaoAbrir.addEventListener('click', () => {
    document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    document.getElementById('aba-dados-legais').classList.remove('oculto');

    const bloqueio = document.getElementById('dados-legais-bloqueado');
    const conteudo = document.getElementById('dados-legais-conteudo');

    if (!DADOS_LEGAIS_DESBLOQUEADO) {
      bloqueio.classList.remove('oculto');
      conteudo.classList.add('oculto');
      document.getElementById('dados-legais-senha-input').value = '';
      document.getElementById('dados-legais-senha-erro').classList.add('oculto');
    } else {
      bloqueio.classList.add('oculto');
      conteudo.classList.remove('oculto');
      carregarDadosLegaisLojista();
    }
  });

  document.getElementById('botao-voltar-config-de-dados-legais').addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    document.getElementById('aba-configuracoes').classList.remove('oculto');
  });

  document.getElementById('dados-legais-senha-confirmar').addEventListener('click', async () => {
    const senha = document.getElementById('dados-legais-senha-input').value;
    const erro = document.getElementById('dados-legais-senha-erro');
    if (!senha) return;
    try {
      const resultado = await chamarApiAdmin('/estabelecimento/dados-legais/verificar-senha', { method: 'POST', body: { senha } });
      if (resultado.valido) {
        DADOS_LEGAIS_DESBLOQUEADO = true;
        document.getElementById('dados-legais-bloqueado').classList.add('oculto');
        document.getElementById('dados-legais-conteudo').classList.remove('oculto');
        await carregarDadosLegaisLojista();
      }
    } catch (e) {
      erro.textContent = e.message || 'Senha incorreta.';
      erro.classList.remove('oculto');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  configurarEntradaDadosLegais();
});
