// ===================================================================
// Controller de produtos (gerenciados pelo painel admin)
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');

async function listar(req, res) {
  try {
    const resultado = await query(
      `SELECT p.*, c.nome as categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.estabelecimento_id = $1
       ORDER BY p.ordem ASC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ erro: 'Erro interno ao listar produtos.' });
  }
}

async function criar(req, res) {
  try {
    const {
      categoria_id, codigo, nome, descricao, preco, preco_promocional, ordem, estoque,
      controla_estoque, estoque_minimo, custo_compra, fornecedor_id
    } = req.body;

    if (!nome || nome.trim() === '') {
      return res.status(400).json({ erro: 'O nome do produto e obrigatorio.' });
    }
    if (preco === undefined || isNaN(parseFloat(preco)) || parseFloat(preco) < 0) {
      return res.status(400).json({ erro: 'O preco informado e invalido.' });
    }

    let fotoUrl = null;
    if (req.file) {
      fotoUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'produtos');
    }

    // controla_estoque e opcional por produto -- quando ligado e o estoque
    // nao foi informado, comeca em 0 em vez de ficar nulo.
    const controlaEstoqueFinal = controla_estoque === true || controla_estoque === 'true';
    const estoqueFinal = controlaEstoqueFinal
      ? (estoque !== undefined && estoque !== '' ? parseInt(estoque, 10) : 0)
      : (estoque !== undefined && estoque !== '' ? parseInt(estoque, 10) : null);

    const resultado = await query(
      `INSERT INTO produtos
        (estabelecimento_id, categoria_id, codigo, nome, descricao, preco, preco_promocional, foto_url, ordem, estoque,
         controla_estoque, estoque_minimo, custo_compra, fornecedor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        req.estabelecimentoId,
        categoria_id || null,
        codigo || null,
        nome.trim(),
        descricao || null,
        parseFloat(preco),
        preco_promocional ? parseFloat(preco_promocional) : null,
        fotoUrl,
        ordem || 0,
        estoqueFinal,
        controlaEstoqueFinal,
        estoque_minimo !== undefined && estoque_minimo !== '' ? parseInt(estoque_minimo, 10) : 0,
        custo_compra !== undefined && custo_compra !== '' ? parseFloat(custo_compra) : null,
        fornecedor_id || null
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ erro: 'Erro interno ao criar produto.' });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const {
      categoria_id, codigo, nome, descricao, preco, preco_promocional, ordem, disponivel, estoque,
      controla_estoque, estoque_minimo, custo_compra, fornecedor_id
    } = req.body;

    const verificacao = await query(
      'SELECT id, foto_url, estoque, controla_estoque, estoque_minimo, custo_compra, fornecedor_id FROM produtos WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (verificacao.rows.length === 0) {
      return res.status(404).json({ erro: 'Produto nao encontrado.' });
    }
    const produtoAtual = verificacao.rows[0];

    let fotoUrl = produtoAtual.foto_url;
    if (req.file) {
      fotoUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'produtos');
    }

    const resultado = await query(
      `UPDATE produtos SET
        categoria_id = COALESCE($1, categoria_id),
        codigo = COALESCE($2, codigo),
        nome = COALESCE($3, nome),
        descricao = COALESCE($4, descricao),
        preco = COALESCE($5, preco),
        preco_promocional = $6,
        foto_url = $7,
        ordem = COALESCE($8, ordem),
        disponivel = COALESCE($9, disponivel),
        estoque = $10,
        controla_estoque = $11,
        estoque_minimo = $12,
        custo_compra = $13,
        fornecedor_id = $14
       WHERE id = $15 RETURNING *`,
      [
        categoria_id, codigo, nome, descricao,
        preco !== undefined ? parseFloat(preco) : undefined,
        preco_promocional !== undefined ? (preco_promocional ? parseFloat(preco_promocional) : null) : produtoAtual.preco_promocional,
        fotoUrl, ordem, disponivel,
        estoque !== undefined ? (estoque !== '' ? parseInt(estoque, 10) : null) : produtoAtual.estoque,
        controla_estoque !== undefined ? (controla_estoque === true || controla_estoque === 'true') : produtoAtual.controla_estoque,
        estoque_minimo !== undefined ? (estoque_minimo !== '' ? parseInt(estoque_minimo, 10) : 0) : produtoAtual.estoque_minimo,
        custo_compra !== undefined ? (custo_compra !== '' ? parseFloat(custo_compra) : null) : produtoAtual.custo_compra,
        fornecedor_id !== undefined ? (fornecedor_id || null) : produtoAtual.fornecedor_id,
        id
      ]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar produto.' });
  }
}

