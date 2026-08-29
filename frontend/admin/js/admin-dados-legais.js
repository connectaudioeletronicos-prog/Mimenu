// ===================================================================
// INFORMACOES DA LOJA (contato + KYC), tudo protegido pela senha de
// login do proprio dono. Caminho: frontend/admin/js/admin-dados-legais.js
// ===================================================================

let INFORMACOES_DESBLOQUEADO = false;

function preencherCampoKyc(id, valor) {
  const el = document.getElementById(id);
  if (el) el.value = valor || '';
}

async function carregarDadosLegaisLojista() {
  const aviso = document.getElementById('informacoes-aviso-sem-kyc');
  try {
    const dados = await chamarApiAdmin('/estabelecimento/dados-legais');
    aviso.classList.add('oculto');
    preencherCampoKyc('kyc-nome-responsavel', [dados.nome, dados.sobrenome].filter(Boolean).join(' '));
    preencherCampoKyc('kyc-telefone-responsavel', dados.telefone);
    preencherCampoKyc('kyc-cpf', dados.cpf);
    preencherCampoKyc('kyc-cnpj', dados.cnpj);
    preencherCampoKyc('kyc-razao-social', dados.razao_social);
    preencherCampoKyc('kyc-nome-fantasia', dados.nome_fantasia);
    preencherCampoKyc('kyc-cep', dados.cep);
    preencherCampoKyc('kyc-rua', dados.rua);
    preencherCampoKyc('kyc-numero', dados.numero);
    preencherCampoKyc('kyc-bairro', dados.bairro);
    preencherCampoKyc('kyc-cidade', dados.cidade);
    preencherCampoKyc('kyc-uf', dados.uf);
  } catch (erro) {
    // 404 = loja sem cadastro de KYC ainda (ex: conta antiga/de teste).
    aviso.textContent = erro.message || 'Esta loja não tem cadastro de dados legais (KYC) registrado no sistema.';
    aviso.classList.remove('oculto');
  }
}

function configurarEntradaDadosLegais() {
  const botaoAbrir = document.getElementById('botao-ir-para-informacoes');
  if (!botaoAbrir) return;

  botaoAbrir.addEventListener('click', () => {
    document.querySelectorAll('.painel__menu-item[data-aba]').forEach(b => b.classList.remove('ativo'));
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    document.getElementById('aba-informacoes').classList.remove('oculto');

    const bloqueio = document.getElementById('informacoes-bloqueado');
    const conteudo = document.getElementById('informacoes-conteudo');

    if (!INFORMACOES_DESBLOQUEADO) {
      bloqueio.classList.remove('oculto');
      conteudo.classList.add('oculto');
      document.getElementById('informacoes-senha-input').value = '';
      document.getElementById('informacoes-senha-erro').classList.add('oculto');
    } else {
      bloqueio.classList.add('oculto');
      conteudo.classList.remove('oculto');
      carregarDadosLegaisLojista();
    }
  });

  document.getElementById('botao-voltar-config-de-informacoes').addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
    document.getElementById('aba-configuracoes').classList.remove('oculto');
  });

  document.getElementById('informacoes-senha-confirmar').addEventListener('click', async () => {
    const senha = document.getElementById('informacoes-senha-input').value;
    const erro = document.getElementById('informacoes-senha-erro');
    if (!senha) return;
    try {
      const resultado = await chamarApiAdmin('/estabelecimento/dados-legais/verificar-senha', { method: 'POST', body: { senha } });
      if (resultado.valido) {
        INFORMACOES_DESBLOQUEADO = true;
        document.getElementById('informacoes-bloqueado').classList.add('oculto');
        document.getElementById('informacoes-conteudo').classList.remove('oculto');
        await carregarDadosLegaisLojista();
      }
    } catch (e) {
      erro.textContent = e.message || 'Senha incorreta.';
      erro.classList.remove('oculto');
    }
  });

  // Aplica as mascaras de telefone/WhatsApp com hifen nos campos de contato
  // (o campo de telefone do responsavel/KYC e so-leitura, nao precisa).
  aplicarMascaraTelefoneComHifen(document.getElementById('campo-whatsapp'));
  aplicarMascaraTelefoneComHifen(document.getElementById('campo-telefone'));
}

document.addEventListener('DOMContentLoaded', () => {
  configurarEntradaDadosLegais();
});
