const { query } = require('../config/database');
const { baixarEstoquePorVenda } = require('../utils/estoque');
const { resolverIntervalo } = require('../utils/periodo');
const { proximoNumero } = require('../utils/numeracao');
const pagamentos = require('../utils/pagamentos');

const FORMAS_PAGAMENTO_VALIDAS = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito'];

// ===================================================================
// REGRA DE EXCLUSIVIDADE: um garcom so ve e mexe nas MESAS DELE (abertas
// ou fechadas) -- do momento que ele abre a comanda ate o cliente ir
// embora (fechamento), nenhum outro garcom acessa aquela mesa. So o
// cargo 'caixa' tem um privilegio especial: pode FECHAR/RECEBER
// pagamento de qualquer comanda (pra quando o cliente tem pressa e o
// garcom responsavel esta ocupado) -- mas so isso, nao ve nem mexe nos
// itens, e a comanda continua registrada como do garcom original (so
// fica marcado que o pagamento foi "no caixa").
// Administrador/gerente/proprietario sempre passam por tudo, sem trava
// (visao completa da loja).
// ===================================================================
function ehAdminTier(cargo) {
  return ['proprietario', 'administrador', 'gerente'].includes(cargo);
}

// Ver a comanda e FECHAR/RECEBER pagamento: dono (garcom), caixa (pode
// fechar/receber de qualquer mesa) ou admin-tier.
function garantirPodeVerOuFecharComanda(comanda, req) {
  if (ehAdminTier(req.cargo) || req.cargo === 'caixa') return;
  if (req.cargo === 'garcom' && comanda.funcionario_id && comanda.funcionario_id !== req.funcionarioId) {
    const erro = new Error('Essa mesa esta sendo atendida por outro garcom.');
    erro.status = 403;
    throw erro;
  }
}

// MEXER na comanda (mandar itens pra cozinha): so o garcom DONO da mesa
// (ou admin-tier). O caixa NAO manda item nenhum -- a funcao dele e so
// receber pagamento quando o garcom responsavel esta ocupado.
function garantirPodeEditarComanda(comanda, req) {
  if (ehAdminTier(req.cargo)) return;
  if (req.cargo === 'caixa') {
    const erro = new Error('O caixa nao pode adicionar itens numa comanda -- so o garcom responsavel pela mesa.');
    erro.status = 403;
    throw erro;
  }
  if (req.cargo === 'garcom' && comanda.funcionario_id && comanda.funcionario_id !== req.funcionarioId) {
    const erro = new Error('Essa mesa esta sendo atendida por outro garcom.');
    erro.status = 403;
    throw erro;
  }
}

