const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');
const { validarFormatoCep, validarCepViaCep } = require('../utils/geocoding');
const { validarTelefone } = require('../utils/validadores');
const { baixarEstoquePorVenda } = require('../utils/estoque');
const { resolverIntervalo } = require('../utils/periodo');
const { agoraNoFuso } = require('../utils/horario');
const { proximoNumero } = require('../utils/numeracao');
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
      observacoes, forma_pagamento, taxa_entrega, gorjeta, tipo_pedido, itens, troco_para,
      token_cartao, parcelas_cartao, metodo_pagamento_id, email_pagador
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

    const { numero: numeroPedidoPublico, anoMes: anoMesPedidoPublico } = await proximoNumero(estabelecimentoId, 'pedido');
    const pedidoRes = await query(
      `INSERT INTO pedidos (estabelecimento_id, cliente_nome, cliente_telefone, cliente_endereco, cliente_cep, observacoes, forma_pagamento, itens, subtotal, taxa_entrega, gorjeta, total, tipo_pedido, canal_venda, troco_para, status_pedido, status_pagamento, numero_pedido, numero_pedido_ano_mes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'novo','pendente',$16,$17) RETURNING *`,
      [estabelecimentoId, cliente_nome, cliente_telefone, ehRetirada ? null : cliente_endereco, ehRetirada ? null : cliente_cep, observacoes || '', forma_pagamento, JSON.stringify(itensValidados), subtotal, taxaEntregaFinal, gorjetaFinal, total, tipoPedidoFinal, canalVenda, trocoParaFinal, numeroPedidoPublico, anoMesPedidoPublico]
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

    // Cartao no pedido do cliente e' SEMPRE cobrado online, na hora --
    // nunca depende do toggle "cartao_online_presencial" (esse e' so pro
    // atendimento presencial/comanda). Aqui o proprio cliente digitou o
    // cartao no formulario do Mercado Pago no navegador, que devolveu um
    // token seguro -- e' esse token que chega em token_cartao, nunca o
    // numero do cartao em si.
    if (forma_pagamento === 'cartao') {
      if (!token_cartao) {
        // Pedido ainda e' criado (fica pendente) pra nao perder a venda,
        // mas sem cobranca nenhuma -- o cliente precisa tentar de novo.
        avisoPagamento = 'Nao foi possivel processar o cartao (dados nao recebidos). Tente novamente ou escolha outra forma de pagamento.';
      } else {
        try {
          const notificationUrl = `${process.env.BACKEND_URL}/api/webhooks/mercadopago?estabelecimento_id=${estabelecimentoId}`;
          const cobranca = await pagamentos.criarCobrancaCartao(estRes.rows[0], {
            valor: total,
            descricao: `Pedido ${numeroPedidoPublico} - Palatos`,
            referenciaExterna: `pedido:${pedido.id}`,
            emailPagador: email_pagador || `pedido-${pedido.id.slice(0, 8)}@palatos.com.br`,
            token: token_cartao,
            parcelas: parcelas_cartao || 1,
            metodoPagamentoId: metodo_pagamento_id,
            notificationUrl
          });

          const atualizadoCartao = await query(
            `UPDATE pedidos SET status_pagamento = $1, mp_payment_id = $2 WHERE id = $3 RETURNING *`,
            [cobranca.status, cobranca.idPagamento, pedido.id]
          );
          pedidoFinal = atualizadoCartao.rows[0];

          if (cobranca.status !== 'pago') {
            avisoPagamento = 'Pagamento recusado pela operadora do cartao. Tente outro cartao ou escolha outra forma de pagamento.';
          }
        } catch (erroCartao) {
          console.error('Erro ao cobrar cartao no pedido:', erroCartao.message);
          avisoPagamento = 'Nao foi possivel processar o cartao agora. Tente novamente ou escolha outra forma de pagamento.';
        }
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

// Cliente avalia o entregador com 1 a 5 estrelas depois que o pedido foi
// entregue -- so a nota, sem comentario (conforme pedido). So aceita se o
// pedido ja estiver 'entregue' e ainda nao tiver sido avaliado, pra evitar
// nota repetida/fora de hora.
async function avaliarEntregador(req, res) {
  try {
    const { slug, id } = req.params;
    const { estrelas } = req.body;

    if (!Number.isInteger(estrelas) || estrelas < 1 || estrelas > 5) {
      return res.status(400).json({ erro: 'Avaliacao invalida (use de 1 a 5 estrelas).' });
    }

    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const resultado = await query(
      `UPDATE pedidos SET avaliacao_entregador = $1
       WHERE id = $2 AND estabelecimento_id = $3 AND status_pedido = 'entregue' AND avaliacao_entregador IS NULL
       RETURNING id`,
      [estrelas, id, estRes.rows[0].id]
    );

    if (resultado.rows.length === 0) {
      return res.status(400).json({ erro: 'Esse pedido nao pode ser avaliado (ja avaliado ou ainda nao entregue).' });
    }

    res.json({ mensagem: 'Obrigado pela avaliacao!' });
  } catch (error) {
    console.error('Erro ao avaliar entregador:', error);
    res.status(500).json({ erro: 'Erro ao registrar avaliacao.' });
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

// Historico completo de entregas -- TODOS os entregadores, TODOS os
// periodos, desde a primeira entrega da loja. Diferente de
// listarPedidosAdmin (que tem LIMIT 100 pra nao pesar o dia-a-dia), esse
// endpoint nao tem limite nenhum -- e' um relatorio, nao a tela de
// operacao do dia. So dados relevantes pro relatorio (entregador, data,
// codigo, endereco), sem valores sensiveis de pagamento.
async function listarHistoricoCompletoEntregas(req, res) {
  try {
    const resultado = await query(
      `SELECT id, numero_pedido, cliente_nome, cliente_endereco, entregador_nome,
              distancia_km, horario_entregue, criado_em
       FROM pedidos
       WHERE estabelecimento_id = $1 AND status_pedido = 'entregue' AND tipo_pedido != 'balcao'
       ORDER BY horario_entregue DESC NULLS LAST, criado_em DESC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar historico completo de entregas:', error);
    res.status(500).json({ erro: 'Erro ao listar historico completo de entregas.' });
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
    // Pedidos ativos (aguardando coleta ou em rota) vem sempre primeiro,
    // antes do corte do LIMIT -- sem isso, uma loja com bastante volume
    // podia ter um pedido ativo "empurrado" pra fora dos 100 mais recentes
    // por pedidos mais novos ja finalizados/cancelados, sumindo do painel
    // (Em andamento / Pendentes) mesmo estando de fato ativo na loja.
    sql += ` ORDER BY CASE WHEN status_pedido IN ('pronto', 'saiu_entrega') THEN 0 ELSE 1 END, criado_em DESC LIMIT 100`;
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
       AND f.ultimo_checkin_data = $3
       AND NOT (f.id::text = ANY($2::text[]))
       AND NOT EXISTS (
         -- BUGFIX: antes so excluia quem ja estava "saiu_entrega" (em rota).
         -- Isso deixava um entregador com um convite pendente (oferecido,
         -- ainda sem resposta) elegivel pra receber uma SEGUNDA oferta antes
         -- de aceitar/recusar a primeira. Se ele aceitasse a primeira e saisse
         -- em rota, a segunda ficava "grudada" nele -- travada esperando ele
         -- responder -- em vez de ser oferecida a outro entregador livre
         -- (ex: alguem parado, disponivel, na frente da fila). Agora tambem
         -- exclui quem tiver qualquer convite pendente em aberto.
         SELECT 1 FROM pedidos p WHERE p.entregador_id = f.id
           AND (p.status_pedido = 'saiu_entrega' OR p.status_convite_entrega = 'pendente')
       )
     ORDER BY f.ultima_fila_em ASC NULLS FIRST, f.criado_em ASC
     LIMIT 1`,
    [estabelecimentoId, idsRecusaram, agoraNoFuso().dataISO]
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
    // Autocorrecao: essa tela fica em polling (o entregador fica olhando
    // "voce esta na fila" esperando). Antes, um pedido so era ofertado no
    // exato instante em que ficava pronto -- se o entregador bateu o
    // ponto DEPOIS disso (ou a 1a tentativa nao achou ninguem por algum
    // motivo), o pedido ficava esquecido pra sempre, sem nenhum jeito de
    // se recuperar sozinho. Tentando de novo a cada consulta dessa tela,
    // qualquer pedido "pronto" sem convite em aberto acaba sendo puxado
    // assim que tiver entregador elegivel de novo.
    await tentarOfertarPedidosPendentes(req.estabelecimentoId);

    const resultado = await query(
      `SELECT f.id
       FROM funcionarios f
       WHERE f.estabelecimento_id = $1 AND f.cargo = 'entregador' AND f.ativo = true AND f.disponivel_entrega = true
         AND f.ultimo_checkin_data = $2
         AND NOT EXISTS (
           SELECT 1 FROM pedidos p WHERE p.entregador_id = f.id AND p.status_pedido = 'saiu_entrega'
         )
       ORDER BY f.ultima_fila_em ASC NULLS FIRST, f.criado_em ASC`,
      [req.estabelecimentoId, agoraNoFuso().dataISO]
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

    const pedidoAtual = await query('SELECT status_pedido, entregador_id, tipo_pedido FROM pedidos WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
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

    // Mesa/balcao/retirada nunca passam por "saiu para entrega" -- nao
    // tem entregador nenhum envolvido, o cliente ja esta na loja ou vai
    // buscar. Pra essas, a sequencia valida pula direto de "pronto" pra
    // "entregue". So pedido do tipo "entrega" mesmo segue passando por
    // saiu_entrega (e so automaticamente, quando o entregador aceita).
    const ORDEM_STATUS = pedidoAtual.rows[0].tipo_pedido === 'entrega'
      ? ['novo', 'preparando', 'pronto', 'saiu_entrega', 'entregue']
      : ['novo', 'preparando', 'pronto', 'entregue'];
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
      // Sempre tenta oferecer pro proximo entregador da fila -- a propria
      // funcao/consulta de tentarOfertarPedido() ja filtra por dentro
      // "AND tipo_pedido = 'entrega'" (nunca ofereceu balcao/mesa/retirada
      // pra ninguem), entao chamar sem essa trava extra aqui fora e
      // seguro E restaura o comportamento de antes -- que foi quebrado
      // quando alguem colocou esse "if" a mais.
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
      SELECT id, cliente_nome, cliente_telefone, status_pedido, status_pagamento, total, criado_em,
             tipo_pedido, entregador_nome, avaliacao_entregador
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
// Aceita tanto o filtro rapido por periodo (?intervalo=hoje|ontem|semana|
// mes_atual|trimestre|semestre|geral|personalizado) quanto o par de datas
// manual antigo (?data_inicio=...&data_fim=...), pra nao quebrar quem ja
// estava chamando do jeito velho. Sem nenhum dos dois, mostra TUDO (geral).
async function obterCaixaGeral(req, res) {
  try {
    const { intervalo, data_inicio, data_fim } = req.query;

    let inicio = null;
    let fim = null;
    if (intervalo) {
      ({ inicio, fim } = resolverIntervalo(intervalo, data_inicio, data_fim));
    } else if (data_inicio || data_fim) {
      ({ inicio, fim } = resolverIntervalo('personalizado', data_inicio, data_fim));
    } // sem nenhum parametro -> inicio/fim continuam null -> historico geral, sem limite de data

    let sql = `
      SELECT p.id, p.cliente_nome, p.subtotal, p.taxa_entrega, p.total, p.forma_pagamento,
             p.tipo_pedido, p.criado_em, p.atualizado_em, p.numero_pedido, p.canal_venda,
             -- Pedido de rodada de comanda (mesa) -- quem atendia a mesa e quem
             -- de fato fechou/recebeu o pagamento vem da propria comanda.
             COALESCE(cm.funcionario_nome, p.lancado_por_funcionario_nome) AS atendido_por_nome,
             COALESCE(cm.funcionario_cargo, p.lancado_por_funcionario_cargo) AS atendido_por_cargo,
             COALESCE(cm.fechada_por_funcionario_nome, p.lancado_por_funcionario_nome) AS recebido_por_nome,
             COALESCE(cm.fechada_por_funcionario_cargo, p.lancado_por_funcionario_cargo) AS recebido_por_cargo
      FROM pedidos p
      LEFT JOIN comandas cm ON cm.id = p.comanda_id
      WHERE p.estabelecimento_id = $1 AND p.status_pedido = 'entregue'
    `;
    const params = [req.estabelecimentoId];

    if (inicio) { params.push(inicio); sql += ` AND p.criado_em >= $${params.length}`; }
    if (fim) { params.push(fim); sql += ` AND p.criado_em <= $${params.length}`; }

    sql += ' ORDER BY p.criado_em DESC LIMIT 1000';

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
    let lancadoPorCargo = null;
    // Proprietario passou pelo gate com a PROPRIA senha: nao tem registro
    // em funcionarios, entao o front manda 'proprietario' em vez de um
    // UUID -- so aceito se a sessao do dashboard tambem for dele mesmo.
    if (lancado_por_funcionario_id === 'proprietario' && req.cargo === 'proprietario') {
      lancadoPorId = null;
      lancadoPorNome = 'Proprietário';
      lancadoPorCargo = 'proprietario';
    } else if (lancado_por_funcionario_id) {
      const flr = await query(
        `SELECT id, nome, cargo FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2 AND ativo = true`,
        [lancado_por_funcionario_id, req.estabelecimentoId]
      );
      if (flr.rows.length > 0 && ['caixa', 'gerente', 'administrador'].includes(flr.rows[0].cargo)) {
        lancadoPorId = flr.rows[0].id;
        lancadoPorNome = flr.rows[0].nome;
        lancadoPorCargo = flr.rows[0].cargo;
      }
    } else if (req.funcionarioId) {
      lancadoPorId = req.funcionarioId;
      lancadoPorNome = req.funcionarioNome || lancado_por_funcionario_nome || null;
      lancadoPorCargo = req.cargo;
    }

    const { numero: numeroPedidoManual, anoMes: anoMesPedidoManual } = await proximoNumero(req.estabelecimentoId, 'pedido');
    const resultado = await query(
      `INSERT INTO pedidos (
        estabelecimento_id, cliente_nome, cliente_telefone, itens, subtotal, taxa_entrega,
        gorjeta, total, forma_pagamento, status_pagamento, status_pedido, tipo_pedido, canal_venda, observacoes,
        lancado_por_funcionario_id, lancado_por_funcionario_nome, numero_pedido, numero_pedido_ano_mes, lancado_por_funcionario_cargo
      ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [req.estabelecimentoId, cliente_nome.trim(), '(balcao)', JSON.stringify(itensValidados), subtotal, total, forma_pagamento, statusPagamentoInicial, statusPedidoInicial, tipoPedido, canalVenda, observacoes || null, lancadoPorId, lancadoPorNome, numeroPedidoManual, anoMesPedidoManual, lancadoPorCargo]
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
    // Mesma autocorrecao do posicaoNaFila -- essa e a consulta que decide
    // se aparece a tela de oferta (toca o sininho) pro entregador, entao
    // faz sentido tentar de novo aqui tambem antes de checar.
    await tentarOfertarPedidosPendentes(req.estabelecimentoId);

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
      'SELECT valor_por_entrega, valor_por_km, km_incluido_no_fixo FROM funcionarios WHERE id = $1',
      [req.funcionarioId]
    );
    const f = funcionario.rows[0] || {};
    const valorFixo = Number(f.valor_por_entrega) || 0;
    const valorKm = Number(f.valor_por_km) || 0;
    const kmIncluido = Number(f.km_incluido_no_fixo) || 0;

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

    // Comissao = valor fixo por entrega + (valor por km * km ALEM DO
    // LIMITE incluso no fixo). Com limite=0 (padrao), isso vira soma
    // simples de km*valor_km desde o km 1 -- entao um so' calculo cobre
    // os 3 cenarios (so km / so fixo / fixo+km com ou sem limite).
    const calcularComissao = (p) => {
      const km = Number(p.distancia_km) || 0;
      const kmExcedente = Math.max(0, km - kmIncluido);
      return valorFixo + kmExcedente * valorKm;
    };

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

    // Resumo/totais: SUM direto no SQL usando GREATEST (mesma formula do
    // limite, sem precisar buscar todas as linhas em JS).
    const totaisRes = await query(
      `SELECT COUNT(*) AS total_entregas, COALESCE(SUM(gorjeta), 0) AS total_gorjetas,
              COALESCE(SUM($3 + GREATEST(0, COALESCE(distancia_km, 0) - $5) * $4), 0) AS total_comissao
       FROM pedidos
       WHERE estabelecimento_id = $1 AND entregador_id = $2 AND status_pedido = 'entregue' ${filtroData}`,
      [req.estabelecimentoId, req.funcionarioId, valorFixo, valorKm, kmIncluido]
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

// Converte o filtro de periodo (vindo da URL, sempre uma dessas 7 palavras)
// num pedaco de SQL seguro -- so aceita valores dessa lista fixa, nunca
// interpola o que vier da query string direto na consulta.
function condicaoPeriodo(coluna, periodo) {
  const mapa = {
    hoje: `${coluna} >= CURRENT_DATE`,
    semana: `${coluna} >= CURRENT_DATE - INTERVAL '7 days'`,
    mes: `${coluna} >= CURRENT_DATE - INTERVAL '30 days'`,
    '3meses': `${coluna} >= CURRENT_DATE - INTERVAL '90 days'`,
    '6meses': `${coluna} >= CURRENT_DATE - INTERVAL '180 days'`,
    ano: `${coluna} >= CURRENT_DATE - INTERVAL '365 days'`
  };
  return mapa[periodo] || null; // 'tudo' (ou qualquer valor desconhecido) = sem filtro
}

// Monta o objeto de endereco pronto pra exibicao (rua/numero/complemento/
// cep/bairro + versao completa em texto) a partir dos campos estruturados
// do pedido, com fallback pro texto livre antigo -- espelha exatamente a
// funcao "construirEndereco" do frontend do entregador (ver entregador.js),
// so que do lado do servidor, pra "Rotas realizadas" e "Resumo da rota".
function montarEnderecoPedido(p) {
  const temEstruturado = p.cliente_endereco_rua || p.cliente_endereco_cep || p.cliente_endereco_bairro;
  if (!temEstruturado) {
    return { logradouro: p.cliente_endereco || '-', numero: null, complemento: null, cep: null, bairro: null, completo: p.cliente_endereco || '-' };
  }
  const partes = [];
  if (p.cliente_endereco_rua) partes.push(p.cliente_endereco_numero ? `${p.cliente_endereco_rua}, ${p.cliente_endereco_numero}` : p.cliente_endereco_rua);
  if (p.cliente_endereco_complemento) partes.push(p.cliente_endereco_complemento);
  if (p.cliente_endereco_bairro) partes.push(p.cliente_endereco_bairro);
  if (p.cliente_endereco_cep) partes.push(`CEP ${p.cliente_endereco_cep}`);
  return {
    logradouro: p.cliente_endereco_rua || p.cliente_endereco || '-',
    numero: p.cliente_endereco_numero || null,
    complemento: p.cliente_endereco_complemento || null,
    cep: p.cliente_endereco_cep || null,
    bairro: p.cliente_endereco_bairro || null,
    completo: partes.join(' - ') || (p.cliente_endereco || '-')
  };
}

// Busca a comissao (valor_por_entrega/valor_por_km/km_incluido_no_fixo) do
// entregador -- mesma formula usada em toda a plataforma (calcularResumoPlantao
// no funcionarioController e buscarMinhasEntregas acima), pra bater 100% com
// o que o app do entregador e o painel do lojista mostram.
async function buscarConfigComissao(funcionarioId) {
  const r = await query(
    'SELECT valor_por_entrega, valor_por_km, km_incluido_no_fixo FROM funcionarios WHERE id = $1',
    [funcionarioId]
  );
  const f = r.rows[0] || {};
  return { valorFixo: Number(f.valor_por_entrega) || 0, valorKm: Number(f.valor_por_km) || 0, kmIncluido: Number(f.km_incluido_no_fixo) || 0 };
}

// Nucleo reaproveitavel de "Rotas realizadas": recebe o entregador explicito
// (em vez de tirar de req) pra poder ser chamado tanto pela rota do proprio
// entregador (app) quanto pela rota do admin (painel) -- os dois usam
// exatamente a mesma consulta e a mesma formula de comissao, entao o numero
// que aparece bate sempre nos dois lugares.
async function buscarHistoricoEntregasCore(estabelecimentoId, entregadorId, { periodo = 'hoje', limite = 5, antes } = {}) {
  const limiteFinal = Math.min(parseInt(limite, 10) || 5, 50);
  const condicoes = [`estabelecimento_id = $1`, `entregador_id = $2`, `status_pedido = 'entregue'`];
  const params = [estabelecimentoId, entregadorId];

  const condPeriodo = condicaoPeriodo('horario_entregue', periodo);
  if (condPeriodo) condicoes.push(condPeriodo);
  if (antes) { params.push(antes); condicoes.push(`horario_entregue < $${params.length}`); }

  params.push(limiteFinal + 1);
  const resultado = await query(
    `SELECT id, numero_pedido, horario_saiu_entrega, horario_entregue, distancia_km,
            total, forma_pagamento, troco_para,
            cliente_endereco, cliente_endereco_rua, cliente_endereco_numero,
            cliente_endereco_complemento, cliente_endereco_cep, cliente_endereco_bairro
     FROM pedidos WHERE ${condicoes.join(' AND ')}
     ORDER BY horario_entregue DESC LIMIT $${params.length}`,
    params
  );

  const temMais = resultado.rows.length > limiteFinal;
  const linhas = resultado.rows.slice(0, limiteFinal);
  const { valorFixo, valorKm, kmIncluido } = await buscarConfigComissao(entregadorId);

  const entregas = linhas.map(p => {
    const km = Number(p.distancia_km) || 0;
    const kmExcedente = Math.max(0, km - kmIncluido);
    return {
      id: p.id,
      numero_pedido: p.numero_pedido,
      horario_saiu_entrega: p.horario_saiu_entrega,
      horario_entregue: p.horario_entregue,
      valor_rota: valorFixo + kmExcedente * valorKm,
      // So faz sentido mostrar o valor do pedido quando o proprio entregador
      // recebeu o dinheiro na entrega -- se foi pago online/Pix, esse valor
      // nunca passou pela mao dele, entao fica null (frontend nao mostra).
      forma_pagamento: p.forma_pagamento,
      valor_pedido: p.forma_pagamento === 'dinheiro' ? Number(p.total) || 0 : null,
      troco_para: p.troco_para !== null ? Number(p.troco_para) : null,
      endereco: montarEnderecoPedido(p)
    };
  });

  // Totais do PERIODO INTEIRO selecionado (nao so da pagina atual) --
  // quantidade de rotas e valor total a pagar ao entregador nesse periodo.
  const condicoesTotais = [`estabelecimento_id = $1`, `entregador_id = $2`, `status_pedido = 'entregue'`];
  const paramsTotais = [estabelecimentoId, entregadorId];
  if (condPeriodo) condicoesTotais.push(condPeriodo);
  const totaisRes = await query(
    `SELECT COUNT(*) AS quantidade,
            COALESCE(SUM($3 + GREATEST(0, COALESCE(distancia_km, 0) - $4) * $5), 0) AS valor_total
     FROM pedidos WHERE ${condicoesTotais.join(' AND ')}`,
    [...paramsTotais, valorFixo, kmIncluido, valorKm]
  );
  const totaisPeriodo = {
    quantidade: parseInt(totaisRes.rows[0].quantidade, 10) || 0,
    valor_total: Number(totaisRes.rows[0].valor_total) || 0
  };

  return { entregas, proximo_cursor: linhas.length > 0 ? linhas[linhas.length - 1].horario_entregue : null, tem_mais: temMais, totais_periodo: totaisPeriodo };
}

// Nucleo reaproveitavel de "Caixinha recebida" -- mesma ideia: entregador
// explicito, usado pelo app (proprio entregador) e pelo admin (painel).
// Nunca inclui quem deu a caixinha, so valor e horario.
//
// Duas regras de negocio sobre a VISIBILIDADE da caixinha (nao mudam o
// valor, so quando/onde ela aparece):
//
// 1) "Periodo de seguranca" de 30 minutos: uma caixinha so fica visivel
//    (entra na lista e nos totais) 30 minutos depois de "programada", ou
//    seja, 30 minutos depois do horario_entregue do pedido. Antes disso
//    ela simplesmente nao aparece ainda -- nem na lista, nem no total.
// 2) Virada de dia: o "dia" que a caixinha CONTA pro resumo (hoje/mes) e o
//    dia em que ela libera (horario_entregue + 30min), em horario de
//    Brasilia -- nao o dia em que o pedido foi entregue. Isso so importa
//    perto da virada: expediente encerra sempre as 23:59, entao uma
//    entrega as 23:45 libera a caixinha as 00:15, ja no dia seguinte, e
//    ela conta pro resumo do dia seguinte (mesmo tendo sido "lancada" no
//    dia anterior). O item da lista continua mostrando horario_entregue
//    (a data/hora original em que foi lancada), so o AGRUPAMENTO por dia
//    usa a data de liberacao.
const LIBERACAO_CAIXINHA = `(horario_entregue + INTERVAL '30 minutes')`;

async function buscarCaixinhasCore(estabelecimentoId, entregadorId, { periodo = 'hoje', limite = 5, antes } = {}) {
  const limiteFinal = Math.min(parseInt(limite, 10) || 5, 50);
  const condicoes = [
    `estabelecimento_id = $1`, `entregador_id = $2`, `status_pedido = 'entregue'`, `gorjeta > 0`,
    `${LIBERACAO_CAIXINHA} <= NOW()` // ainda dentro do periodo de seguranca -> nem entra na lista
  ];
  const params = [estabelecimentoId, entregadorId];

  // periodo (hoje/semana/mes/...) e calculado em cima do dia de LIBERACAO,
  // nao do dia de entrega -- e assim que a virada de expediente (23:59) se
  // reflete no agrupamento.
  const condPeriodo = condicaoPeriodo(LIBERACAO_CAIXINHA, periodo);
  if (condPeriodo) condicoes.push(condPeriodo);
  if (antes) { params.push(antes); condicoes.push(`horario_entregue < $${params.length}`); }

  params.push(limiteFinal + 1);
  const resultado = await query(
    `SELECT id, gorjeta, horario_entregue FROM pedidos WHERE ${condicoes.join(' AND ')}
     ORDER BY horario_entregue DESC LIMIT $${params.length}`,
    params
  );
  const temMais = resultado.rows.length > limiteFinal;
  const linhas = resultado.rows.slice(0, limiteFinal);

  const totaisRes = await query(
    `SELECT
      COALESCE(SUM(gorjeta) FILTER (WHERE ${LIBERACAO_CAIXINHA} >= CURRENT_DATE), 0) AS hoje,
      COALESCE(SUM(gorjeta) FILTER (WHERE ${LIBERACAO_CAIXINHA} >= CURRENT_DATE - INTERVAL '30 days'), 0) AS mes,
      COALESCE(SUM(gorjeta), 0) AS total
     FROM pedidos
     WHERE estabelecimento_id = $1 AND entregador_id = $2 AND status_pedido = 'entregue' AND gorjeta > 0
       AND ${LIBERACAO_CAIXINHA} <= NOW()`,
    [estabelecimentoId, entregadorId]
  );
  const t = totaisRes.rows[0];

  return {
    caixinhas: linhas.map(p => ({ id: p.id, horario_entregue: p.horario_entregue, valor: Number(p.gorjeta) || 0 })),
    proximo_cursor: linhas.length > 0 ? linhas[linhas.length - 1].horario_entregue : null,
    tem_mais: temMais,
    totais: { hoje: Number(t.hoje) || 0, mes: Number(t.mes) || 0, total: Number(t.total) || 0 }
  };
}

// GET /entregas/minhas-historico -- topico "Rotas realizadas" do menu do
// app: numero do pedido + valor da rota, paginado (5 por vez) e filtravel
// por periodo. Cursor = horario_entregue do ultimo item da pagina anterior.
async function listarMinhasEntregasHistorico(req, res) {
  try {
    const dados = await buscarHistoricoEntregasCore(req.estabelecimentoId, req.funcionarioId, req.query);
    res.json(dados);
  } catch (error) {
    console.error('Erro ao listar historico de entregas:', error);
    res.status(500).json({ erro: 'Erro ao listar historico de entregas.' });
  }
}

// GET /entregas/minhas-caixinhas -- topico "Caixinha recebida": so valor +
// horario, sem identificar o cliente que deu a gorjeta. Os totais (hoje,
// mes, acumulado) nao respeitam paginacao -- sao sempre a soma completa.
async function listarMinhasCaixinhas(req, res) {
  try {
    const dados = await buscarCaixinhasCore(req.estabelecimentoId, req.funcionarioId, req.query);
    res.json(dados);
  } catch (error) {
    console.error('Erro ao listar caixinhas:', error);
    res.status(500).json({ erro: 'Erro ao listar caixinhas.' });
  }
}

// GET /admin/funcionarios/:id/entregas-detalhadas -- mesma coisa que
// /entregas/minhas-historico, so que do lado do painel do lojista, pra ver
// o historico detalhado de um entregador especifico. Usa o MESMO nucleo
// (buscarHistoricoEntregasCore) pra garantir que o numero seja identico ao
// que aparece no app do proprio entregador.
async function listarEntregasDetalhadasAdmin(req, res) {
  try {
    const dados = await buscarHistoricoEntregasCore(req.estabelecimentoId, req.params.id, req.query);
    res.json(dados);
  } catch (error) {
    console.error('Erro ao listar historico detalhado do entregador:', error);
    res.status(500).json({ erro: 'Erro ao listar historico detalhado do entregador.' });
  }
}

// GET /admin/funcionarios/:id/caixinhas -- equivalente admin de
// /entregas/minhas-caixinhas, mesmo nucleo (buscarCaixinhasCore).
async function listarCaixinhasAdmin(req, res) {
  try {
    const dados = await buscarCaixinhasCore(req.estabelecimentoId, req.params.id, req.query);
    res.json(dados);
  } catch (error) {
    console.error('Erro ao listar caixinhas do entregador:', error);
    res.status(500).json({ erro: 'Erro ao listar caixinhas do entregador.' });
  }
}

module.exports = {
  criarPedido,
  criarPedidoManual,
  consultarStatusPedido,
  avaliarEntregador,
  webhookMercadoPago,
  listarPedidosAdmin,
  listarHistoricoCompletoEntregas,
  contarPedidosAdmin,
  atualizarStatusPedido,
  corrigirValoresPedido,
  listarPedidosCliente,
  minhasEntregasHoje,
  minhasEntregasTodas,
  listarMinhasEntregasHistorico,
  listarMinhasCaixinhas,
  listarEntregasDetalhadasAdmin,
  listarCaixinhasAdmin,
  obterCaixaGeral,
  tentarOfertarPedidosPendentes,
  posicaoNaFila,
  listarEntregaPendente,
  entregasEmAndamento,
  aceitarEntrega,
  recusarEntrega,
  encerrarEntrega
};
