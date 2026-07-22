// ===================================================================
// Controller de estabelecimentos
// Lida com dados publicos (cardapio) e configuracoes (painel admin)
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');

const CAMPOS_EDITAVEIS = [
  'nome', 'cor_principal', 'cor_secundaria', 'cor_botoes', 'fonte', 'tema',
  'texto_apresentacao', 'whatsapp', 'telefone', 'endereco', 'instagram',
  'facebook', 'linkedin', 'email_contato', 'horario_funcionamento',
  'mp_access_token', 'mp_public_key', 'tempo_preparo_min',
  'termos_uso', 'politica_privacidade', 'cookies'
];

async function buscarPorSlug(req, res) {
  try {
    const { slug } = req.params;

    const estabelecimentoResult = await query(
      `SELECT id, slug, nome, logo_url, banner_url, cor_principal, cor_secundaria,
              cor_botoes, fonte, tema, texto_apresentacao, whatsapp, telefone,
              endereco, instagram, facebook, linkedin, email_contato,
              horario_funcionamento, mp_public_key, ativo, tempo_preparo_min,
              termos_uso, politica_privacidade, cookies
       FROM estabelecimentos WHERE slug = $1`,
      [slug]
    );

    if (estabelecimentoResult.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    const estabelecimento = estabelecimentoResult.rows[0];

    if (!estabelecimento.ativo) {
      return res.status(403).json({ erro: 'Este cardapio esta temporariamente indisponivel.' });
    }

    const categoriasResult = await query(
      'SELECT id, nome, icone_url, ordem FROM categorias WHERE estabelecimento_id = $1 AND ativo = true ORDER BY ordem ASC',
      [estabelecimento.id]
    );

    const produtosResult = await query(
      `SELECT id, categoria_id, codigo, nome, descricao, preco, preco_promocional, foto_url, ordem
       FROM produtos WHERE estabelecimento_id = $1 AND disponivel = true ORDER BY ordem ASC`,
      [estabelecimento.id]
    );

    const promocoesResult = await query(
      `SELECT id, titulo, descricao, imagem_url, produto_id, ordem
       FROM promocoes
       WHERE estabelecimento_id = $1 AND ativo = true
         AND (data_inicio IS NULL OR data_inicio <= NOW())
         AND (data_fim IS NULL OR data_fim >= NOW())
       ORDER BY ordem ASC`,
      [estabelecimento.id]
    );

    const carrosseisResult = await query(
      `SELECT id, nome, posicao, ordem FROM carrosseis
       WHERE estabelecimento_id = $1 AND ativo = true ORDER BY ordem ASC`,
      [estabelecimento.id]
    );

    let carrosselImagens = [];
    if (carrosseisResult.rows.length > 0) {
      const imagensResult = await query(
        `SELECT carrossel_id, imagem_url, ordem, produto_id FROM carrossel_imagens
         WHERE carrossel_id = ANY($1::uuid[]) ORDER BY ordem ASC`,
        [carrosseisResult.rows.map(c => c.id)]
      );
      carrosselImagens = imagensResult.rows;
    }

    const carrosseis = carrosseisResult.rows.map(c => ({
      ...c,
      imagens: carrosselImagens.filter(img => img.carrossel_id === c.id)
    }));

    const vitrinesResult = await query(
      `SELECT id, imagem_url, texto, posicao, ordem, produto_id FROM vitrines
       WHERE estabelecimento_id = $1 AND ativo = true ORDER BY ordem ASC`,
      [estabelecimento.id]
    );

    const caixasTextoResult = await query(
      `SELECT id, titulo, corpo, posicao, ordem FROM caixas_texto
       WHERE estabelecimento_id = $1 AND ativo = true ORDER BY ordem ASC`,
      [estabelecimento.id]
    );

    res.json({
      estabelecimento,
      categorias: categoriasResult.rows,
      produtos: produtosResult.rows,
      promocoes: promocoesResult.rows,
      carrosseis,
      vitrines: vitrinesResult.rows,
      caixasTexto: caixasTextoResult.rows
    });

  } catch (error) {
    console.error('Erro ao buscar estabelecimento:', error);
    res.status(500).json({ erro: 'Erro interno ao buscar dados do estabelecimento.' });
  }
}

async function buscarMeuEstabelecimento(req, res) {
  try {
    const resultado = await query(
      `SELECT id, slug, nome, email, logo_url, banner_url, cor_principal, cor_secundaria,
              cor_botoes, fonte, tema, texto_apresentacao, whatsapp, telefone,
              endereco, instagram, facebook, linkedin, email_contato,
              horario_funcionamento, dominio_proprio,
              mp_public_key, plano, criado_em,
              termos_uso, politica_privacidade, cookies
       FROM estabelecimentos WHERE id = $1`,
      [req.estabelecimentoId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    res.json(resultado.rows[0]);

  } catch (error) {
    console.error('Erro ao buscar estabelecimento (admin):', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function atualizarConfiguracoes(req, res) {
  try {
    const dados = req.body;
    const campos = [];
    const valores = [];
    let indice = 1;

    for (const campo of CAMPOS_EDITAVEIS) {
      if (dados[campo] !== undefined) {
        campos.push(`${campo} = $${indice}`);
        valores.push(
          campo === 'horario_funcionamento' ? JSON.stringify(dados[campo]) : dados[campo]
        );
        indice++;
      }
    }

    if (campos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo valido para atualizar.' });
    }

    valores.push(req.estabelecimentoId);

    const sql = `UPDATE estabelecimentos SET ${campos.join(', ')} WHERE id = $${indice} RETURNING *`;
    const resultado = await query(sql, valores);

    res.json({ mensagem: 'Configuracoes atualizadas com sucesso.', estabelecimento: resultado.rows[0] });

  } catch (error) {
    console.error('Erro ao atualizar configuracoes:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar configuracoes.' });
  }
}

async function uploadLogo(req, res) {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'logos');
    await query('UPDATE estabelecimentos SET logo_url = $1 WHERE id = $2', [url, req.estabelecimentoId]);

    res.json({ mensagem: 'Logo atualizada com sucesso.', logo_url: url });
  } catch (error) {
    console.error('Erro ao enviar logo:', error);
    res.status(500).json({ erro: 'Erro ao enviar imagem.' });
  }
}

async function uploadBanner(req, res) {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'banners');
    await query('UPDATE estabelecimentos SET banner_url = $1 WHERE id = $2', [url, req.estabelecimentoId]);

    res.json({ mensagem: 'Banner atualizado com sucesso.', banner_url: url });
  } catch (error) {
    console.error('Erro ao enviar banner:', error);
    res.status(500).json({ erro: 'Erro ao enviar imagem.' });
  }
}

module.exports = {
  buscarPorSlug,
  buscarMeuEstabelecimento,
  atualizarConfiguracoes,
  uploadLogo,
  uploadBanner
};
