async function buscarDadosEstabelecimento(slug) {
  const resposta = await fetch(`${API_BASE_URL}/publico/${encodeURIComponent(slug)}`);
  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(dados.erro || 'Nao foi possivel carregar o cardapio.');
  }
  return dados;
}

async function enviarPedido(slug, dadosPedido) {
  const resposta = await fetch(`${API_BASE_URL}/publico/${encodeURIComponent(slug)}/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dadosPedido)
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(dados.erro || 'Nao foi possivel enviar o pedido.');
  }
  return dados;
}

async function consultarStatusPedido(slug, pedidoId) {
  const resposta = await fetch(`${API_BASE_URL}/publico/${encodeURIComponent(slug)}/pedidos/${pedidoId}/status`);
  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(dados.erro || 'Nao foi possivel consultar o pedido.');
  }
  return dados;
}

async function buscarPedidosCliente(slug, telefone) {
  const telefoneLimpo = telefone.replace(/\D/g, '');
  const resposta = await fetch(`${API_BASE_URL}/publico/${encodeURIComponent(slug)}/pedidos/cliente/${telefoneLimpo}`);
  if (!resposta.ok) throw new Error('Erro ao buscar pedidos');
  return resposta.json();
}

async function criarReserva(slug, dados) {
  const resposta = await fetch(`${API_BASE_URL}/publico/${encodeURIComponent(slug)}/reservas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  });
  const resultado = await resposta.json();
  if (!resposta.ok) throw new Error(resultado.erro || 'Nao foi possivel criar a reserva.');
  return resultado;
}
