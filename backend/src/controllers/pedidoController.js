const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');
const { validarFormatoCep, validarCepViaCep } = require('../utils/geocoding');
const { validarTelefone } = require('../utils/validadores');
const { baixarEstoquePorVenda } = require('../utils/estoque');
const pagamentos = require('../utils/pagamentos');

// Monta a cobranca Pix pra um pedido ja inserido (status 'pendente') e
// grava o QR Code nele. Usado tanto pelo pedido publico (cliente) quanto
// pelo pedido manual (app do garcom / balcao). Se der erro, o pedido
// continua existindo como 'pendente' -- so nao vai ter QR pra mostrar,
// entao devolve o erro pra quem chamou decidir o que fazer (normalmente
// avisar o cliente/garcom que precisa tentar de novo ou usar outra forma
// de pagamento).
async function gerarCobrancaPixParaPedido(estabelecimento, pedido, emailPagador) {
  const notificationUrl = `${process.env.BACKEND_URL}/api/webhooks/mercadopago?estabelecimento_id=${estabelecimento.id}`;
  const cobranca = await pagamentos.criarCobrancaPix(estabelecimento, {
    valor: parseFloat(pedido.total),
    descricao: `Pedido Palatos #${pedido.id.slice(0, 8)}`,
    referenciaExterna: `pedido:${pedido.id}`,
    emailPagador: emailPagador || `pedido-${pedido.id.slice(0, 8)}@palatos.com.br`,
    notificationUrl
  });

  const atualizado = await query(
    `UPDATE pedidos SET mp_payment_id = $1, pix_qr_code = $2, pix_qr_code_base64 = $3, pix_expira_em = $4
     WHERE id = $5 RETURNING *`,
    [cobranca.idPagamento, cobranca.qrCode, cobranca.qrCodeBase64, cobranca.expiraEm, pedido.id]
  );
  return atualizado.rows[0];
}

async function criarPedido(req, res) {
  try {
    const { slug } = req.params;
    const {
      cliente_nome, cliente_telefone, cliente_endereco, cliente_cep,
      observacoes, forma_pagamento, taxa_entrega, gorjeta, tipo_pedido, itens, troco_para
    } = req.body;

    const tipoPedidoFinal = tipo_pedido === 'retirada' ? 'retirada' : 'entrega';
    const ehRetirada = tipoPedidoFinal === 'retirada';

    if (!cliente_nome || !cliente_telefone || !itens || itens.length === 0) {
      return res.status(400).json({ erro: 'Dados incompletos para criar pedido.' });
    }

    const nomePartes = cliente_nome.trim().split(/\s+/).filter(Boolean);
    if (nomePartes.length < 2) {
      return res.status(400).json({ erro: 'Informe nome e sobrenome completos.' });
    }

    if (!validarTelefone(cliente_telefone)) {
      return res.status(400).json({ erro: 'Telefone invalido. Use o formato (DDD) 000000000.' });
    }

    // Endereco e CEP so sao obrigatorios para pedido por entrega. Na
    // retirada, o cliente busca o pedido pronto no proprio estabelecimento.
    if (!ehRetirada) {
      if (!cliente_endereco || cliente_endereco.trim().length < 5) {
        return res.status(400).json({ erro: 'Informe o endereco de entrega.' });
      }

      if (!validarFormatoCep(cliente_cep)) {
        return res.status(400).json({ erro: 'CEP invalido. Use o formato 99999-999.' });
      }

      const validacaoCep = await validarCepViaCep(cliente_cep);
      if (!validacaoCep.valido) {
        return res.status(400).json({ erro: 'CEP nao encontrado. Verifique o CEP informado.' });
      }
    }

    const estRes = await query('SELECT id, ativo, mp_access_token, provedor_pagamento, tempo_preparo_min FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    if (!estRes.rows[0].ativo) return res.status(403).json({ erro: 'Estabelecimento indisponivel.' });
    const estabelecimentoId = estRes.rows[0].id;

    let subtotal = 0;
    const itensValidados = [];
    for (const item of itens) {
      const prodRes = await query('SELECT id, nome, preco, preco_promocional, disponivel FROM produtos WHERE id = $1 AND estabelecimento_id = $2', [item.produto_id, estabelecimentoId]);
      if (prodRes.rows.length === 0) return res.status(400).json({ erro: `Produto nao encontrado: ${item.produto_id}` });
      const produto = prodRes.rows[0];
      if (!produto.disponivel) return res.status(400).json({ erro: `Produto indisponivel: ${produto.nome}` });
      const preco = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco)
        ? parseFloat(produto.preco_promocional) : parseFloat(produto.preco);
      subtotal += preco * item.quantidade;
      itensValidados.push({ produto_id: produto.id, nome: produto.nome, quantidade: item.quantidade, preco_unitario: preco, observacao: item.observacao || '' });
    }

    // Retirada nunca tem taxa de entrega, mesmo que o cliente tenha mudado
    // de ideia depois de calcular uma (o front ja zera, isso e so garantia).
    const taxaEntregaFinal = ehRetirada ? 0 : parseFloat(taxa_entrega || 0);
    const gorjetaFinal = parseFloat(gorjeta || 0);
    const total = subtotal + taxaEntregaFinal + gorjetaFinal;

    // Troco: so faz sentido pra pagamento em dinheiro. Se o cliente informou
    // quanto vai pagar em especie, valida que cobre o total do pedido (senao
    // nao tem troco a calcular, e sim pedido a mais).
    let trocoParaFinal = null;
    if (forma_pagamento === 'dinheiro' && troco_para !== undefined && troco_para !== null && troco_para !== '') {
      trocoParaFinal = parseFloat(troco_para);
      if (isNaN(trocoParaFinal) || trocoParaFinal < total) {
        return res.status(400).json({ erro: 'O valor para troco deve ser maior ou igual ao total do pedido.' });
      }
    }

    // Canal da venda, independente do tipo_pedido ja existente -- usado
    // pelos relatorios/dashboard de estoque e vendas por canal.
    const canalVenda = ehRetirada ? 'retirada' : 'delivery';

    const pedidoRes = await query(
      `INSERT INTO pedidos (estabelecimento_id, cliente_nome, cliente_telefone, cliente_endereco, cliente_cep, observacoes, forma_pagamento, itens, subtotal, taxa_entrega, gorjeta, total, tipo_pedido, canal_venda, troco_para, status_pedido, status_pagamento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'novo','pendente') RETURNING *`,
      [estabelecimentoId, cliente_nome, cliente_telefone, ehRetirada ? null : cliente_endereco, ehRetirada ? null : cliente_cep, observacoes || '', forma_pagamento, JSON.stringify(itensValidados), subtotal, taxaEntregaFinal, gorjetaFinal, total, tipoPedidoFinal, canalVenda, trocoParaFinal]
    );
    const pedido = pedidoRes.rows[0];

    // Baixa automatica de estoque -- nunca derruba a criacao do pedido em
    // caso de erro (o proprio utilitario trata os erros internamente).
    baixarEstoquePorVenda(estabelecimentoId, itensValidados, { pedidoId: pedido.id, canalVenda })
      .catch(e => console.error('Erro na baixa automatica de estoque:', e.message));

    // Tenta salvar cliente automaticamente
    try {
      await query(
        `INSERT INTO clientes (estabelecimento_id, nome, telefone, endereco, cep)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (estabelecimento_id, telefone)
         DO UPDATE SET nome = EXCLUDED.nome,
                       endereco = COALESCE(EXCLUDED.endereco, clientes.endereco),
                       cep = COALESCE(EXCLUDED.cep, clientes.cep),
                       atualizado_em = NOW()`,
        [estabelecimentoId, cliente_nome, cliente_telefone, cliente_endereco || null, cliente_cep || null]
      );
    } catch (e) {
      console.warn('Aviso: nao foi possivel salvar cliente automaticamente:', e.message);
    }

    // Se for Pix, gera a cobranca de verdade (QR Code) agora. Se der
    // qualquer erro (chave nao configurada, Mercado Pago fora do ar etc.),
    // o pedido continua criado como 'pendente', so nao vai ter QR --
    // devolve o aviso pro cliente tentar outra forma de pagamento.
    let pedidoFinal = pedido;
    let pagamento = null;
    let avisoPagamento = null;
    if (forma_pagamento === 'pix') {
      try {
        pedidoFinal = await gerarCobrancaPixParaPedido(estRes.rows[0], pedido, null);
        pagamento = { qr_code: pedidoFinal.pix_qr_code, qr_code_base64: pedidoFinal.pix_qr_code_base64, expira_em: pedidoFinal.pix_expira_em };
      } catch (erroPix) {
        console.error('Erro ao gerar cobranca Pix:', erroPix.message);
        avisoPagamento = 'Nao foi possivel gerar o QR Code Pix agora. Tente outra forma de pagamento ou fale com a loja.';
      }
    }

    res.status(201).json({
      pedido: pedidoFinal,
      pagamento,
      aviso_pagamento: avisoPagamento,
      tempo_preparo_min: estRes.rows[0].tempo_preparo_min || 30
    });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ erro: 'Erro interno ao criar pedido.' });
  }
}