// Abre uma comanda nova (mesa ou cliente identificado). E o "guarda-chuva"
// que vai juntar todas as rodadas de pedido ate o fechamento/cobranca.
async function abrir(req, res) {
  try {
    const { mesa_cliente, observacao } = req.body;
    if (!mesa_cliente || !mesa_cliente.trim()) {
      return res.status(400).json({ erro: 'Informe a mesa ou o nome do cliente para abrir a comanda.' });
    }

    const { numero, anoMes } = await proximoNumero(req.estabelecimentoId, 'comanda');

    const resultado = await query(
      `INSERT INTO comandas (estabelecimento_id, funcionario_id, funcionario_nome, funcionario_cargo, mesa_cliente, observacao, numero_comanda, numero_comanda_ano_mes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.estabelecimentoId, req.funcionarioId || null, req.funcionarioNome || null, req.cargo || null, mesa_cliente.trim(), observacao || null, numero, anoMes]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao abrir comanda:', error);
    res.status(500).json({ erro: 'Erro ao abrir comanda.' });
  }
}

// Lista comandas abertas (pra escolher rapido no "Mesa/Cliente") ou o
// historico de comandas fechadas (permanente, nunca some sozinho -- fica
// guardado indefinidamente, nao ha limpeza automatica por idade).
//
// Comandas ABERTAS agora sao exclusivas do garcom que abriu (nenhum
// colega ve/mexe na mesa de outro) -- ele atende do abrir ate o cliente
// ir embora. O cargo "caixa" ve TODAS as abertas (precisa achar qualquer
// mesa pra poder receber um pagamento avulso), e admin-tier ve tudo.
// HISTORICO (fechadas) segue pessoal no app do garcom: cada um ve so as
// que ELE abriu. O admin pode ver o historico completo da loja OU
// filtrar por um funcionario especifico (?funcionario_id=) -- se esse
// funcionario for do cargo "caixa", filtra por QUEM RECEBEU o pagamento
// (fechada_por_funcionario_id + pago_no_caixa) em vez de quem abriu, ja
// que caixa nunca e "dono" de mesa nenhuma.
async function listar(req, res) {
  try {
    const { status, limite, pagina, funcionario_id: funcionarioIdFiltro } = req.query;
    // "todas" junta aberta + fechada numa lista so (cada item continua
    // com seu proprio "status" pra tela poder mostrar a etiqueta
    // Aberta/Fechada) -- usado na aba "Historico completo", que antes so
    // trazia fechadas e escondia comandas ainda em aberto do historico.
    const statusFinal = ['aberta', 'fechada', 'todas'].includes(status) ? status : 'aberta';
    const limiteFinal = Math.min(parseInt(limite, 10) || 50, 200);
    const paginaFinal = Math.max(parseInt(pagina, 10) || 1, 1);
    const offset = (paginaFinal - 1) * limiteFinal;

    const ehAdmin = ehAdminTier(req.cargo);
    const somenteProprioGarcom = req.cargo === 'garcom' && req.funcionarioId;
    // Caixa/Gerente/Administrador nunca "abrem" mesa, entao so faz sentido
    // travar o HISTORICO (fechadas) deles pelas que ELE MESMO recebeu
    // (fechada_por_funcionario_id + pago_no_caixa) -- igual ja funciona no
    // Resumo do Funcionario. Pra ABERTAS continua vendo todas -- precisa
    // achar qualquer mesa de qualquer garcom pra poder receber um
    // pagamento avulso. Em "todas", as duas regras se aplicam juntas (ve
    // toda aberta de qualquer garcom + so as fechadas que ele recebeu).
    const somenteProprioCaixa = ['caixa', 'gerente', 'administrador'].includes(req.cargo) && req.funcionarioId && statusFinal !== 'aberta';

    const condicoes = ['estabelecimento_id = $1'];
    const parametros = [req.estabelecimentoId];
    if (statusFinal !== 'todas') {
      parametros.push(statusFinal);
      condicoes.push(`status = $${parametros.length}`);
    }

    if (somenteProprioGarcom) {
      // Mesmo criterio usado no "Resumo do Funcionario" do admin
      // (funcionario_id = quem abriu/e dono da comanda), pra bater com o
      // numero que o proprietario ja ve por la. Comandas ANTIGAS que nao
      // tem funcionario_id preenchido (de antes desse vinculo existir, ou
      // testes) nao tem "dono" definido -- entao continuam aparecendo pra
      // qualquer garcom, em vez de sumir pra todo mundo.
      condicoes.push(`(funcionario_id = $${parametros.length + 1} OR funcionario_id IS NULL)`);
      parametros.push(req.funcionarioId);
    } else if (somenteProprioCaixa) {
      if (statusFinal === 'todas') {
        condicoes.push(`(status = 'aberta' OR (fechada_por_funcionario_id = $${parametros.length + 1} AND pago_no_caixa = true))`);
        parametros.push(req.funcionarioId);
      } else {
        condicoes.push(`fechada_por_funcionario_id = $${parametros.length + 1}`, 'pago_no_caixa = true');
        parametros.push(req.funcionarioId);
      }
    } else if (ehAdmin && funcionarioIdFiltro) {
      // So o admin pode escolher DE QUEM quer ver o historico -- o garcom
      // ja fica travado no proprio (regra acima) mesmo se tentar mandar
      // esse parametro na mao. Se o funcionario filtrado for Caixa,
      // Gerente ou Administrador, ele nunca "abre" comanda nenhuma --
      // entao o filtro certo pra ele e por quem RECEBEU o pagamento
      // (fechada_por_funcionario_id + pago_no_caixa), nao por quem abriu.
      const alvoRes = await query('SELECT cargo FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [funcionarioIdFiltro, req.estabelecimentoId]);
      if (['caixa', 'gerente', 'administrador'].includes(alvoRes.rows[0]?.cargo)) {
        if (statusFinal === 'todas') {
          condicoes.push(`(status = 'aberta' OR (fechada_por_funcionario_id = $${parametros.length + 1} AND pago_no_caixa = true))`);
        } else {
          condicoes.push(`fechada_por_funcionario_id = $${parametros.length + 1}`, 'pago_no_caixa = true');
        }
        parametros.push(funcionarioIdFiltro);
      } else {
        condicoes.push(`funcionario_id = $${parametros.length + 1}`);
        parametros.push(funcionarioIdFiltro);
      }
    }
    parametros.push(limiteFinal, offset);

    // total_pedidos: quantas rodadas (pedidos) essa comanda teve -- pedido
    // aqui na listagem geral porque a tela de Historico/Equipe precisa
    // mostrar "N pedidos" por comanda sem ter que buscar o detalhe de cada
    // uma (que so traz as rodadas na rota /comandas/:id).
    const resultado = await query(
      `SELECT comandas.*, (SELECT COUNT(*) FROM pedidos WHERE pedidos.comanda_id = comandas.id) AS total_pedidos
       FROM comandas WHERE ${condicoes.join(' AND ')}
       ORDER BY ${statusFinal === 'aberta' ? 'aberta_em ASC' : statusFinal === 'todas' ? 'COALESCE(fechada_em, aberta_em) DESC' : 'fechada_em DESC'}
       LIMIT $${parametros.length - 1} OFFSET $${parametros.length}`,
      parametros
    );
    res.json(resultado.rows.map(r => ({ ...r, total_pedidos: parseInt(r.total_pedidos, 10) || 0 })));
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
    garantirPodeVerOuFecharComanda(comandaRes.rows[0], req);

    const pedidosRes = await query(
      `SELECT id, numero_pedido, itens, subtotal, observacoes, criado_em FROM pedidos
       WHERE comanda_id = $1 ORDER BY criado_em ASC`,
      [id]
    );

    res.json({ ...comandaRes.rows[0], rodadas: pedidosRes.rows });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
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
    garantirPodeEditarComanda(comanda, req);
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
    const { numero: numeroPedido, anoMes: anoMesPedido } = await proximoNumero(req.estabelecimentoId, 'pedido');
    const pedidoRes = await query(
      `INSERT INTO pedidos (
        estabelecimento_id, cliente_nome, cliente_telefone, itens, subtotal, taxa_entrega,
        gorjeta, total, forma_pagamento, status_pagamento, status_pedido, tipo_pedido, canal_venda, observacoes, comanda_id,
        numero_pedido, numero_pedido_ano_mes
      ) VALUES ($1, $2, '(comanda)', $3, $4, 0, 0, $4, 'comanda', 'pendente', 'preparando', 'balcao', 'mesa', $5, $6, $7, $8)
      RETURNING *`,
      [req.estabelecimentoId, comanda.mesa_cliente, JSON.stringify(itensValidados), subtotalRodada, observacoes || null, id, numeroPedido, anoMesPedido]
    );

    await query('UPDATE comandas SET subtotal = subtotal + $1, total = subtotal + $1 + gorjeta WHERE id = $2', [subtotalRodada, id]);

    baixarEstoquePorVenda(req.estabelecimentoId, itensValidados, { pedidoId: pedidoRes.rows[0].id, funcionarioId: req.funcionarioId, canalVenda: 'mesa' })
      .catch(e => console.error('Erro na baixa automatica de estoque (comanda):', e.message));

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'ADICIONAR_ITENS_COMANDA', 'comandas', id, null, itensValidados, req.ip);

    res.status(201).json(pedidoRes.rows[0]);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
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
    const { forma_pagamento, gorjeta, operador_atendimento_id, token_cartao, parcelas_cartao } = req.body;

    if (!FORMAS_PAGAMENTO_VALIDAS.includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Forma de pagamento invalida.' });
    }
    const gorjetaValor = gorjeta ? parseFloat(gorjeta) : 0;
    if (isNaN(gorjetaValor) || gorjetaValor < 0) return res.status(400).json({ erro: 'Valor de gorjeta invalido.' });

    const comandaRes = await query('SELECT * FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (comandaRes.rows.length === 0) return res.status(404).json({ erro: 'Comanda nao encontrada.' });
    const comanda = comandaRes.rows[0];
    garantirPodeVerOuFecharComanda(comanda, req);
    if (comanda.status !== 'aberta') return res.status(400).json({ erro: 'Essa comanda ja foi fechada.' });
    if (Number(comanda.subtotal) <= 0) return res.status(400).json({ erro: 'Essa comanda ainda nao tem nenhum item enviado pra cozinha.' });

    // Se quem esta fechando e o Caixa (nao o garcom dono da mesa), fica
    // registrado que o pagamento foi recebido no caixa -- a comanda
    // continua sendo do garcom original (funcionario_id nao muda), so
    // aparece esse aviso extra no historico dele e no dashboard. O botao
    // "Comanda Garçom" dentro do Atendimento (dashboard) faz a mesma
    // coisa mas autenticado como proprietario/gerente/administrador --
    // esses tambem marcam pago_no_caixa quando mandam esse flag explicito.
    const pagoNoCaixa = req.cargo === 'caixa' || (ehAdminTier(req.cargo) && req.body.pago_no_caixa === true);

    // QUEM cobrou de verdade: normalmente e o proprio funcionario logado
    // (req.funcionarioId, do token de sessao). MAS o gate de senha do
    // Atendimento (Caixa/Gerente/Administrador) NAO cria uma sessao nova
    // -- so confere a senha e guarda o nome no navegador. Entao quando
    // quem esta operando o dashboard e o PROPRIETARIO (sem funcionarioId
    // nenhum no proprio token), o front manda o id de quem autenticou no
    // gate em "operador_atendimento_id" -- revalidado aqui (nunca confia
    // soh no que o front manda) antes de usar como responsavel real pelo
    // fechamento. Se quem esta chamando ja e um funcionario de verdade
    // (logou direto, sem passar pelo gate), usa req.funcionarioId normal.
    let fechadaPorId = req.funcionarioId || null;
    let fechadaPorNome = req.funcionarioNome || null;
    let fechadaPorCargo = req.funcionarioId ? req.cargo : null;
    // Proprietario nao tem registro em funcionarios -- quando ele passa
    // pelo gate do Atendimento com a PROPRIA senha (verificarSenhaAtendimentoProprietario),
    // o front manda 'proprietario' em operador_atendimento_id em vez de
    // um UUID. Aqui so confia nisso se a sessao do dashboard tambem for
    // do proprietario de verdade (req.cargo), pra nao dar pra um
    // funcionario forjar essa marcacao.
    if (!fechadaPorId && pagoNoCaixa && operador_atendimento_id === 'proprietario' && req.cargo === 'proprietario') {
      fechadaPorId = null;
      fechadaPorNome = 'Proprietário';
      fechadaPorCargo = 'proprietario';
    } else if (!fechadaPorId && pagoNoCaixa && operador_atendimento_id) {
      const opRes = await query(
        `SELECT id, nome, cargo FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2 AND ativo = true`,
        [operador_atendimento_id, req.estabelecimentoId]
      );
      if (opRes.rows.length > 0 && ['caixa', 'gerente', 'administrador'].includes(opRes.rows[0].cargo)) {
        fechadaPorId = opRes.rows[0].id;
        fechadaPorNome = opRes.rows[0].nome;
        fechadaPorCargo = opRes.rows[0].cargo;
      }
    }

    // Enquanto a loja nao configurar a chave de pagamento (Configuracoes >
    // Pagamento), so aceita Dinheiro no fechamento -- Pix, credito e debito
    // ficam bloqueados (mesmo credito/debito nao dependendo do Pix hoje,
    // no futuro tambem vao passar pela maquininha integrada via Mercado
    // Pago Point, entao a mesma chave vai valer pra eles).
    let estabelecimentoConfig = null;
    if (forma_pagamento !== 'dinheiro') {
      const estConfigRes = await query(
        'SELECT id, mp_access_token, provedor_pagamento, cartao_online_presencial FROM estabelecimentos WHERE id = $1',
        [req.estabelecimentoId]
      );
      estabelecimentoConfig = estConfigRes.rows[0];
      if (!estabelecimentoConfig?.mp_access_token) {
        return res.status(400).json({ erro: 'Essa loja ainda nao configurou a chave de pagamento em Configurações > Pagamento. Por enquanto, só é possível cobrar em Dinheiro.' });
      }
    }

    // Credito/debito so viram cobranca online se o LOJISTA ligou essa opcao
    // (Configuracoes > Pagamento > "Aceitar cartao online no atendimento").
    // Desligado (padrao), continua o comportamento de sempre: o garcom so
    // registra que recebeu numa maquininha fisica separada, e a comanda
    // fecha na hora, sem chamar o Mercado Pago.
    const ehCartaoOnline = ['cartao_credito', 'cartao_debito'].includes(forma_pagamento)
      && estabelecimentoConfig?.cartao_online_presencial
      && !!token_cartao;

    const totalFinal = Number(comanda.subtotal) + gorjetaValor;

    if (ehCartaoOnline) {
      const notificationUrl = `${process.env.BACKEND_URL}/api/webhooks/mercadopago?estabelecimento_id=${req.estabelecimentoId}`;
      let cobranca;
      try {
        cobranca = await pagamentos.criarCobrancaCartao(estabelecimentoConfig, {
          valor: totalFinal,
          descricao: `Comanda ${comanda.mesa_cliente} - Palatos`,
          referenciaExterna: `comanda:${id}`,
          emailPagador: `comanda-${id.slice(0, 8)}@palatos.com.br`,
          token: token_cartao,
          parcelas: parcelas_cartao || 1,
          metodoPagamentoId: req.body.metodo_pagamento_id,
          notificationUrl
        });
      } catch (erroCartao) {
        console.error('Erro ao cobrar cartao online na comanda:', erroCartao.message);
        return res.status(400).json({ erro: 'Nao foi possivel processar o cartao. Tente novamente ou use a maquininha.' });
      }

      if (cobranca.status !== 'pago') {
        return res.status(400).json({ erro: 'Pagamento recusado pela operadora do cartao. Tente outro cartao ou use a maquininha.' });
      }

      const fechadoCartao = await query(
        `UPDATE comandas SET forma_pagamento = $1, gorjeta = $2, total = $3, status = 'fechada',
                              status_pagamento = 'pago', fechada_em = NOW(), mp_payment_id = $4,
                              fechada_por_funcionario_id = $5, fechada_por_funcionario_nome = $6, fechada_por_funcionario_cargo = $9,
                              pago_no_caixa = $8
         WHERE id = $7 RETURNING *`,
        [forma_pagamento, gorjetaValor, totalFinal, cobranca.idPagamento, fechadaPorId, fechadaPorNome, id, pagoNoCaixa, fechadaPorCargo]
      );

      const { registrarAuditoria: registrarAuditoriaCartao } = require('./funcionarioController');
      await registrarAuditoriaCartao(req.estabelecimentoId, fechadaPorId, fechadaPorNome, 'FECHAR_COMANDA', 'comandas', id, null, fechadoCartao.rows[0], req.ip);

      return res.json({ comanda: fechadoCartao.rows[0] });
    }

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
                            fechada_por_funcionario_id = $4, fechada_por_funcionario_nome = $5, fechada_por_funcionario_cargo = $8,
                            pago_no_caixa = $7
       WHERE id = $6 RETURNING *`,
      [forma_pagamento, gorjetaValor, totalFinal, fechadaPorId, fechadaPorNome, id, pagoNoCaixa, fechadaPorCargo]
    );

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(req.estabelecimentoId, fechadaPorId, fechadaPorNome, 'FECHAR_COMANDA', 'comandas', id, null, fechado.rows[0], req.ip);

    res.json({ comanda: fechado.rows[0], pagamento: null });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
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
    garantirPodeVerOuFecharComanda(comanda, req);
    if (comanda.status === 'fechada') return res.status(400).json({ erro: 'Essa comanda ja esta fechada.' });

    const fechado = await query(
      `UPDATE comandas SET status = 'fechada', status_pagamento = 'pago', fechada_em = NOW(),
                            fechada_por_funcionario_id = $1, fechada_por_funcionario_nome = $2, fechada_por_funcionario_cargo = $4
       WHERE id = $3 RETURNING *`,
      [req.funcionarioId || null, `${req.funcionarioNome} (confirmado por ${supervisor.nome})`, id, req.funcionarioId ? req.cargo : (req.cargo === 'proprietario' ? 'proprietario' : null)]
    );

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'CONFIRMAR_PAGAMENTO_MANUAL_COMANDA', 'comandas', id, comanda, { autorizado_por: supervisor.nome }, req.ip);

    res.json({ comanda: fechado.rows[0] });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao confirmar pagamento manual da comanda:', error);
    res.status(500).json({ erro: 'Erro ao confirmar pagamento manual.' });
  }
}

