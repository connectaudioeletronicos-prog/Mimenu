// ===================================================================
// Controller de estabelecimentos
// Lida com dados publicos (cardapio) e configuracoes (painel admin)
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');
const { criptografar } = require('../utils/criptografia');
const bcrypt = require('bcrypt');

const CAMPOS_EDITAVEIS = [
  'nome', 'cor_principal', 'cor_secundaria', 'cor_botoes', 'fonte', 'tema',
  'texto_apresentacao', 'whatsapp', 'telefone', 'endereco', 'instagram',
  'facebook', 'linkedin', 'email_contato', 'horario_funcionamento',
  'mp_access_token', 'mp_public_key', 'tempo_preparo_min', 'cartao_online_presencial',
  'termos_uso', 'politica_privacidade', 'cookies'
];

async function buscarPorSlug(req, res) {
  try {
    const { slug } = req.params;

    const estabelecimentoResult = await query(
      `SELECT id, slug, nome, logo_url, logo_apps_url, banner_url, cor_principal, cor_secundaria,
              cor_botoes, fonte, tema, texto_apresentacao, whatsapp, telefone,
              endereco, instagram, facebook, linkedin, email_contato,
              horario_funcionamento, mp_public_key, ativo, tempo_preparo_min,
              termos_uso, politica_privacidade, cookies, reserva_mesa_ativa
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
      `SELECT id, slug, nome, email, logo_url, logo_apps_url, banner_url, cor_principal, cor_secundaria,
              cor_botoes, fonte, tema, texto_apresentacao, whatsapp, telefone,
              endereco, instagram, facebook, linkedin, email_contato,
              horario_funcionamento, dominio_proprio,
              mp_public_key, plano, criado_em,
              termos_uso, politica_privacidade, cookies, reserva_mesa_ativa,
              estoque_modulo_ativo, estoque_senha_protegida, pagamento_senha_protegida
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
        let valor = dados[campo];
        if (campo === 'horario_funcionamento') valor = JSON.stringify(valor);
        // Access Token do Mercado Pago e sensivel (da acesso ao dinheiro da
        // loja) -- nunca fica em texto puro no banco. Ver utils/criptografia.js.
        if (campo === 'mp_access_token') valor = criptografar(valor);
        valores.push(valor);
        indice++;
      }
    }

    if (campos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo valido para atualizar.' });
    }

    valores.push(req.estabelecimentoId);

    const sql = `UPDATE estabelecimentos SET ${campos.join(', ')} WHERE id = $${indice} RETURNING *`;
    const resultado = await query(sql, valores);

    // Mesmo criptografado, o token nunca deve voltar na resposta da API --
    // o frontend ja limpa o campo localmente apos salvar (admin.js) e nao
    // precisa desse valor de volta.
    const estabelecimentoAtualizado = resultado.rows[0];
    delete estabelecimentoAtualizado.mp_access_token;

    res.json({ mensagem: 'Configuracoes atualizadas com sucesso.', estabelecimento: estabelecimentoAtualizado });

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

async function uploadLogoApps(req, res) {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'logos-apps');
    await query('UPDATE estabelecimentos SET logo_apps_url = $1 WHERE id = $2', [url, req.estabelecimentoId]);

    res.json({ mensagem: 'Logo dos apps atualizada com sucesso.', logo_apps_url: url });
  } catch (error) {
    console.error('Erro ao enviar logo dos apps:', error);
    res.status(500).json({ erro: 'Erro ao enviar imagem.' });
  }
}

// ---------- Protecao por senha da tela de Pagamentos ----------
// Mesmo esquema ja usado no Controle de Estoque (ver estoqueController.js):
// usa a PROPRIA senha de login do estabelecimento (senha_hash) pra travar
// o acesso a essa tela -- objetivo e impedir que qualquer funcionario com
// acesso ao painel abra Pagamentos sem querer (ou de proposito) e veja as
// chaves do Mercado Pago, ou ligue/desligue "cobrar cartao online" por
// engano.
async function verificarSenhaPagamento(req, res) {
  try {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Informe a senha.' });

    const resultado = await query('SELECT senha_hash FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const senhaCorreta = await bcrypt.compare(senha, resultado.rows[0].senha_hash);
    if (!senhaCorreta) return res.status(401).json({ valido: false, erro: 'Senha incorreta.' });

    res.json({ valido: true });
  } catch (error) {
    console.error('Erro ao verificar senha da tela de pagamento:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function alternarProtecaoSenhaPagamento(req, res) {
  try {
    const { ativo, senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Confirme sua senha para alterar essa configuracao.' });

    const resultado = await query('SELECT senha_hash FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });

    const senhaCorreta = await bcrypt.compare(senha, resultado.rows[0].senha_hash);
    if (!senhaCorreta) return res.status(401).json({ erro: 'Senha incorreta.' });

    await query('UPDATE estabelecimentos SET pagamento_senha_protegida = $1 WHERE id = $2', [!!ativo, req.estabelecimentoId]);
    res.json({ mensagem: ativo ? 'Protecao por senha ativada.' : 'Protecao por senha desativada.' });
  } catch (error) {
    console.error('Erro ao alternar protecao por senha de pagamento:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = {
  buscarPorSlug,
  buscarMeuEstabelecimento,
  atualizarConfiguracoes,
  uploadLogo,
  uploadLogoApps,
  uploadBanner,
  verificarSenhaPagamento,
  alternarProtecaoSenhaPagamento
};