async function consultarStatusPedido(req, res) {
  try {
    const { slug, id } = req.params;
    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const resultado = await query(
      'SELECT id, status_pedido, status_pagamento FROM pedidos WHERE id = $1 AND estabelecimento_id = $2',
      [id, estRes.rows[0].id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido nao encontrado.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao consultar status.' });
  }
}

async function webhookMercadoPago(req, res) {
  // Responde 200 sempre e rapido -- o Mercado Pago reenvia (varias vezes)
  // se nao receber 200, entao qualquer erro interno e so logado, nunca
  // devolvido como erro pra ele.
  try {
    const estabelecimentoId = req.query.estabelecimento_id;
    const idPagamento = req.body?.data?.id || req.query['data.id'];
    const tipo = req.body?.type || req.query.type;

    if (!estabelecimentoId || !idPagamento || tipo !== 'payment') {
      return res.sendStatus(200);
    }

    const estRes = await query('SELECT id, mp_access_token, provedor_pagamento FROM estabelecimentos WHERE id = $1', [estabelecimentoId]);
    if (estRes.rows.length === 0 || !estRes.rows[0].mp_access_token) return res.sendStatus(200);

    // Nunca confia no corpo do webhook por si so -- confirma direto na API
    // do Mercado Pago antes de marcar qualquer coisa como paga.
    const confirmado = await pagamentos.consultarPagamento(estRes.rows[0], idPagamento);
    if (!confirmado.referenciaExterna) return res.sendStatus(200);

    // A referencia externa vem prefixada ('pedido:xxx' ou 'comanda:xxx')
    // pra esse webhook saber em qual tabela procurar e atualizar.
    const [tipoReferencia, referenciaId] = confirmado.referenciaExterna.split(':');

    if (tipoReferencia === 'comanda') {
      if (confirmado.status === 'pago') {
        await query(
          `UPDATE comandas SET status = 'fechada', status_pagamento = 'pago', fechada_em = NOW()
           WHERE id = $1 AND estabelecimento_id = $2 AND status_pagamento <> 'pago'`,
          [referenciaId, estabelecimentoId]
        );
      } else if (confirmado.status === 'recusado') {
        await query(
          `UPDATE comandas SET status_pagamento = 'recusado' WHERE id = $1 AND estabelecimento_id = $2 AND status_pagamento = 'pendente'`,
          [referenciaId, estabelecimentoId]
        );
      }
      return res.sendStatus(200);
    }

    if (confirmado.status === 'pago') {
      await query(
        `UPDATE pedidos SET status_pagamento = 'pago',
                             status_pedido = CASE WHEN status_pedido = 'novo' THEN 'preparando' ELSE status_pedido END
         WHERE id = $1 AND estabelecimento_id = $2 AND status_pagamento <> 'pago'`,
        [referenciaId, estabelecimentoId]
      );
    } else if (confirmado.status === 'recusado') {
      await query(
        `UPDATE pedidos SET status_pagamento = 'recusado' WHERE id = $1 AND estabelecimento_id = $2 AND status_pagamento = 'pendente'`,
        [referenciaId, estabelecimentoId]
      );
    }
    // status 'pendente' (ainda aguardando): nao faz nada, so espera o proximo aviso.

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar webhook do Mercado Pago:', error.message);
    res.sendStatus(200);
  }
}

async function listarPedidosAdmin(req, res) {
  try {
    const { status } = req.query;
    let sql = `SELECT * FROM pedidos WHERE estabelecimento_id = $1`;
    const params = [req.estabelecimentoId];

    // Cada extensao (cozinha, entregador) so enxerga o que precisa:
    // - cozinha: so os pedidos ja aceitos (preparando) e os que ela mesma
    //   acabou de marcar como pronto, sem valores (so produto/descricao).
    // - entregador: so os pedidos atribuidos a ele.
    if (req.cargo === 'cozinha') {
      params.push(['preparando', 'pronto']);
      sql += ` AND status_pedido = ANY($${params.length}::text[])`;
    } else if (req.cargo === 'entregador') {
      params.push(req.funcionarioId);
      sql += ` AND entregador_id = $${params.length}`;
    }

    if (status) { params.push(status); sql += ` AND status_pedido = $${params.length}`; }
    sql += ` ORDER BY criado_em DESC LIMIT 100`;
    const resultado = await query(sql, params);

    const podeVerValoresConcluidos = req.cargo === 'proprietario' || (req.permissoes || []).includes('ver_valores_concluidos');
    const finalizados = ['entregue', 'cancelado'];
    const ehCozinha = req.cargo === 'cozinha';

    const pedidos = resultado.rows.map(p => {
      // App da cozinha: so visualizacao de produtos/descricao, sem valor
      // e sem dados de cobranca/contato do cliente.
      if (ehCozinha) {
        return { ...p, subtotal: null, total: null, taxa_entrega: null, gorjeta: null, forma_pagamento: null, cliente_telefone: null, cliente_endereco: null };
      }
      if (!podeVerValoresConcluidos && finalizados.includes(p.status_pedido)) {
        return { ...p, subtotal: null, total: null, taxa_entrega: null, itens: null };
      }
      return p;
    });

    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar pedidos.' });
  }
}

// Retorna a quantidade de pedidos por status, pra mostrar nos botoes de
// filtro (Todos, Novos, Preparando, Saiu p/ entrega, Entregues, Cancelados).
async function contarPedidosAdmin(req, res) {
  try {
    const resultado = await query(
      `SELECT status_pedido, COUNT(*)::int AS total
       FROM pedidos WHERE estabelecimento_id = $1
       GROUP BY status_pedido`,
      [req.estabelecimentoId]
    );

    const contagem = { todos: 0, novo: 0, preparando: 0, pronto: 0, saiu_entrega: 0, entregue: 0, cancelado: 0 };
    resultado.rows.forEach(linha => {
      contagem[linha.status_pedido] = linha.total;
      contagem.todos += linha.total;
    });

    res.json(contagem);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao contar pedidos.' });
  }
}

// Escolhe o proximo entregador da fila pra OFERECER um pedido que acabou de
// ficar pronto (ou que teve a oferta recusada por outro entregador). Regra
// absoluta: sempre respeita a ordem de chegada (quem esta ha mais tempo
// esperando/disponivel entra primeiro), um de cada vez. Fica de fora da fila
// quem: estiver inativo, indisponivel, ja estiver com uma entrega em
// andamento, nao tiver batido o ponto (QR) hoje, ou ja tiver recusado esse
// mesmo pedido especificamente.
async function proximoEntregadorElegivel(estabelecimentoId, jaRecusaram) {
  const idsRecusaram = Array.isArray(jaRecusaram) ? jaRecusaram : [];
  const resultado = await query(
    `SELECT f.id, f.nome
     FROM funcionarios f
     WHERE f.estabelecimento_id = $1 AND f.cargo = 'entregador' AND f.ativo = true AND f.disponivel_entrega = true
       AND f.ultimo_checkin_data = CURRENT_DATE
       AND NOT (f.id::text = ANY($2::text[]))
       AND NOT EXISTS (
         SELECT 1 FROM pedidos p WHERE p.entregador_id = f.id AND p.status_pedido = 'saiu_entrega'
       )
     ORDER BY f.ultima_fila_em ASC NULLS FIRST, f.criado_em ASC
     LIMIT 1`,
    [estabelecimentoId, idsRecusaram]
  );
  return resultado.rows[0] || null;
}

// Tenta oferecer o pedido (que ja esta "pronto", sem entregador confirmado)
// ao proximo entregador elegivel. Chamado: (1) assim que o pedido fica
// pronto; (2) quando um entregador recusa (oferece pro proximo); (3) quando
// um entregador bate o ponto ou fica disponivel de novo (pode "puxar" um
// pedido que estava esperando fila vazia).
async function tentarOfertarPedido(estabelecimentoId, pedidoId) {
  const pedidoRes = await query(
    `SELECT id, entregadores_recusaram FROM pedidos
     WHERE id = $1 AND estabelecimento_id = $2 AND status_pedido = 'pronto' AND status_convite_entrega IS NULL
       AND tipo_pedido = 'entrega'`,
    [pedidoId, estabelecimentoId]
  );
  if (pedidoRes.rows.length === 0) return null;

  const entregador = await proximoEntregadorElegivel(estabelecimentoId, pedidoRes.rows[0].entregadores_recusaram || []);
  if (!entregador) return null;

  const atualizado = await query(
    `UPDATE pedidos SET entregador_id = $1, entregador_nome = $2, status_convite_entrega = 'pendente'
     WHERE id = $3 AND estabelecimento_id = $4 AND status_pedido = 'pronto' AND status_convite_entrega IS NULL
     RETURNING *`,
    [entregador.id, entregador.nome, pedidoId, estabelecimentoId]
  );
  return atualizado.rows[0] || null;
}

// Varre todos os pedidos "pronto" sem convite em aberto de um estabelecimento
// e tenta ofertar cada um. Usado quando um entregador bate o ponto ou volta
// a ficar disponivel, pra nao deixar pedido parado esperando so por causa
// da ordem em que os eventos aconteceram.
async function tentarOfertarPedidosPendentes(estabelecimentoId) {
  const pendentes = await query(
    `SELECT id FROM pedidos WHERE estabelecimento_id = $1 AND status_pedido = 'pronto' AND status_convite_entrega IS NULL
       AND tipo_pedido = 'entrega'
     ORDER BY horario_pronto ASC NULLS LAST, criado_em ASC`,
    [estabelecimentoId]
  );
  for (const p of pendentes.rows) {
    // eslint-disable-next-line no-await-in-loop
    const ofertado = await tentarOfertarPedido(estabelecimentoId, p.id);
    if (!ofertado) break; // sem entregador livre; os proximos tambem nao vao ter
  }
}

// Posicao do entregador logado na fila de espera (mesma ordem/regras usadas
// pra oferecer pedidos automaticamente) -- pra tela "Voce esta na fila"
// mostrar "ha N pessoas na sua frente" / "voce e o proximo".
async function posicaoNaFila(req, res) {
  try {
    const resultado = await query(
      `SELECT f.id
       FROM funcionarios f
       WHERE f.estabelecimento_id = $1 AND f.cargo = 'entregador' AND f.ativo = true AND f.disponivel_entrega = true
         AND f.ultimo_checkin_data = CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM pedidos p WHERE p.entregador_id = f.id AND p.status_pedido = 'saiu_entrega'
         )
       ORDER BY f.ultima_fila_em ASC NULLS FIRST, f.criado_em ASC`,
      [req.estabelecimentoId]
    );
    const ids = resultado.rows.map(r => r.id);
    const indice = ids.indexOf(req.funcionarioId);
    res.json({
      na_fila: indice !== -1,
      posicao: indice === -1 ? null : indice + 1,
      total_na_fila: ids.length
    });
  } catch (error) {
    console.error('Erro ao obter posicao na fila:', error);
    res.status(500).json({ erro: 'Erro ao obter posicao na fila.' });
  }
}
async function atualizarStatusPedido(req, res) {
  try {
    const { id } = req.params;
    const { status_pedido } = req.body;

    const statusValidos = ['novo', 'preparando', 'pronto', 'saiu_entrega', 'entregue', 'cancelado'];
    if (!statusValidos.includes(status_pedido)) return res.status(400).json({ erro: 'Status invalido.' });

    const temPermissao = (chave) => req.cargo === 'proprietario' || (req.permissoes || []).includes(chave);

    if (status_pedido === 'cancelado' && !temPermissao('cancelar_pedidos')) {
      return res.status(403).json({ erro: 'Voce nao tem permissao para cancelar pedidos.' });
    }
    if (status_pedido !== 'cancelado' && !temPermissao('mudar_status_pedidos')) {
      return res.status(403).json({ erro: 'Voce nao tem permissao para mudar o status do pedido.' });
    }

    const pedidoAtual = await query('SELECT status_pedido, entregador_id FROM pedidos WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (pedidoAtual.rows.length === 0) return res.status(404).json({ erro: 'Pedido nao encontrado.' });

    const statusFinal = ['entregue', 'cancelado'];
    if (statusFinal.includes(pedidoAtual.rows[0].status_pedido)) {
      return res.status(400).json({ erro: 'Pedidos finalizados ou cancelados nao podem ser alterados.' });
    }

    // Regra geral: cada extensao (cozinha, entregador) so se comunica com o
    // administrador -- aqui, isso significa que cada uma so pode dar
    // exatamente o proximo passo que e da sua responsabilidade, mesmo que
    // tenha a permissao 'mudar_status_pedidos' marcada.
    if (req.cargo === 'cozinha') {
      if (status_pedido !== 'pronto') {
        return res.status(403).json({ erro: 'A cozinha so pode marcar o pedido como pronto.' });
      }
      if (pedidoAtual.rows[0].status_pedido !== 'preparando') {
        return res.status(400).json({ erro: 'Esse pedido ainda nao esta em preparo.' });
      }
    }

    if (req.cargo === 'entregador') {
      // Entregador nao usa mais esse endpoint (ele tem os proprios:
      // aceitar/recusar/encerrar em /funcionarios/entregas/*).
      return res.status(403).json({ erro: 'Use a tela de entregas do app do entregador.' });
    }

    // "saiu_entrega" agora so acontece quando o proprio entregador ACEITA a
    // oferta (PUT /funcionarios/entregas/:id/aceitar). O admin/cozinha nao
    // pode mais forcar essa transicao manualmente por aqui.
    if (status_pedido === 'saiu_entrega') {
      return res.status(400).json({
        erro: 'Esse status agora e definido automaticamente quando o entregador aceita a entrega. Marque o pedido como "pronto" que o sistema oferece a fila sozinho.'
      });
    }

    // Impede voltar para um status anterior: o pedido so pode avancar na
    // sequencia (novo -> preparando -> pronto -> saiu_entrega -> entregue),
    // ou ser cancelado a qualquer momento antes de ser entregue.
    const ORDEM_STATUS = ['novo', 'preparando', 'pronto', 'saiu_entrega', 'entregue'];
    if (status_pedido !== 'cancelado') {
      const indiceAtual = ORDEM_STATUS.indexOf(pedidoAtual.rows[0].status_pedido);
      const indiceNovo = ORDEM_STATUS.indexOf(status_pedido);
      if (indiceNovo <= indiceAtual) {
        return res.status(400).json({ erro: 'Nao e possivel voltar um pedido para um status anterior.' });
      }
      if (indiceNovo > indiceAtual + 1) {
        return res.status(400).json({ erro: 'Nao e possivel pular etapas do pedido.' });
      }
    }

    if (status_pedido === 'pronto') {
      await query(
        'UPDATE pedidos SET status_pedido = $1, horario_pronto = NOW() WHERE id = $2 AND estabelecimento_id = $3',
        [status_pedido, id, req.estabelecimentoId]
      );
      // Assim que fica pronto, ja tenta oferecer pro proximo entregador da
      // fila (que so aceitando de fato vira "saiu_entrega"). Se ninguem
      // estiver disponivel agora, o pedido fica esperando em "pronto" e sera
      // ofertado automaticamente quando algum entregador bater o ponto ou
      // ficar livre de novo.
      await tentarOfertarPedido(req.estabelecimentoId, id);
    } else {
      await query('UPDATE pedidos SET status_pedido = $1 WHERE id = $2 AND estabelecimento_id = $3', [status_pedido, id, req.estabelecimentoId]);
    }

    const final = await query('SELECT * FROM pedidos WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    res.json(final.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    res.status(500).json({ erro: 'Erro ao atualizar status.' });
  }
}

// Corrige valores de um pedido ja finalizado (entregue/cancelado).
// So acessivel a quem tem a permissao 'corrigir_valores_concluidos' (checado na rota).
// Toda correcao fica registrada na auditoria, com o valor antigo e o novo.
async function corrigirValoresPedido(req, res) {
  try {
    const { id } = req.params;
    const { subtotal, taxa_entrega, total, motivo } = req.body;

    const anterior = await query('SELECT * FROM pedidos WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Pedido nao encontrado.' });

    if (total === undefined || isNaN(parseFloat(total))) {
      return res.status(400).json({ erro: 'Informe o novo valor total do pedido.' });
    }

    const resultado = await query(
      `UPDATE pedidos SET
        subtotal = COALESCE($1, subtotal),
        taxa_entrega = COALESCE($2, taxa_entrega),
        total = $3
       WHERE id = $4 AND estabelecimento_id = $5 RETURNING *`,
      [subtotal, taxa_entrega, parseFloat(total), id, req.estabelecimentoId]
    );

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(
      req.estabelecimentoId, req.funcionarioId, req.funcionarioNome || 'Proprietario',
      'CORRIGIR_VALORES_PEDIDO', 'pedidos', id,
      { subtotal: anterior.rows[0].subtotal, taxa_entrega: anterior.rows[0].taxa_entrega, total: anterior.rows[0].total },
      { subtotal: resultado.rows[0].subtotal, taxa_entrega: resultado.rows[0].taxa_entrega, total: resultado.rows[0].total, motivo: motivo || null },
      req.ip
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao corrigir valores do pedido:', error);
    res.status(500).json({ erro: 'Erro interno ao corrigir valores do pedido.' });
  }
}

async function listarPedidosCliente(req, res) {
  try {
    const { slug, telefone } = req.params;
    const estRes = await query('SELECT id, ativo FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    const estabelecimentoId = estRes.rows[0].id;
    if (!estRes.rows[0].ativo) return res.status(403).json({ erro: 'Este estabelecimento esta indisponivel.' });

    const telefoneLimpo = (telefone || '').replace(/\D/g, '');
    const sql = `
      SELECT id, cliente_nome, cliente_telefone, status_pedido, status_pagamento, total, criado_em
      FROM pedidos
      WHERE estabelecimento_id = $1
        AND regexp_replace(cliente_telefone, '\\D', '', 'g') LIKE $2
      ORDER BY criado_em DESC
      LIMIT 100
    `;
    const resultado = await query(sql, [estabelecimentoId, `%${telefoneLimpo}%`]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar pedidos por telefone:', error);
    res.status(500).json({ erro: 'Erro interno ao listar pedidos do cliente.' });
  }
}

// Caixa geral: resumo dos valores das entregas concluidas.
// Restrito a quem tem a permissao 'ver_caixa_geral' (checado na rota).
// Hoje so existe pedido do tipo "entrega". A coluna tipo_pedido ja
// deixa o caminho pronto para quando o pedido de balcao existir --
// nesse dia, e so tirar o filtro abaixo (ou somar os dois tipos
// separadamente) sem precisar mexer no resto do controller.
async function obterCaixaGeral(req, res) {
  try {
    const { data_inicio, data_fim } = req.query;

    let sql = `
      SELECT id, cliente_nome, subtotal, taxa_entrega, total, forma_pagamento,
             tipo_pedido, criado_em, atualizado_em
      FROM pedidos
      WHERE estabelecimento_id = $1 AND status_pedido = 'entregue'
    `;
    const params = [req.estabelecimentoId];

    if (data_inicio) { params.push(data_inicio); sql += ` AND criado_em >= $${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND criado_em < ($${params.length}::date + INTERVAL '1 day')`; }

    sql += ' ORDER BY criado_em DESC LIMIT 500';

    const resultado = await query(sql, params);

    const totalGeral = resultado.rows.reduce((soma, p) => soma + parseFloat(p.total || 0), 0);
    const totalPorTipo = resultado.rows.reduce((acc, p) => {
      const tipo = p.tipo_pedido || 'entrega';
      acc[tipo] = (acc[tipo] || 0) + parseFloat(p.total || 0);
      return acc;
    }, {});

    res.json({
      quantidade: resultado.rows.length,
      total_geral: totalGeral,
      total_por_tipo: totalPorTipo,
      pedidos: resultado.rows
    });
  } catch (error) {
    console.error('Erro ao obter caixa geral:', error);
    res.status(500).json({ erro: 'Erro interno ao obter caixa geral.' });
  }
}

// Pedido lancado manualmente por quem tem a permissao 'criar_pedidos'
// (garcom, caixa, colaborador, administrador...) -- pedido feito
// presencialmente (balcao/mesa), diferente do pedido publico que o
// cliente faz sozinho pelo cardapio. Como quem esta lancando ja "aceitou"
// o pedido na hora, ele entra direto como "preparando" (pula o "novo"),
// indo direto pra cozinha.
async function criarPedidoManual(req, res) {
  try {
    const { cliente_nome, itens, forma_pagamento, observacoes, enviar_entrega, canal_venda, lancado_por_funcionario_id, lancado_por_funcionario_nome } = req.body;

    if (!cliente_nome || !cliente_nome.trim()) {
      return res.status(400).json({ erro: 'Informe o nome do cliente ou a identificacao da mesa.' });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: 'Adicione pelo menos um item ao pedido.' });
    }
    const formasValidas = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito'];
    if (!formasValidas.includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Forma de pagamento invalida.' });
    }

    // Preco sempre recalculado a partir do banco (nunca confia no valor
    // que vier do front), igual ao pedido publico.
    let subtotal = 0;
    const itensValidados = [];
    for (const item of itens) {
      const quantidade = parseInt(item.quantidade, 10);
      if (!item.produto_id || !quantidade || quantidade <= 0) {
        return res.status(400).json({ erro: 'Item de pedido invalido.' });
      }
      const prodRes = await query(
        'SELECT id, nome, preco, preco_promocional, disponivel FROM produtos WHERE id = $1 AND estabelecimento_id = $2',
        [item.produto_id, req.estabelecimentoId]
      );
      if (prodRes.rows.length === 0) return res.status(400).json({ erro: `Produto nao encontrado: ${item.produto_id}` });
      const produto = prodRes.rows[0];
      if (!produto.disponivel) return res.status(400).json({ erro: `Produto indisponivel: ${produto.nome}` });
      const preco = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco)
        ? parseFloat(produto.preco_promocional) : parseFloat(produto.preco);
      subtotal += preco * quantidade;
      itensValidados.push({ produto_id: produto.id, nome: produto.nome, preco, quantidade });
    }

    const total = subtotal;
    // Pedido de balcao/mesa nao entra na fila do entregador por padrao (nao
    // faz sentido pra quem ja esta comendo no local). O "gancho" opcional
    // enviar_entrega deixa o atendente marcar que esse pedido especifico
    // precisa ser entregue mesmo assim (ex: veio por WhatsApp).
    const tipoPedido = enviar_entrega === true ? 'entrega' : 'balcao';
    // canal_venda: o app do garcom manda 'mesa' explicitamente. Sem isso,
    // cai como 'balcao' (ou 'delivery' se marcado enviar_entrega). Aceita
    // apenas os 4 valores validos por seguranca.
    const canaisValidos = ['delivery', 'retirada', 'balcao', 'mesa'];
    const canalVenda = enviar_entrega === true
      ? 'delivery'
      : (canaisValidos.includes(canal_venda) ? canal_venda : 'balcao');

    // Pix precisa esperar a confirmacao de pagamento antes de ir pra
    // cozinha: entra como 'novo' + 'pendente' e so vira 'preparando' + 'pago'
    // quando o webhook do Mercado Pago confirmar. Dinheiro/cartao continuam
    // como sempre -- o atendente ja cobrou na hora, entao ja nasce pago.
    const ehPix = forma_pagamento === 'pix';
    const statusPagamentoInicial = ehPix ? 'pendente' : 'pago';
    const statusPedidoInicial = ehPix ? 'novo' : 'preparando';

    // Quem lancou esse pedido manualmente: se veio do gate de Atendimento
    // (Caixa/Gerente/Administrador autenticado com a PROPRIA senha), usa
    // esse id -- validado de novo aqui (nunca confia soh no que o front
    // manda). Se nao veio (ex: chamada autenticada direto como
    // funcionario), cai no req.funcionarioId de sempre.
    let lancadoPorId = null;
    let lancadoPorNome = null;
    if (lancado_por_funcionario_id) {
      const flr = await query(
        `SELECT id, nome, cargo FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2 AND ativo = true`,
        [lancado_por_funcionario_id, req.estabelecimentoId]
      );
      if (flr.rows.length > 0 && ['caixa', 'gerente', 'administrador'].includes(flr.rows[0].cargo)) {
        lancadoPorId = flr.rows[0].id;
        lancadoPorNome = flr.rows[0].nome;
      }
    } else if (req.funcionarioId) {
      lancadoPorId = req.funcionarioId;
      lancadoPorNome = req.funcionarioNome || lancado_por_funcionario_nome || null;
    }

    const resultado = await query(
      `INSERT INTO pedidos (
        estabelecimento_id, cliente_nome, cliente_telefone, itens, subtotal, taxa_entrega,
        gorjeta, total, forma_pagamento, status_pagamento, status_pedido, tipo_pedido, canal_venda, observacoes,
        lancado_por_funcionario_id, lancado_por_funcionario_nome
      ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [req.estabelecimentoId, cliente_nome.trim(), '(balcao)', JSON.stringify(itensValidados), subtotal, total, forma_pagamento, statusPagamentoInicial, statusPedidoInicial, tipoPedido, canalVenda, observacoes || null, lancadoPorId, lancadoPorNome]
    );
    let pedido = resultado.rows[0];

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(req.estabelecimentoId, lancadoPorId, lancadoPorNome, 'CRIAR_PEDIDO_MANUAL', 'pedidos', pedido.id, null, pedido, req.ip);

    // Baixa de estoque acontece na hora mesmo pra pedido Pix pendente --
    // o produto ja saiu da cozinha reservado pra essa mesa. Se o pagamento
    // for recusado depois, quem resolve isso e o fluxo de cancelamento
    // manual (nao reestorna estoque sozinho aqui).
    baixarEstoquePorVenda(req.estabelecimentoId, itensValidados, { pedidoId: pedido.id, funcionarioId: req.funcionarioId, canalVenda })
      .catch(e => console.error('Erro na baixa automatica de estoque:', e.message));

    let pagamento = null;
    let avisoPagamento = null;
    if (ehPix) {
      try {
        const estRes = await query('SELECT id, mp_access_token, provedor_pagamento FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
        pedido = await gerarCobrancaPixParaPedido(estRes.rows[0], pedido, null);
        pagamento = { qr_code: pedido.pix_qr_code, qr_code_base64: pedido.pix_qr_code_base64, expira_em: pedido.pix_expira_em };
      } catch (erroPix) {
        console.error('Erro ao gerar cobranca Pix (pedido manual):', erroPix.message);
        avisoPagamento = 'Nao foi possivel gerar o QR Code Pix agora. Escolha outra forma de pagamento.';
      }
    }

    res.status(201).json({ pedido, pagamento, aviso_pagamento: avisoPagamento });
  } catch (error) {
    console.error('Erro ao criar pedido manual:', error);
    res.status(500).json({ erro: 'Erro ao criar pedido.' });
  }
}


// ===================================================================
// App do entregador (rotas proprias, fora do painel administrativo).
// ===================================================================

// Pedido que esta oferecido pra esse entregador agora, aguardando ele
// aceitar ou recusar. So um por vez (o proximo so e ofertado depois que
// esse for resolvido).
async function listarEntregaPendente(req, res) {
  try {
    const resultado = await query(
      `SELECT id, cliente_nome, cliente_telefone, cliente_endereco, total, forma_pagamento, troco_para, criado_em
       FROM pedidos
       WHERE estabelecimento_id = $1 AND entregador_id = $2 AND status_convite_entrega = 'pendente'
       ORDER BY horario_pronto ASC LIMIT 1`,
      [req.estabelecimentoId, req.funcionarioId]
    );
    res.json(resultado.rows[0] || null);
  } catch (error) {
    console.error('Erro ao buscar entrega pendente:', error);
    res.status(500).json({ erro: 'Erro ao buscar entrega pendente.' });
  }
}

// Todas as entregas em andamento (ja aceitas, ainda nao entregues) desse
// entregador -- pra tela de "rota em andamento". Normalmente e so uma (fila
// automatica so oferece 1 de cada vez).
async function entregasEmAndamento(req, res) {
  try {
    const resultado = await query(
      `SELECT * FROM pedidos
       WHERE estabelecimento_id = $1 AND entregador_id = $2 AND status_pedido = 'saiu_entrega'
       ORDER BY horario_saiu_entrega ASC`,
      [req.estabelecimentoId, req.funcionarioId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao buscar entregas em andamento:', error);
    res.status(500).json({ erro: 'Erro ao buscar entregas em andamento.' });
  }
}

// O admin/gestor atribui manualmente um pedido "pronto" a um entregador
// especifico -- inclusive um que ja esteja com outra entrega em andamento,
// formando uma rota com varias paradas pra esse entregador. Diferente da
// fila automatica (tentarOfertarPedido), essa atribuicao ignora a regra de
// "so quem esta livre" -- e uma decisao manual do gestor.
async function aceitarEntrega(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      `UPDATE pedidos SET status_pedido = 'saiu_entrega', status_convite_entrega = 'aceito', horario_saiu_entrega = NOW()
       WHERE id = $1 AND estabelecimento_id = $2 AND entregador_id = $3 AND status_convite_entrega = 'pendente'
       RETURNING *`,
      [id, req.estabelecimentoId, req.funcionarioId]
    );
    if (resultado.rows.length === 0) {
      return res.status(409).json({ erro: 'Esse convite de entrega ja nao esta mais disponivel.' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao aceitar entrega:', error);
    res.status(500).json({ erro: 'Erro ao aceitar entrega.' });
  }
}

async function recusarEntrega(req, res) {
  try {
    const { id } = req.params;
    const pedido = await query(
      `UPDATE pedidos SET
        entregador_id = NULL, entregador_nome = NULL, status_convite_entrega = NULL,
        entregadores_recusaram = COALESCE(entregadores_recusaram, '[]'::jsonb) || to_jsonb($1::text)
       WHERE id = $2 AND estabelecimento_id = $3 AND entregador_id = $4 AND status_convite_entrega = 'pendente'
       RETURNING id`,
      [req.funcionarioId, id, req.estabelecimentoId, req.funcionarioId]
    );
    if (pedido.rows.length === 0) {
      return res.status(409).json({ erro: 'Esse convite de entrega ja nao esta mais disponivel.' });
    }
    await tentarOfertarPedido(req.estabelecimentoId, id);
    res.json({ mensagem: 'Entrega recusada. Oferecida ao proximo entregador da fila.' });
  } catch (error) {
    console.error('Erro ao recusar entrega:', error);
    res.status(500).json({ erro: 'Erro ao recusar entrega.' });
  }
}

async function encerrarEntrega(req, res) {
  try {
    const { id } = req.params;
    const { distancia_km } = req.body;

    const plantaoAberto = await query(
      'SELECT id FROM entregador.plantoes_entregador WHERE funcionario_id = $1 AND fim IS NULL ORDER BY inicio DESC LIMIT 1',
      [req.funcionarioId]
    );
    const plantaoId = plantaoAberto.rows[0]?.id || null;

    const resultado = await query(
      `UPDATE pedidos SET status_pedido = 'entregue', horario_entregue = NOW(),
        distancia_km = COALESCE($1, distancia_km), plantao_id = COALESCE($2, plantao_id)
       WHERE id = $3 AND estabelecimento_id = $4 AND entregador_id = $5 AND status_pedido = 'saiu_entrega'
       RETURNING *`,
      [distancia_km !== undefined && distancia_km !== '' ? parseFloat(distancia_km) : null, plantaoId, id, req.estabelecimentoId, req.funcionarioId]
    );
    if (resultado.rows.length === 0) {
      return res.status(409).json({ erro: 'Essa entrega nao esta mais em andamento.' });
    }

    // Volta pro fim da fila (proxima oferta respeita ordem de chegada) e
    // conta a entrega concluida.
    await query(
      'UPDATE funcionarios SET total_entregas = total_entregas + 1, ultima_fila_em = NOW() WHERE id = $1',
      [req.funcionarioId]
    );

    // Ao ficar livre de novo, ja tenta puxar algum pedido "pronto" que
    // estivesse esperando fila vazia.
    await tentarOfertarPedidosPendentes(req.estabelecimentoId);

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao encerrar entrega:', error);
    res.status(500).json({ erro: 'Erro ao encerrar entrega.' });
  }
}

// Entregas concluidas pelo proprio entregador, com o detalhe de cada
// rota (horario, valor da entrega/comissao, forma de pagamento + troco
// quando for dinheiro, caixinha) -- usado na secao "Resumo de rotas" do
// menu lateral do app.
//
// "somenteHoje" controla o filtro de data. As duas rotas HTTP abaixo
// (minhasEntregasHoje / minhasEntregasTodas) sao so wrappers finos disso.
async function buscarMinhasEntregas(req, res, somenteHoje) {
  try {
    const funcionario = await query(
      'SELECT forma_pagamento_entrega, valor_por_entrega, valor_por_km FROM funcionarios WHERE id = $1',
      [req.funcionarioId]
    );
    const f = funcionario.rows[0] || {};

    const filtroData = somenteHoje ? `AND horario_entregue >= CURRENT_DATE` : '';
    // Historico "todas" tem um teto (200 mais recentes) so pra nao mandar
    // um payload gigante pro celular -- os TOTAIS (resumo) abaixo, esses
    // sim, somam tudo sem limite nenhum.
    const limite = somenteHoje ? '' : 'LIMIT 200';

    const resultado = await query(
      `SELECT id, cliente_nome, cliente_endereco, total, forma_pagamento, troco_para, gorjeta,
              distancia_km, horario_entregue
       FROM pedidos
       WHERE estabelecimento_id = $1 AND entregador_id = $2 AND status_pedido = 'entregue'
         ${filtroData}
       ORDER BY horario_entregue DESC
       ${limite}`,
      [req.estabelecimentoId, req.funcionarioId]
    );

    const calcularComissao = (p) => f.forma_pagamento_entrega === 'km'
      ? (Number(p.distancia_km) || 0) * (Number(f.valor_por_km) || 0)
      : (Number(f.valor_por_entrega) || 0);

    const entregas = resultado.rows.map((p) => {
      const comissao = calcularComissao(p);
      return {
        id: p.id,
        cliente_nome: p.cliente_nome,
        cliente_endereco: p.cliente_endereco,
        total_pedido: Number(p.total) || 0,
        forma_pagamento: p.forma_pagamento,
        troco_para: p.troco_para !== null ? Number(p.troco_para) : null,
        troco: p.troco_para !== null ? Number(p.troco_para) - Number(p.total) : null,
        gorjeta: Number(p.gorjeta) || 0,
        valor_rota: comissao,
        horario_entregue: p.horario_entregue
      };
    });

    // Resumo/totais: query separada, SEM limite nenhum -- soma TODAS as
    // entregas concluidas (nao so as 200 retornadas na lista acima), pra
    // "caixinha acumulada" e "valor total a receber" ficarem exatos mesmo
    // com anos de historico.
    const totaisRes = await query(
      `SELECT COUNT(*) AS total_entregas, COALESCE(SUM(gorjeta), 0) AS total_gorjetas,
              COALESCE(SUM(CASE WHEN $3 = 'km' THEN COALESCE(distancia_km, 0) * $4 ELSE $5 END), 0) AS total_comissao
       FROM pedidos
       WHERE estabelecimento_id = $1 AND entregador_id = $2 AND status_pedido = 'entregue' ${filtroData}`,
      [req.estabelecimentoId, req.funcionarioId, f.forma_pagamento_entrega, Number(f.valor_por_km) || 0, Number(f.valor_por_entrega) || 0]
    );
    const t = totaisRes.rows[0];
    const totalGorjetas = Number(t.total_gorjetas) || 0;
    const totalComissao = Number(t.total_comissao) || 0;

    res.json({
      entregas,
      resumo: {
        total_entregas: parseInt(t.total_entregas, 10) || 0,
        total_gorjetas: totalGorjetas,
        total_comissao: totalComissao,
        valor_total: totalComissao + totalGorjetas
      }
    });
  } catch (error) {
    console.error('Erro ao buscar minhas entregas:', error);
    res.status(500).json({ erro: 'Erro ao buscar entregas.' });
  }
}

async function minhasEntregasHoje(req, res) {
  return buscarMinhasEntregas(req, res, true);
}

async function minhasEntregasTodas(req, res) {
  return buscarMinhasEntregas(req, res, false);
}

module.exports = {
  criarPedido,
  criarPedidoManual,
  consultarStatusPedido,
  webhookMercadoPago,
  listarPedidosAdmin,
  contarPedidosAdmin,
  atualizarStatusPedido,
  corrigirValoresPedido,
  listarPedidosCliente,
  minhasEntregasHoje,
  minhasEntregasTodas,
  obterCaixaGeral,
  tentarOfertarPedidosPendentes,
  posicaoNaFila,
  listarEntregaPendente,
  entregasEmAndamento,
  aceitarEntrega,
  recusarEntrega,
  encerrarEntrega
};