// Resumo do dia de um funcionario, pra tela "Resumo do [Cargo]" no admin.
// So garcom tem dado de verdade pra mostrar aqui (e o unico cargo com app
// proprio gerando comandas ate agora) -- os outros cargos voltam so com a
// identificacao, sem inventar numero nenhum.
// Resumo do funcionario (aba "Caixa" dentro de Resumo do Funcionario).
// Antes ficava travado no dia de hoje -- agora aceita o mesmo filtro de
// periodo do Caixa Geral: ?intervalo=hoje|ontem|semana|mes_atual|
// trimestre|semestre|geral|personalizado (+ data_inicio/data_fim quando
// for personalizado). Sem parametro nenhum, continua mostrando "hoje"
// (comportamento antigo preservado por padrao).
async function resumoFuncionario(req, res) {
  try {
    const { id } = req.params;
    const { intervalo = 'hoje', data_inicio, data_fim } = req.query;
    const { inicio, fim } = resolverIntervalo(intervalo, data_inicio, data_fim);

    const fRes = await query('SELECT id, nome, email, cargo FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (fRes.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });
    const funcionario = fRes.rows[0];

    // Caixa/Gerente/Administrador que passam pelo gate do Atendimento tem
    // o MESMO tipo de resumo: "o que EU pessoalmente vendi/recebi" --
    // nao tem mesa propria (como o garcom), entao junta duas origens:
    //   1) Comandas de garcom que ELE cobrou no balcao/Comanda Garcom
    //      (fechada_por_funcionario_id + pago_no_caixa = true) -- mostra
    //      qual garcom atendia a mesa, pra deixar claro que a venda e do
    //      garcom mas o RECEBIMENTO foi por essa pessoa.
    //   2) Pedidos de balcao/retirada/mesa que ELE MESMO lancou direto
    //      pelo "Novo Pedido" do Atendimento (lancado_por_funcionario_id)
    //      -- NAO inclui os marcados "enviar pra entrega" (tipo_pedido =
    //      'entrega'), que saem desse historico e seguem o fluxo normal
    //      do entregador em vez de ficar preso a quem lancou.
    if (['caixa', 'gerente', 'administrador'].includes(funcionario.cargo)) {
      const condicoesCaixa = ['estabelecimento_id = $1', 'fechada_por_funcionario_id = $2', 'pago_no_caixa = true'];
      const paramsCaixa = [req.estabelecimentoId, id];
      if (inicio) { paramsCaixa.push(inicio); condicoesCaixa.push(`fechada_em >= $${paramsCaixa.length}`); }
      if (fim) { paramsCaixa.push(fim); condicoesCaixa.push(`fechada_em <= $${paramsCaixa.length}`); }

      const comandasRes = await query(
        `SELECT * FROM comandas WHERE ${condicoesCaixa.join(' AND ')} ORDER BY fechada_em DESC`,
        paramsCaixa
      );

      const condicoesPedidos = ['estabelecimento_id = $1', 'lancado_por_funcionario_id = $2', `tipo_pedido != 'entrega'`];
      const paramsPedidos = [req.estabelecimentoId, id];
      if (inicio) { paramsPedidos.push(inicio); condicoesPedidos.push(`criado_em >= $${paramsPedidos.length}`); }
      if (fim) { paramsPedidos.push(fim); condicoesPedidos.push(`criado_em <= $${paramsPedidos.length}`); }

      const pedidosRes = await query(
        `SELECT * FROM pedidos WHERE ${condicoesPedidos.join(' AND ')} ORDER BY criado_em DESC`,
        paramsPedidos
      );

      // Itens de cada comanda (todas as rodadas mandadas pra cozinha),
      // pra poder mostrar "o que o cliente pediu" no detalhe -- igual ja
      // existe no Resumo do garcom.
      const comandaIdsCaixa = comandasRes.rows.map(c => c.id);
      let rodadasCaixaRes = { rows: [] };
      if (comandaIdsCaixa.length > 0) {
        rodadasCaixaRes = await query(
          `SELECT comanda_id, itens FROM pedidos WHERE comanda_id = ANY($1::uuid[])`,
          [comandaIdsCaixa]
        );
      }

      // Junta as duas origens numa lista so, ja no formato que a tela usa
      // (mesa_cliente, fechada_em, forma_pagamento, total, gorjeta,
      // funcionario_nome de quem atendia a mesa -- so faz sentido pra
      // comanda, pedido de balcao nao tem "garcom dono"). Cada linha ja
      // vem com os itens (pra mostrar no detalhe: o que foi pedido,
      // valor unitario e total) e a origem/tipo (mesa, balcao ou
      // entrega), pra ficar claro de onde veio cada venda.
      const canalLegenda = { balcao: 'Balcão', retirada: 'Retirada', mesa: 'Mesa (direto)', delivery: 'Entrega' };
      const movimentacoes = [
        ...comandasRes.rows.map(c => ({
          origem: 'comanda', id: c.id, mesa_cliente: c.mesa_cliente, funcionario_nome: c.funcionario_nome,
          funcionario_cargo: c.funcionario_cargo,
          fechada_por_funcionario_nome: c.fechada_por_funcionario_nome, fechada_por_funcionario_cargo: c.fechada_por_funcionario_cargo,
          forma_pagamento: c.forma_pagamento, subtotal: c.subtotal, gorjeta: c.gorjeta, total: c.total,
          quando: c.fechada_em, numero: c.numero_comanda, tipo_venda: 'Mesa', pago_no_caixa: c.pago_no_caixa,
          itens: rodadasCaixaRes.rows.filter(r => r.comanda_id === c.id).flatMap(r => Array.isArray(r.itens) ? r.itens : []),
          total_pedidos: rodadasCaixaRes.rows.filter(r => r.comanda_id === c.id).length
        })),
        ...pedidosRes.rows.map(p => ({
          origem: 'pedido', id: p.id, mesa_cliente: `${canalLegenda[p.canal_venda] || 'Balcão'} — ${p.cliente_nome}`,
          funcionario_nome: null, funcionario_cargo: null,
          fechada_por_funcionario_nome: p.lancado_por_funcionario_nome, fechada_por_funcionario_cargo: p.lancado_por_funcionario_cargo,
          forma_pagamento: p.forma_pagamento, subtotal: p.subtotal, gorjeta: p.gorjeta || 0,
          total: p.total, quando: p.criado_em, numero: p.numero_pedido,
          tipo_venda: p.tipo_pedido === 'entrega' ? 'Entrega' : 'Balcão',
          itens: Array.isArray(p.itens) ? p.itens : [],
          total_pedidos: 1 // pedido de balcao/retirada avulso -- sempre 1 pedido, nao tem "rodadas"
        }))
      ].sort((a, b) => new Date(b.quando) - new Date(a.quando));

      const totalRecebido = movimentacoes.reduce((s, m) => s + Number(m.total), 0);
      // Regra da caixinha: quando o Caixa faz o PROPRIO atendimento (venda
      // direta de balcao/mesa, origem 'pedido') e marca gorjeta, essa
      // gorjeta e dele. Quando ele so RECEBE uma comanda que foi atendida
      // por um garcom (origem 'comanda'), a gorjeta e do garcom que
      // atendeu -- e ja esta contada no resumo dele (funcao mais abaixo).
      // Contar aqui de novo faria a mesma gorjeta aparecer duplicada, uma
      // vez pro garcom e outra pro caixa que so cobrou.
      const gorjetasCaixa = movimentacoes
        .filter(m => m.origem === 'pedido')
        .reduce((s, m) => s + Number(m.gorjeta || 0), 0);
      const porFormaCaixa = { dinheiro: 0, cartao_credito: 0, cartao_debito: 0, pix: 0 };
      const transacoesPorFormaCaixa = { dinheiro: 0, cartao_credito: 0, cartao_debito: 0, pix: 0 };
      movimentacoes.forEach(m => {
        if (m.forma_pagamento && porFormaCaixa.hasOwnProperty(m.forma_pagamento)) {
          porFormaCaixa[m.forma_pagamento] += Number(m.total);
          transacoesPorFormaCaixa[m.forma_pagamento] += 1;
        }
      });
      const ticketMedioCaixa = movimentacoes.length > 0 ? totalRecebido / movimentacoes.length : 0;

      return res.json({
        funcionario,
        tipo: 'caixa',
        periodo: { intervalo, inicio, fim },
        resumo: {
          total_recebido_hoje: totalRecebido, // nome do campo mantido por compatibilidade -- vale pro periodo escolhido, nao so "hoje"
          pagamentos_hoje: movimentacoes.length,
          // BUGFIX: esses 4 campos nao existiam aqui antes -- o frontend
          // esperava esses nomes (iguais aos do garcom) pra preencher os
          // cards "Vendas do dia / Pedidos / Ticket médio / Mesas
          // atendidas", e como nao vinham, os cards ficavam travados em
          // R$ 0,00 mesmo com dinheiro recebido de verdade.
          vendas_do_dia: totalRecebido,
          gorjetas_do_dia: gorjetasCaixa,
          pedidos_hoje: movimentacoes.length,
          comandas_abertas: 0, // caixa nunca "abre" mesa -- nao se aplica
          mesas_atendidas_hoje: movimentacoes.length,
          ticket_medio: ticketMedioCaixa
        },
        pagamentos_hoje: movimentacoes,
        comandas_hoje: movimentacoes, // mesmo dado, nome alternativo pro renderizador compartilhado
        fechamento_caixa: {
          total_dinheiro: porFormaCaixa.dinheiro,
          total_cartao_credito: porFormaCaixa.cartao_credito,
          total_cartao_debito: porFormaCaixa.cartao_debito,
          total_pix: porFormaCaixa.pix,
          transacoes_cartao_credito: transacoesPorFormaCaixa.cartao_credito,
          transacoes_cartao_debito: transacoesPorFormaCaixa.cartao_debito,
          total_recebido: totalRecebido
        }
      });
    }

    if (funcionario.cargo !== 'garcom') {
      return res.json({ funcionario, tipo: 'sem_dados' });
    }

    // Comandas do garcom dentro do periodo escolhido: entra se foi aberta
    // OU fechada dentro da janela (assim uma comanda aberta ontem e paga
    // hoje aparece nos dois periodos, igual o Caixa Geral se comporta).
    const condicoesGarcom = ['estabelecimento_id = $1', 'funcionario_id = $2'];
    const paramsGarcom = [req.estabelecimentoId, id];
    if (inicio && fim) {
      paramsGarcom.push(inicio, fim, inicio, fim);
      condicoesGarcom.push(
        `((aberta_em >= $${paramsGarcom.length - 3} AND aberta_em <= $${paramsGarcom.length - 2})
          OR (fechada_em >= $${paramsGarcom.length - 1} AND fechada_em <= $${paramsGarcom.length}))`
      );
    }
    // intervalo "geral" (inicio/fim nulos) nao adiciona filtro nenhum -- traz tudo.

    const comandasPeriodoRes = await query(
      `SELECT * FROM comandas WHERE ${condicoesGarcom.join(' AND ')} ORDER BY aberta_em DESC LIMIT 500`,
      paramsGarcom
    );

    const comandaIds = comandasPeriodoRes.rows.map(c => c.id);
    let rodadasRes = { rows: [] };
    if (comandaIds.length > 0) {
      rodadasRes = await query(
        `SELECT comanda_id, numero_pedido, itens, subtotal, observacoes, criado_em FROM pedidos
         WHERE comanda_id = ANY($1::uuid[]) ORDER BY criado_em ASC`,
        [comandaIds]
      );
    }
    const comandasPeriodo = comandasPeriodoRes.rows.map(c => {
      const rodadas = rodadasRes.rows.filter(r => r.comanda_id === c.id);
      return { ...c, rodadas, total_pedidos: rodadas.length };
    });

    // Comandas ainda ABERTAS agora sempre contam no total geral do garcom,
    // independente do periodo escolhido (uma mesa aberta e sempre "atual").
    const abertasAgoraRes = await query(
      `SELECT COUNT(*) FROM comandas WHERE estabelecimento_id = $1 AND funcionario_id = $2 AND status = 'aberta'`,
      [req.estabelecimentoId, id]
    );

    const fechadasPeriodo = comandasPeriodo.filter(c => c.status === 'fechada');
    // IMPORTANTE: "Fechamento de caixa" e "Vendas do dia" desse garcom
    // precisam refletir SO o dinheiro que ELE MESMO recebeu na mao --
    // uma mesa que ele atendeu mas o Caixa cobrou (pago_no_caixa = true)
    // nao pode entrar nessa soma, senao o total pessoal dele fica
    // inflado com dinheiro que ele nunca chegou a pegar (quebra a prova
    // de exatidao: se der diferenca no caixa, isso incrimina o garcom
    // errado). Essas comandas continuam aparecendo na lista
    // "comandas_hoje" (ele atendeu a mesa, precisa poder provar isso),
    // so nao contam nos totais financeiros pessoais dele.
    const fechadasRecebidasPorEle = fechadasPeriodo.filter(c => !c.pago_no_caixa);
    const vendasPeriodo = fechadasRecebidasPorEle.reduce((s, c) => s + Number(c.total), 0);
    const gorjetasPeriodo = fechadasPeriodo.reduce((s, c) => s + Number(c.gorjeta || 0), 0);
    const pedidosPeriodo = comandasPeriodo.reduce((s, c) => s + c.rodadas.length, 0);
    const ticketMedio = fechadasRecebidasPorEle.length > 0 ? vendasPeriodo / fechadasRecebidasPorEle.length : 0;

    const porForma = { dinheiro: 0, cartao_credito: 0, cartao_debito: 0, pix: 0 };
    const transacoesPorForma = { dinheiro: 0, cartao_credito: 0, cartao_debito: 0, pix: 0 };
    fechadasRecebidasPorEle.forEach(c => {
      if (c.forma_pagamento && porForma.hasOwnProperty(c.forma_pagamento)) {
        porForma[c.forma_pagamento] += Number(c.total);
        transacoesPorForma[c.forma_pagamento] += 1;
      }
    });

    // Total recebido por outra pessoa (caixa/gerente/admin/proprietario)
    // em mesas que sao dele -- mostrado separado, pra ficar claro que
    // ele atendeu mas nao foi ele quem guardou o dinheiro.
    const totalPagoNoCaixa = fechadasPeriodo
      .filter(c => c.pago_no_caixa)
      .reduce((s, c) => s + Number(c.total), 0);

    res.json({
      funcionario,
      tipo: 'garcom',
      periodo: { intervalo, inicio, fim },
      resumo: {
        vendas_do_dia: vendasPeriodo, // nomes de campo mantidos por compatibilidade -- valem pro periodo escolhido, e ja SO o que ele mesmo recebeu
        gorjetas_do_dia: gorjetasPeriodo,
        pedidos_hoje: pedidosPeriodo,
        comandas_abertas: parseInt(abertasAgoraRes.rows[0].count, 10),
        mesas_atendidas_hoje: comandasPeriodo.length,
        ticket_medio: ticketMedio,
        total_pago_no_caixa: totalPagoNoCaixa
      },
      comandas_hoje: comandasPeriodo,
      fechamento_caixa: {
        total_dinheiro: porForma.dinheiro,
        total_cartao_credito: porForma.cartao_credito,
        total_cartao_debito: porForma.cartao_debito,
        total_pix: porForma.pix,
        transacoes_cartao_credito: transacoesPorForma.cartao_credito,
        transacoes_cartao_debito: transacoesPorForma.cartao_debito,
        total_recebido: vendasPeriodo
      }
    });
  } catch (error) {
    console.error('Erro ao obter resumo do funcionario:', error);
    res.status(500).json({ erro: 'Erro ao obter resumo do funcionario.' });
  }
}

// Corrige o valor de uma comanda ja fechada (ex: cobranca incorreta detectada
// depois). Exige a permissao 'corrigir_valores_concluidos', ja pensada pra
// esse tipo de ajuste. Registra em auditoria com o valor anterior, pra
// manter rastro de quem mudou o que.
async function corrigirValores(req, res) {
  try {
    const { id } = req.params;
    const { subtotal, gorjeta, motivo } = req.body;

    const comandaRes = await query('SELECT * FROM comandas WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (comandaRes.rows.length === 0) return res.status(404).json({ erro: 'Comanda nao encontrada.' });
    const anterior = comandaRes.rows[0];

    const novoSubtotal = subtotal !== undefined && subtotal !== '' ? parseFloat(subtotal) : Number(anterior.subtotal);
    const novaGorjeta = gorjeta !== undefined && gorjeta !== '' ? parseFloat(gorjeta) : Number(anterior.gorjeta);
    if (isNaN(novoSubtotal) || novoSubtotal < 0 || isNaN(novaGorjeta) || novaGorjeta < 0) {
      return res.status(400).json({ erro: 'Valores invalidos.' });
    }

    const atualizado = await query(
      `UPDATE comandas SET subtotal = $1, gorjeta = $2, total = $1 + $2 WHERE id = $3 RETURNING *`,
      [novoSubtotal, novaGorjeta, id]
    );

    const { registrarAuditoria } = require('./funcionarioController');
    await registrarAuditoria(
      req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'CORRIGIR_VALORES_COMANDA', 'comandas', id,
      { subtotal: anterior.subtotal, gorjeta: anterior.gorjeta, total: anterior.total },
      { subtotal: novoSubtotal, gorjeta: novaGorjeta, total: novoSubtotal + novaGorjeta, motivo: motivo || null },
      req.ip
    );

    res.json(atualizado.rows[0]);
  } catch (error) {
    console.error('Erro ao corrigir valores da comanda:', error);
    res.status(500).json({ erro: 'Erro ao corrigir valores da comanda.' });
  }
}

module.exports = { abrir, listar, detalhe, adicionarItens, fechar, excluir, confirmarPagamentoManual, resumoFuncionario, corrigirValores };