async function excluir(req, res) {
  try {
    const { id } = req.params;

    const resultado = await query(
      'DELETE FROM produtos WHERE id = $1 AND estabelecimento_id = $2 RETURNING id',
      [id, req.estabelecimentoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Produto nao encontrado.' });
    }

    res.json({ mensagem: 'Produto excluido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir produto.' });
  }
}

// ===================================================================
// Consulta de produto por codigo de barras (GTIN/EAN) na base Cosmos
// (Bluesoft) -- usado pra preencher automaticamente nome/preco/embalagem
// quando o lojista le um codigo de barras (camera ou leitor fisico).
// O token FICA SO AQUI no backend (variavel de ambiente COSMOS_API_TOKEN);
// nunca deve ir pro frontend, que e' hospedado publico no GitHub Pages.
// Plano gratuito do Cosmos: ate 25 consultas por dia.
// ===================================================================
async function consultarCodigoBarras(req, res) {
  try {
    const { codigo } = req.params;
    const codigoLimpo = (codigo || '').replace(/\D/g, '');

    if (!codigoLimpo || codigoLimpo.length < 8) {
      return res.status(400).json({ erro: 'Codigo de barras invalido.' });
    }

    if (!process.env.COSMOS_API_TOKEN) {
      // Sem token configurado ainda -- responde "nao encontrado" de forma
      // silenciosa (o lojista so preenche manualmente, como ja acontecia
      // antes dessa integracao existir).
      return res.status(200).json({ encontrado: false });
    }

    const respostaCosmos = await fetch(
      `https://api.cosmos.bluesoft.com.br/gtins/${encodeURIComponent(codigoLimpo)}.json`,
      { headers: { 'X-Cosmos-Token': process.env.COSMOS_API_TOKEN } }
    );

    if (respostaCosmos.status === 404) {
      return res.status(200).json({ encontrado: false });
    }
    if (!respostaCosmos.ok) {
      console.error('Cosmos respondeu com erro:', respostaCosmos.status);
      return res.status(200).json({ encontrado: false });
    }

    const dados = await respostaCosmos.json();

    // Monta um "conteudo da embalagem" legivel a partir do peso liquido
    // (em gramas), quando o Cosmos tiver essa informacao.
    let conteudoEmbalagem = null;
    if (dados.net_weight) {
      const gramas = Number(dados.net_weight);
      conteudoEmbalagem = gramas >= 1000
        ? `${(gramas / 1000).toFixed(gramas % 1000 === 0 ? 0 : 2)} kg`
        : `${gramas} g`;
    }

    res.status(200).json({
      encontrado: true,
      nome: dados.description || null,
      preco_sugerido: dados.avg_price || dados.price || null,
      marca: dados.brand?.name || null,
      conteudo_embalagem: conteudoEmbalagem,
      foto_url: dados.thumbnail || null
    });
  } catch (error) {
    console.error('Erro ao consultar Cosmos:', error);
    // Falha na consulta externa nao pode travar o cadastro manual.
    res.status(200).json({ encontrado: false });
  }
}

module.exports = { listar, criar, atualizar, excluir, consultarCodigoBarras };
