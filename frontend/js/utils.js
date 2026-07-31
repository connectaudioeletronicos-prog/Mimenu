// ===================================================================
// Utilitarios compartilhados entre cardapio.js, cliente-auth.js,
// minha-conta.js e entregador.js. Antes cada arquivo tinha sua propria
// copia dessas funcoes (algumas ate com comportamento diferente entre
// si, como a mascara de telefone com/sem hifen). Carregar este arquivo
// ANTES dos demais scripts da pagina.
// ===================================================================

// --- Dados do cliente (prefill de nome/telefone/endereco no carrinho) ---
function obterDadosCliente() {
  try { return JSON.parse(localStorage.getItem('dados-cliente') || '{}'); }
  catch { return {}; }
}

function salvarDadosCliente(dados) {
  const atual = obterDadosCliente();
  localStorage.setItem('dados-cliente', JSON.stringify({ ...atual, ...dados }));
}

// --- Formatacao de moeda (com separador de milhar, ex: R$ 1.234,56) ---
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor) || 0);
}

// --- Mascara de telefone: (99) 999999999, SEM hifen (formato exigido pelo backend) ---
function aplicarMascaraTelefone(campo) {
  if (!campo || campo.dataset.mascara) return;
  campo.dataset.mascara = '1';
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 11);
    if (numeros.length === 0) this.value = '';
    else if (numeros.length <= 2) this.value = '(' + numeros;
    else this.value = '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2);
  });
}

// --- Mascara de CEP: 99999-999 ---
function aplicarMascaraCep(campo) {
  if (!campo || campo.dataset.mascara) return;
  campo.dataset.mascara = '1';
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 8);
    if (numeros.length <= 5) this.value = numeros;
    else this.value = numeros.substring(0, 5) + '-' + numeros.substring(5);
  });
}

// --- Monta link preservando o slug do estabelecimento na URL ---
// Depende de SLUG_ESTABELECIMENTO, definido em config.js (que deve ser
// carregado antes deste arquivo).
function linkComSlug(pagina) {
  return SLUG_ESTABELECIMENTO ? `${pagina}?slug=${encodeURIComponent(SLUG_ESTABELECIMENTO)}` : pagina;
}
