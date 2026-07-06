let DADOS = null;
let PRODUTO_SELECIONADO = null;
let QUANTIDADE_MODAL = 1;

const FONTES_GOOGLE = {
  'Poppins': 'Poppins:wght@400;600;700;800',
  'Playfair Display': 'Playfair+Display:wght@500;700;800',
  'Roboto': 'Roboto:wght@400;500;700;900',
  'Montserrat': 'Montserrat:wght@400;600;700;800',
  'Lato': 'Lato:wght@400;700;900'
};

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  if (!SLUG_ESTABELECIMENTO) {
    mostrarErro('Endereco de cardapio nao identificado. Verifique o link.');
    return;
  }

  try {
    DADOS = await buscarDadosEstabelecimento(SLUG_ESTABELECIMENTO);
    aplicarIdentidadeVisual(DADOS.estabelecimento);
    montarCabecalho(DADOS.estabelecimento);
    montarPromocoes(DADOS.promocoes, DADOS.produtos);
    montarCategorias(DADOS.categorias);
    montarProdutos(DADOS.categorias, DADOS.produtos);
    montarRodape(DADOS.estabelecimento);
    configurarEventosGlobais();

    document.getElementById('tela-carregando').classList.add('oculto');
    document.getElementById('app').classList.remove('oculto');
  } catch (erro) {
    mostrarErro(erro.message);
  }
}

function mostrarErro(mensagem) {
  document.getElementById('tela-carregando').classList.
