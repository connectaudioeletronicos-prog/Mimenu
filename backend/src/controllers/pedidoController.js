const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');
const { validarFormatoCep, validarCepViaCep } = require('../utils/geocoding');

async function criarPedido(req, res) {
  try {
    const { slug } = req.params;
    const {
      cliente_nome, cliente_telefone, cliente_endereco, cliente_cep,
      observacoes, forma_pagamento, taxa_entrega, gorjeta, tipo_pedido, itens
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

    const regexTelefone = /^\(\d{2}\)\s\d{9}$/;
    if (!regexTelefone.test(cliente_telefone)) {
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

    const estRes = await query('SELECT id, ativo, mp_access_token, tempo_preparo_min FROM estabelecimentos WHERE slug = $1', [slug]);
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

    const pedidoRes = await query(
      `INSERT INTO pedidos (estabelecimento_id, cliente_nome, cliente_telefone, cliente_endereco, cliente_cep, observacoes, forma_pagamento, itens, subtotal, taxa_entrega, gorjeta, total, tipo_pedido, status_pedido, status_pagamento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'novo','pendente') RETURNING *`,
      [estabelecimentoId, cliente_nome, cliente_telefone, ehRetirada ? null : cliente_endereco, ehRetirada ? null : cliente_cep, observacoes || '', forma_pagamento, JSON.stringify(itensValidados), subtotal, taxaEntregaFinal, gorjetaFinal, total, tipoPedidoFinal]
    );
    const pedido = pedidoRes.rows[0];

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

    res.status(201).json({
      pedido,
      pagamento: null,
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
  res.sendStatus(200);
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

// Escolhe o proximo entregador da fila pra um pedido que acabou de ser
// confirmado como pronto pelo administrador. Regra absoluta: sempre
// respeita a ordem de chegada (quem esta ha mais tempo esperando/disponivel
// entra primeiro). Fica de fora da fila quem estiver inativo, indisponivel
// ou ja estiver com uma entrega em andamento (saiu_entrega).
async function atribuirProximoEntregador(estabelecimentoId) {
  const resultado = await query(
    `SELECT f.id, f.nome
     FROM funcionarios f
     WHERE f.estabelecimento_id = $1 AND f.cargo = 'entregador' AND f.ativo = true AND f.disponivel_entrega = true
       AND NOT EXISTS (
         SELECT 1 FROM pedidos p WHERE p.entregador_id = f.id AND p.status_pedido = 'saiu_entrega'
       )
     ORDER BY f.ultima_fila_em ASC NULLS FIRST, f.criado_em ASC
     LIMIT 1`,
    [estabelecimentoId]
  );
  return resultado.rows[0] || null;
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
      if (status_pedido !== 'entregue') {
        return res.status(403).json({ erro: 'O entregador so pode marcar a entrega como concluida.' });
      }
      if (pedidoAtual.rows[0].entregador_id !== req.funcionarioId) {
        return res.status(403).json({ erro: 'Esse pedido nao esta atribuido a voce.' });
      }
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

    // Confirmar que o pedido esta pronto (pronto -> saiu_entrega) exige um
    // entregador disponivel, ja que a atribuicao e sempre automatica e
    // sempre respeita a ordem de chegada. Sem entregador livre, o pedido
    // fica em "pronto" ate que algum fique disponivel.
    if (status_pedido === 'saiu_entrega') {
      const entregador = await atribuirProximoEntregador(req.estabelecimentoId);
      if (!entregador) {
        return res.status(409).json({ erro: 'Nenhum entregador disponivel no momento. O pedido continua como "pronto" ate que um entregador fique livre.' });
      }
      await query(
        'UPDATE pedidos SET status_pedido = $1, entregador_id = $2, entregador_nome = $3, horario_saiu_entrega = NOW() WHERE id = $4 AND estabelecimento_id = $5',
        [status_pedido, entregador.id, entregador.nome, id, req.estabelecimentoId]
      );
    } else if (status_pedido === 'pronto') {
      await query(
        'UPDATE pedidos SET status_pedido = $1, horario_pronto = NOW() WHERE id = $2 AND estabelecimento_id = $3',
        [status_pedido, id, req.estabelecimentoId]
      );
    } else {
      await query('UPDATE pedidos SET status_pedido = $1 WHERE id = $2 AND estabelecimento_id = $3', [status_pedido, id, req.estabelecimentoId]);
    }

    // Entrega concluida: soma no contador do entregador e o manda pro fim
    // da fila (proxima atribuicao respeita quem esta ha mais tempo esperando).
    if (status_pedido === 'entregue' && pedidoAtual.rows[0].entregador_id) {
      await query(
        'UPDATE funcionarios SET total_entregas = total_entregas + 1, ultima_fila_em = NOW() WHERE id = $1',
        [pedidoAtual.rows[0].entregador_id]
      );
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

module.exports = {
  criarPedido,
  consultarStatusPedido,
  webhookMercadoPago,
  listarPedidosAdmin,
  contarPedidosAdmin,
  atualizarStatusPedido,
  corrigirValoresPedido,
  listarPedidosCliente,
  obterCaixaGeral
};
