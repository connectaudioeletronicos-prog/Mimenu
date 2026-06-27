const Carrinho = (() => {
  let itens = [];

  function adicionar(item) {
    const existente = itens.find(i => i.produto_id === item.produto_id && i.observacao === item.observacao);
    if (existente) {
      existente.quantidade += item.quantidade;
    } else {
      itens.push({ ...item });
    }
    atualizarContador();
  }

  function removerIndice(indice) {
    itens.splice(indice, 1);
    atualizarContador();
  }

  function alterarQuantidade(indice, delta) {
    itens[indice].quantidade += delta;
    if (itens[indice].quantidade <= 0) {
      removerIndice(indice);
    }
    atualizarContador();
  }

  function limpar() {
    itens = [];
    atualizarContador();
  }

  function listar() {
    return itens;
  }

  function calcularSubtotal() {
    return itens.reduce((total, item) => total + (item.preco_unitario * item.quantidade), 0);
  }

  function contarItens() {
    return itens.reduce((total, item) => total + item.quantidade, 0);
  }

  function atualizarContador() {
    const contador = document.getElementById('contador-carrinho');
    const botao = document.getElementById('botao-carrinho');
    const total = contarItens();
    contador.textContent = total;
    botao.classList.toggle('oculto', total === 0);
  }

  return { adicionar, removerIndice, alterarQuantidade, limpar, listar, calcularSubtotal, contarItens, atualizarContador };
})();
