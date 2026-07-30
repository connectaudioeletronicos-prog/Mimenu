const Carrinho = (() => {
  const CHAVE = 'palatos_carrinho_itens';
  let itens = [];

  function carregarSalvo() {
    try {
      const salvo = sessionStorage.getItem(CHAVE);
      itens = salvo ? JSON.parse(salvo) : [];
    } catch {
      itens = [];
    }
  }

  function salvar() {
    try { sessionStorage.setItem(CHAVE, JSON.stringify(itens)); } catch {}
  }

  carregarSalvo();

  function adicionar(item) {
    const existente = itens.find(i => i.produto_id === item.produto_id && i.observacao === item.observacao);
    if (existente) {
      existente.quantidade += item.quantidade;
    } else {
      itens.push({ ...item });
    }
    salvar();
    atualizarContador();
  }

  function removerIndice(indice) {
    itens.splice(indice, 1);
    salvar();
    atualizarContador();
  }

  function alterarQuantidade(indice, delta) {
    itens[indice].quantidade += delta;
    if (itens[indice].quantidade <= 0) {
      removerIndice(indice);
      return;
    }
    salvar();
    atualizarContador();
  }

  function limpar() {
    itens = [];
    salvar();
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
