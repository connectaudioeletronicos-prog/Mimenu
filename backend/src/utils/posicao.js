// ===================================================================
// Validacao de posicao para carrossel/vitrine/caixa de texto.
// Aceita os 5 pontos fixos de sempre, OU "apos-categoria:<uuid>" para
// posicionar logo depois de uma categoria especifica (entre ela e a
// proxima), permitindo intercalar com as categorias do cardapio.
// ===================================================================
const POSICOES_FIXAS = ['topo', 'apos-cabecalho', 'apos-categorias', 'apos-produtos', 'antes-rodape'];
const REGEX_CATEGORIA = /^apos-categoria:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function posicaoValida(posicao) {
  if (!posicao) return false;
  return POSICOES_FIXAS.includes(posicao) || REGEX_CATEGORIA.test(posicao);
}

function normalizarPosicao(posicao, padrao = 'apos-cabecalho') {
  return posicaoValida(posicao) ? posicao : padrao;
}

module.exports = { POSICOES_FIXAS, posicaoValida, normalizarPosicao };
