const { query } = require('../config/database');
const { baixarEstoquePorVenda } = require('../utils/estoque');
const pagamentos = require('../utils/pagamentos');

const FORMAS_PAGAMENTO_VALIDAS = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito'];

// Abre uma comanda nova (mesa ou cliente identificado). E o "guarda-chuva"
// que vai juntar todas as rodadas de pedido ate o fechamento/cobranca.
async function abrir(req, res) {
  try {
    const { mesa_cliente, observacao } = req.body;
    if (!mesa_cliente || !mesa_cliente.trim()) {
      return res.status(400).json({ erro: 'Informe a mesa ou o nome do cliente para abrir a comanda.' });
    }

    const resultado = await query(
      `INSERT INTO comandas (estabelecimento_id, funcionario_id, funcionario_nome, mesa_cliente, observacao)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.estabelecimentoId, req.funcionarioId || null, req.funcionarioNome || null, mesa_cliente.trim(), observacao || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao abrir comanda:', error);
    res.status(500).json({ erro: 'Erro ao abrir comanda.' });
  }
}

// Lista comandas abertas (pra escolher rapido no "Mesa/Cliente") ou o
// historico de comandas fechadas (permanente, nunca some sozinho).
async function listar(req, res) {
  try {
    const { status, limite } = req.query;
    const statusFinal = ['aberta', 'fechada'].includes(status) ? status : 'aberta';
    const limiteFinal = Math.min(parseInt(limite, 10) || 50, 200);

    const resultado = await query(
      `SELECT * FROM comandas WHERE estabelecimento_id = $1 AND status = $2
       ORDER BY ${statusFinal === 'aberta' ? 'aberta_em ASC' : 'fechada_em DESC'}
       LIMIT $3`,
      [req.estabelecimentoId, statusFinal, limiteFinal]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar comandas:', error);
    res.status(500).json({ erro: 'Erro ao listar comandas.' });
  }
}

// Detalhe de uma comanda: dados dela + todas as rodadas de pedido
// vinculadas (o que foi pedido em cada uma, e quando).
async function detalhe(req, res) {
  try {
    const { id } = req.params;
    const comandaRes = await query('SELECT * FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (comandaRes.rows.length === 0) return res.status(404).json({ erro: 'Comanda nao encontrada.' });

    const pedidosRes = await query(
      `SELECT id, itens, subtotal, observacoes, criado_em FROM pedidos
       WHERE comanda_id = $1 ORDER BY criado_em ASC`,
      [id]
    );

    res.json({ ...comandaRes.rows[0], rodadas: pedidosRes.rows });
  } catch (error) {
    console.error('Erro ao obter detalhe da comanda:', error);
    res.status(500).json({ erro: 'Erro ao obter detalhe da comanda.' });
  }
}

// Manda uma rodada de itens pra cozinha AGORA (nao espera o fechamento da
// comanda). Cada chamada aqui cria um pedido de verdade vinculado a essa
// comanda, pra continuar aparecendo normal no painel da cozinha.
async function adicionarItens(req, res) {
  try {
    const { id } = req.params;
    const { itens, observacoes } = req.body;

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: 'Adicione pelo menos um item.' });
    }

    const comandaRes = await query('SELECT * FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (comandaRes.rows.length === 0) return res.status(404).json({ erro: 'Comanda nao encontrada.' });
    const comanda = comandaRes.rows[0];
    if (comanda.status !== 'aberta') return res.status(400).json({ erro: 'Essa comanda ja foi fechada.' });

    // Preco sempre recalculado a partir do banco.
    let subtotalRodada = 0;
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
      subtotalRodada += preco * quantidade;
      itensValidados.push({ produto_id: produto.id, nome: produto.nome, preco, quantidade });
    }

    // forma_pagamento e' NOT NULL em pedidos, mas quem paga de verdade e'
    // a comanda (no fechamento) -- 'comanda' aqui e' so um marcador,
    // status_pagamento fica 'pendente' e nao e' usado pra nada nessa linha.
    const pedidoRes = await query(
      `INSERT INTO pedidos (
        estabelecimento_id, cliente_nome, cliente_telefone, itens, subtotal, taxa_entrega,
        gorjeta, total, forma_pagamento, status_pagamento, status_pedido, tipo_pedido, canal_venda, observacoes, comanda_id
      ) VALUES ($1, $2, '(comanda)', $3, $4, 0, 0, $4, 'comanda', 'pendente', 'preparando', 'balcao', 'mesa', $5, $6)
      RETURNING *`,
      [req.estabelecimentoId, comanda.mesa_cliente, JSON.stringify(itensValidados), subtotalRodada, observacoes || null, id]
    );

    await query('UPDATE comandas SET subtotal = subtotal + $1, total = subtotal + $1 + gorjeta WHERE id = $2', [subtotalRodada, id]);

    baixarEstoquePorVenda(req.estabelecimentoId, itensValidados, { pedidoId: pedidoRes.rows[0].id, funcionarioId: req.funcionarioId, canalVenda: 'mesa' })
      .catch(e => console.error('Erro na baixa automatica de estoque (comanda):', e.message));

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'ADICIONAR_ITENS_COMANDA', 'comandas', id, null, itensValidados, req.ip);

    res.status(201).json(pedidoRes.rows[0]);
  } catch (error) {
    console.error('Erro ao adicionar itens na comanda:', error);
    res.status(500).json({ erro: 'Erro ao adicionar itens na comanda.' });
  }
}

// Fecha a comanda: escolhe forma de pagamento e gorjeta. Dinheiro/cartao
// fecham na hora; Pix gera o QR e so fecha de verdade quando o webhook do
// Mercado Pago confirmar (o app fica de olho via GET /comandas/:id).
async function fechar(req, res) {
  try {
    const { id } = req.params;
    const { forma_pagamento, gorjeta } = req.body;

    if (!FORMAS_PAGAMENTO_VALIDAS.includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Forma de pagamento invalida.' });
    }
    const gorjetaValor = gorjeta ? parseFloat(gorjeta) : 0;
    if (isNaN(gorjetaValor) || gorjetaValor < 0) return res.status(400).json({ erro: 'Valor de gorjeta invalido.' });

    const comandaRes = await query('SELECT * FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (comandaRes.rows.length === 0) return res.status(404).json({ erro: 'Comanda nao encontrada.' });
    const comanda = comandaRes.rows[0];
    if (comanda.status !== 'aberta') return res.status(400).json({ erro: 'Essa comanda ja foi fechada.' });
    if (Number(comanda.subtotal) <= 0) return res.status(400).json({ erro: 'Essa comanda ainda nao tem nenhum item enviado pra cozinha.' });

    const totalFinal = Number(comanda.subtotal) + gorjetaValor;

    if (forma_pagamento === 'pix') {
      const estRes = await query('SELECT id, mp_access_token, provedor_pagamento FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
      const estabelecimento = estRes.rows[0];
      const notificationUrl = `${process.env.BACKEND_URL}/api/webhooks/mercadopago?estabelecimento_id=${req.estabelecimentoId}`;
      const cobranca = await pagamentos.criarCobrancaPix(estabelecimento, {
        valor: totalFinal,
        descricao: `Comanda ${comanda.mesa_cliente} - Palatos`,
        referenciaExterna: `comanda:${id}`,
        emailPagador: `comanda-${id.slice(0, 8)}@palatos.com.br`,
        notificationUrl
      });

      const atualizado = await query(
        `UPDATE comandas SET forma_pagamento = $1, gorjeta = $2, total = $3, status_pagamento = 'pendente',
                              mp_payment_id = $4, pix_qr_code = $5, pix_qr_code_base64 = $6, pix_expira_em = $7
         WHERE id = $8 RETURNING *`,
        [forma_pagamento, gorjetaValor, totalFinal, cobranca.idPagamento, cobranca.qrCode, cobranca.qrCodeBase64, cobranca.expiraEm, id]
      );
      return res.json({ comanda: atualizado.rows[0], pagamento: { qr_code: cobranca.qrCode, qr_code_base64: cobranca.qrCodeBase64, expira_em: cobranca.expiraEm } });
    }

    const fechado = await query(
      `UPDATE comandas SET forma_pagamento = $1, gorjeta = $2, total = $3, status = 'fechada',
                            status_pagamento = 'pago', fechada_em = NOW(),
                            fechada_por_funcionario_id = $4, fechada_por_funcionario_nome = $5
       WHERE id = $6 RETURNING *`,
      [forma_pagamento, gorjetaValor, totalFinal, req.funcionarioId || null, req.funcionarioNome || null, id]
    );

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'FECHAR_COMANDA', 'comandas', id, null, fechado.rows[0], req.ip);

    res.json({ comanda: fechado.rows[0], pagamento: null });
  } catch (error) {
    console.error('Erro ao fechar comanda:', error);
    res.status(500).json({ erro: error.message || 'Erro ao fechar comanda.' });
  }
}

// So o proprietario/administrador pode excluir uma comanda do historico
// (a rota ja e' protegida por exigirCargoAdministrativo).
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const anterior = await query('SELECT * FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Comanda nao encontrada.' });

    await query('DELETE FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'EXCLUIR_COMANDA', 'comandas', id, anterior.rows[0], null, req.ip);

    res.json({ mensagem: 'Comanda excluida do historico.' });
  } catch (error) {
    console.error('Erro ao excluir comanda:', error);
    res.status(500).json({ erro: 'Erro ao excluir comanda.' });
  }
}

// Confirma senha de gerente/administrador E ja fecha a comanda como paga
// no mesmo passo -- usado quando o pagamento Pix nao caiu pelo QR (ex:
// cliente pagou por transferencia direta) e alguem com autoridade precisa
// assumir isso manualmente.
async function confirmarPagamentoManual(req, res) {
  try {
    const { id } = req.params;
    const { login, senha } = req.body;

    const { verificarCredenciaisSupervisor, registrarAuditoria } = require('./funcionarioController');
    const supervisor = await verificarCredenciaisSupervisor(req.estabelecimentoId, login, senha);

    const comandaRes = await query('SELECT * FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (comandaRes.rows.length === 0) return res.status(404).json({ erro: 'Comanda nao encontrada.' });
    const comanda = comandaRes.rows[0];
    if (comanda.status === 'fechada') return res.status(400).json({ erro: 'Essa comanda ja esta fechada.' });

    const fechado = await query(
      `UPDATE comandas SET status = 'fechada', status_pagamento = 'pago', fechada_em = NOW(),
                            fechada_por_funcionario_id = $1, fechada_por_funcionario_nome = $2
       WHERE id = $3 RETURNING *`,
      [req.funcionarioId || null, `${req.funcionarioNome} (confirmado por ${supervisor.nome})`, id]
    );

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'CONFIRMAR_PAGAMENTO_MANUAL_COMANDA', 'comandas', id, comanda, { autorizado_por: supervisor.nome }, req.ip);

    res.json({ comanda: fechado.rows[0] });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao confirmar pagamento manual da comanda:', error);
    res.status(500).json({ erro: 'Erro ao confirmar pagamento manual.' });
  }
}

module.exports = { abrir, listar, detalhe, adicionarItens, fechar, excluir, confirmarPagamentoManual };
