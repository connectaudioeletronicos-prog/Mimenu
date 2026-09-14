// ===================================================================
// Controller do blog publico (palatos.com.br/blog). So o super admin
// publica/edita posts e responde comentarios (protegido pela mesma
// CHAVE_CADASTRO_ADMIN usada no resto do painel). Leitura de posts e
// envio de comentario sao publicos, sem login -- qualquer visitante.
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');
const { moderarComentario } = require('../utils/moderacaoComentarios');
const { enviarEmailGenerico } = require('../utils/email');
const sharp = require('sharp');

// Comprime e redimensiona imagens do blog antes de subir pro storage
// (capa de post, banner, paginas fixas, imagem inline no texto). Corta
// pro maximo de 1600px de largura e converte pra JPEG de qualidade 82
// -- reduz bastante o peso sem perda visivel, o que ajuda o carregamento
// no celular. So se aplica ao blog; o resto do app (produtos, promocoes
// de loja etc.) continua usando uploadImagem() sem compressao.
async function comprimirImagemBlog(buffer) {
  try {
    return await sharp(buffer)
      .rotate() // corrige orientacao de fotos tiradas com celular (EXIF)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (error) {
    console.error('Falha ao comprimir imagem do blog, enviando original:', error.message);
    return buffer;
  }
}

function chaveValida(chave) {
  return !!chave && chave === process.env.CHAVE_CADASTRO_ADMIN;
}

function gerarSlugBase(titulo) {
  return (titulo || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

// Garante slug unico: "titulo-do-post", "titulo-do-post-2", etc.
async function gerarSlugUnico(titulo, idIgnorar) {
  const base = gerarSlugBase(titulo) || 'post';
  let slug = base;
  let contador = 2;

  while (true) {
    const resultado = await query(
      idIgnorar
        ? 'SELECT id FROM blog_posts WHERE slug = $1 AND id != $2'
        : 'SELECT id FROM blog_posts WHERE slug = $1',
      idIgnorar ? [slug, idIgnorar] : [slug]
    );
    if (resultado.rows.length === 0) return slug;
    slug = `${base}-${contador}`;
    contador += 1;
  }
}

// -------------------------------------------------------------------
// PUBLICO
// -------------------------------------------------------------------

async function listarPublicados(req, res) {
  try {
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite) || 12, 50);
    const offset = (pagina - 1) * limite;
    const busca = (req.query.busca || '').trim();

    const condicaoBusca = busca ? `AND (titulo ILIKE $3 OR resumo ILIKE $3 OR conteudo ILIKE $3)` : '';
    const parametros = busca ? [limite, offset, `%${busca}%`] : [limite, offset];

    const resultado = await query(
      `SELECT id, titulo, slug, resumo, conteudo, categoria, imagem_capa_url, criado_em
       FROM blog_posts
       WHERE publicado = true AND (publicar_em IS NULL OR publicar_em <= NOW()) ${condicaoBusca}
       ORDER BY criado_em DESC
       LIMIT $1 OFFSET $2`,
      parametros
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar posts do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao listar posts.' });
  }
}

async function buscarPorSlug(req, res) {
  try {
    const { slug } = req.params;
    const postRes = await query(
      `SELECT id, titulo, slug, resumo, conteudo, imagem_capa_url, link_url, link_texto, categoria, criado_em
       FROM blog_posts
       WHERE slug = $1 AND publicado = true AND (publicar_em IS NULL OR publicar_em <= NOW())`,
      [slug]
    );
    if (postRes.rows.length === 0) {
      return res.status(404).json({ erro: 'Post nao encontrado.' });
    }
    const post = postRes.rows[0];

    // Conta a visualizacao (so nesta rota publica; a edicao pelo admin
    // usa obterPostAdmin, que nao mexe nesse contador).
    query('UPDATE blog_posts SET visualizacoes = visualizacoes + 1 WHERE id = $1', [post.id])
      .catch(err => console.error('Erro ao contar visualizacao do post:', err));

    const comentariosRes = await query(
      `SELECT id, nome, comentario, resposta_admin, respondido_em, criado_em
       FROM blog_comentarios WHERE post_id = $1 ORDER BY criado_em ASC`,
      [post.id]
    );

    res.json({ ...post, comentarios: comentariosRes.rows });
  } catch (error) {
    console.error('Erro ao buscar post do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao buscar o post.' });
  }
}

// Comentario publico: nome + e-mail (usado tambem como lead) + texto.
// Passa pela moderacao antes de gravar -- se bloqueado, nao fica
// registro nenhum do conteudo (so o motivo generico vai pro log).
async function criarComentario(req, res) {
  try {
    const { slug } = req.params;
    const { nome, email, comentario } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'Informe seu nome.' });
    }
    const emailLimpo = (email || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ erro: 'Informe um e-mail valido.' });
    }
    if (!comentario || !comentario.trim()) {
      return res.status(400).json({ erro: 'Escreva um comentario.' });
    }

    const postRes = await query(
      'SELECT id, titulo, slug FROM blog_posts WHERE slug = $1 AND publicado = true',
      [slug]
    );
    if (postRes.rows.length === 0) {
      return res.status(404).json({ erro: 'Post nao encontrado.' });
    }

    const motivoBloqueio = await moderarComentario(comentario);
    if (motivoBloqueio) {
      return res.status(400).json({ erro: motivoBloqueio });
    }

    const resultado = await query(
      `INSERT INTO blog_comentarios (post_id, nome, email, comentario)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, comentario, resposta_admin, respondido_em, criado_em`,
      [postRes.rows[0].id, nome.trim(), emailLimpo, comentario.trim()]
    );

    // Avisa o admin por e-mail que chegou comentario novo -- nao bloqueia
    // a resposta pro visitante se o e-mail falhar ou nao estiver configurado.
    const emailAdmin = process.env.EMAIL_ADMIN_BLOG || process.env.RESEND_REPLY_TO || 'palatosoficial@gmail.com';
    enviarEmailGenerico(
      emailAdmin, null,
      `Novo comentário no blog: ${postRes.rows[0].titulo}`,
      `${nome.trim()} comentou no post "${postRes.rows[0].titulo}":\n\n"${comentario.trim()}"\n\nResponda pelo painel do blog: https://palatos.com.br/blog/${postRes.rows[0].slug}`
    ).catch(err => console.error('Erro ao avisar admin sobre comentario novo:', err));

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar comentario do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao publicar o comentario.' });
  }
}

// -------------------------------------------------------------------
// ADMIN (super admin, protegido por chaveMestra)
// -------------------------------------------------------------------

async function listarTodosAdmin(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `SELECT p.id, p.titulo, p.slug, p.publicado, p.publicar_em, p.visualizacoes, p.criado_em, p.atualizado_em,
              COUNT(c.id)::int AS total_comentarios
       FROM blog_posts p
       LEFT JOIN blog_comentarios c ON c.post_id = p.id
       GROUP BY p.id
       ORDER BY p.criado_em DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar posts (admin):', error);
    res.status(500).json({ erro: 'Erro interno ao listar posts.' });
  }
}

// Busca o post completo por id pra edicao no admin -- separada da rota
// publica (buscarPorSlug) justamente pra nao contar visualizacao toda
// vez que o admin abre um post pra editar.
async function obterPostAdmin(req, res) {
  try {
    const { id } = req.params;
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    const resultado = await query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Post nao encontrado.' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao obter post (admin):', error);
    res.status(500).json({ erro: 'Erro interno ao obter o post.' });
  }
}

async function criarAdmin(req, res) {
  try {
    const { chaveMestra, titulo, resumo, conteudo, link_url, link_texto, categoria, publicado, publicar_em } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!titulo || !titulo.trim() || !conteudo || !conteudo.trim()) {
      return res.status(400).json({ erro: 'Titulo e conteudo sao obrigatorios.' });
    }

    let imagemUrl = null;
    if (req.file) {
      imagemUrl = await uploadImagem(await comprimirImagemBlog(req.file.buffer), 'image/jpeg', 'blog');
    }

    const slug = await gerarSlugUnico(titulo);

    const resultado = await query(
      `INSERT INTO blog_posts (titulo, slug, resumo, conteudo, imagem_capa_url, link_url, link_texto, categoria, publicado, publicar_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        titulo.trim(), slug, (resumo || '').trim() || null, conteudo.trim(),
        imagemUrl, (link_url || '').trim() || null, (link_texto || '').trim() || null,
        (categoria || '').trim() || null,
        publicado === 'false' ? false : true,
        (publicar_em || '').trim() || null
      ]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao criar post do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao criar o post.' });
  }
}

async function atualizarAdmin(req, res) {
  try {
    const { id } = req.params;
    const { chaveMestra, titulo, resumo, conteudo, link_url, link_texto, categoria, publicado, publicar_em } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const atualRes = await query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    if (atualRes.rows.length === 0) {
      return res.status(404).json({ erro: 'Post nao encontrado.' });
    }
    const atual = atualRes.rows[0];

    // Guarda uma "foto" da versao anterior antes de sobrescrever.
    await query(
      'INSERT INTO blog_posts_historico (post_id, titulo, conteudo) VALUES ($1, $2, $3)',
      [atual.id, atual.titulo, atual.conteudo]
    );

    let imagemUrl = atual.imagem_capa_url;
    if (req.file) {
      imagemUrl = await uploadImagem(await comprimirImagemBlog(req.file.buffer), 'image/jpeg', 'blog');
    }

    const novoTitulo = titulo && titulo.trim() ? titulo.trim() : atual.titulo;
    const slug = novoTitulo !== atual.titulo ? await gerarSlugUnico(novoTitulo, id) : atual.slug;

    const resultado = await query(
      `UPDATE blog_posts SET
        titulo = $1, slug = $2, resumo = $3, conteudo = $4, imagem_capa_url = $5,
        link_url = $6, link_texto = $7, categoria = $8, publicado = $9, publicar_em = $10, atualizado_em = NOW()
       WHERE id = $11 RETURNING *`,
      [
        novoTitulo, slug,
        resumo !== undefined ? ((resumo || '').trim() || null) : atual.resumo,
        conteudo && conteudo.trim() ? conteudo.trim() : atual.conteudo,
        imagemUrl,
        link_url !== undefined ? ((link_url || '').trim() || null) : atual.link_url,
        link_texto !== undefined ? ((link_texto || '').trim() || null) : atual.link_texto,
        categoria !== undefined ? ((categoria || '').trim() || null) : atual.categoria,
        publicado !== undefined ? publicado !== 'false' : atual.publicado,
        publicar_em !== undefined ? ((publicar_em || '').trim() || null) : atual.publicar_em,
        id
      ]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar post do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar o post.' });
  }
}

async function excluirAdmin(req, res) {
  try {
    const { id } = req.params;
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    await query('DELETE FROM blog_posts WHERE id = $1', [id]);
    res.json({ mensagem: 'Post excluido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir post do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir o post.' });
  }
}

// Lista comentarios de um post especifico, pro super admin poder ler
// e decidir se responde ou exclui (spam que passou pela moderacao).
async function listarComentariosAdmin(req, res) {
  try {
    const { postId } = req.params;
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    const resultado = await query(
      `SELECT id, nome, email, comentario, resposta_admin, respondido_em, criado_em
       FROM blog_comentarios WHERE post_id = $1 ORDER BY criado_em ASC`,
      [postId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar comentarios (admin):', error);
    res.status(500).json({ erro: 'Erro interno ao listar comentarios.' });
  }
}

async function responderComentarioAdmin(req, res) {
  try {
    const { id } = req.params;
    const { chaveMestra, resposta } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!resposta || !resposta.trim()) {
      return res.status(400).json({ erro: 'Escreva uma resposta.' });
    }
    const resultado = await query(
      `UPDATE blog_comentarios SET resposta_admin = $1, respondido_em = NOW()
       WHERE id = $2 RETURNING id, post_id, nome, email, comentario, resposta_admin, respondido_em, criado_em`,
      [resposta.trim(), id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Comentario nao encontrado.' });
    }

    // Avisa quem comentou que a resposta chegou -- nao bloqueia a resposta
    // pro admin se o e-mail falhar ou nao estiver configurado.
    const comentario = resultado.rows[0];
    query('SELECT slug, titulo FROM blog_posts WHERE id = $1', [comentario.post_id])
      .then(postRes => {
        const post = postRes.rows[0];
        if (!post) return;
        return enviarEmailGenerico(
          comentario.email, comentario.nome,
          `Você recebeu uma resposta no blog Palatos`,
          `O Palatos respondeu ao seu comentário no post "${post.titulo}":\n\n"${resposta.trim()}"\n\nVeja a conversa completa: https://palatos.com.br/blog/${post.slug}`
        );
      })
      .catch(err => console.error('Erro ao avisar autor do comentario sobre resposta:', err));

    const { email, ...comentarioSemEmail } = comentario;
    res.json(comentarioSemEmail);
  } catch (error) {
    console.error('Erro ao responder comentario do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao responder o comentario.' });
  }
}

async function excluirComentarioAdmin(req, res) {
  try {
    const { id } = req.params;
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    await query('DELETE FROM blog_comentarios WHERE id = $1', [id]);
    res.json({ mensagem: 'Comentario excluido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir comentario do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir o comentario.' });
  }
}

// -------------------------------------------------------------------
// Configuracoes do blog (redes sociais -- global, nao e por post)
// -------------------------------------------------------------------

async function obterConfiguracoes(req, res) {
  try {
    const resultado = await query(
      `SELECT facebook, instagram, youtube, tiktok,
              cabecalho_titulo, cabecalho_tagline,
              hero_titulo, hero_apresentacao, hero_imagem_url,
              hero_caixa_titulo, hero_caixa_corpo, hero_botao_texto, hero_botao_link
       FROM blog_configuracoes WHERE id = 1`
    );
    res.json(resultado.rows[0] || {});
  } catch (error) {
    console.error('Erro ao obter configuracoes do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao obter configuracoes.' });
  }
}

async function atualizarConfiguracoesAdmin(req, res) {
  try {
    const {
      chaveMestra, facebook, instagram, youtube, tiktok,
      cabecalho_titulo, cabecalho_tagline,
      hero_titulo, hero_apresentacao, hero_imagem_url,
      hero_caixa_titulo, hero_caixa_corpo, hero_botao_texto, hero_botao_link
    } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    const limpar = (v) => (v || '').toString().trim() || null;
    const resultado = await query(
      `UPDATE blog_configuracoes SET
        facebook = $1, instagram = $2, youtube = $3, tiktok = $4,
        cabecalho_titulo = $5, cabecalho_tagline = $6,
        hero_titulo = $7, hero_apresentacao = $8, hero_imagem_url = $9,
        hero_caixa_titulo = $10, hero_caixa_corpo = $11, hero_botao_texto = $12, hero_botao_link = $13,
        atualizado_em = NOW()
       WHERE id = 1
       RETURNING facebook, instagram, youtube, tiktok,
                 cabecalho_titulo, cabecalho_tagline,
                 hero_titulo, hero_apresentacao, hero_imagem_url,
                 hero_caixa_titulo, hero_caixa_corpo, hero_botao_texto, hero_botao_link`,
      [
        limpar(facebook), limpar(instagram), limpar(youtube), limpar(tiktok),
        limpar(cabecalho_titulo) || 'Nosso Blog', limpar(cabecalho_tagline) || 'Dicas, novidades e muito mais!',
        limpar(hero_titulo), limpar(hero_apresentacao), limpar(hero_imagem_url),
        limpar(hero_caixa_titulo), limpar(hero_caixa_corpo), limpar(hero_botao_texto), limpar(hero_botao_link)
      ]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar configuracoes do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar configuracoes.' });
  }
}

// -------------------------------------------------------------------
// Paginas fixas (Sobre nos / Contato)
// -------------------------------------------------------------------

const TIPOS_PAGINA_VALIDOS = ['sobre-nos', 'contato', 'termos-servico', 'politica-privacidade'];

async function obterPagina(req, res) {
  try {
    const { tipo } = req.params;
    if (!TIPOS_PAGINA_VALIDOS.includes(tipo)) {
      return res.status(404).json({ erro: 'Pagina nao encontrada.' });
    }
    const resultado = await query('SELECT id, titulo, conteudo, imagem_url, atualizado_em FROM blog_paginas WHERE id = $1', [tipo]);
    if (resultado.rows.length === 0 || !resultado.rows[0].conteudo) {
      return res.status(404).json({ erro: 'Esta pagina ainda nao foi configurada.' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao obter pagina do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao obter a pagina.' });
  }
}

async function atualizarPaginaAdmin(req, res) {
  try {
    const { tipo } = req.params;
    const { chaveMestra, titulo, conteudo, imagem_url } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!TIPOS_PAGINA_VALIDOS.includes(tipo)) {
      return res.status(404).json({ erro: 'Pagina nao encontrada.' });
    }
    const resultado = await query(
      `UPDATE blog_paginas SET titulo = $1, conteudo = $2, imagem_url = $3, atualizado_em = NOW()
       WHERE id = $4 RETURNING id, titulo, conteudo, imagem_url`,
      [(titulo || '').trim() || null, (conteudo || '').trim() || null, (imagem_url || '').trim() || null, tipo]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar pagina do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar a pagina.' });
  }
}

// Upload avulso de imagem pra inserir no meio do texto do post (o
// admin cola o markdown "![](url)" retornado na posicao que quiser
// dentro do conteudo -- ver blog.html, botao "Inserir imagem no texto").
async function enviarImagemAdmin(req, res) {
  try {
    const { chaveMestra } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });
    }
    const url = await uploadImagem(await comprimirImagemBlog(req.file.buffer), 'image/jpeg', 'blog');
    res.json({ url });
  } catch (error) {
    console.error('Erro ao enviar imagem do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao enviar a imagem.' });
  }
}

// -------------------------------------------------------------------
// Sitemap (SEO) -- lista posts publicados + paginas fixas do blog.
// -------------------------------------------------------------------

async function gerarSitemap(req, res) {
  try {
    const resultado = await query(
      `SELECT slug, atualizado_em, criado_em FROM blog_posts WHERE publicado = true ORDER BY criado_em DESC`
    );

    const baseUrl = 'https://palatos.com.br';
    const paginasFixas = [
      { loc: `${baseUrl}/blog`, prioridade: '0.8' },
      { loc: `${baseUrl}/blog/sobre-nos`, prioridade: '0.5' },
      { loc: `${baseUrl}/blog/contato`, prioridade: '0.5' },
      { loc: `${baseUrl}/termos-servico.html`, prioridade: '0.3' },
      { loc: `${baseUrl}/politica-privacidade.html`, prioridade: '0.3' }
    ];

    const itensPosts = resultado.rows.map(post => `
  <url>
    <loc>${baseUrl}/blog/${encodeURIComponent(post.slug)}</loc>
    <lastmod>${new Date(post.atualizado_em || post.criado_em).toISOString().slice(0, 10)}</lastmod>
    <priority>0.6</priority>
  </url>`).join('');

    const itensFixos = paginasFixas.map(p => `
  <url>
    <loc>${p.loc}</loc>
    <priority>${p.prioridade}</priority>
  </url>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${itensFixos}${itensPosts}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Erro ao gerar sitemap do blog:', error);
    res.status(500).send('Erro ao gerar sitemap.');
  }
}

// -------------------------------------------------------------------
// Newsletter (so captura o e-mail; disparo fica pra depois)
// -------------------------------------------------------------------

async function inscreverNewsletter(req, res) {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erro: 'Informe um e-mail valido.' });
    }
    await query(
      'INSERT INTO blog_newsletter (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
      [email]
    );
    res.status(201).json({ mensagem: 'Inscricao confirmada.' });
  } catch (error) {
    console.error('Erro ao inscrever na newsletter:', error);
    res.status(500).json({ erro: 'Erro interno ao se inscrever.' });
  }
}

async function listarNewsletterAdmin(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    const resultado = await query('SELECT email, criado_em FROM blog_newsletter ORDER BY criado_em DESC');
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar newsletter:', error);
    res.status(500).json({ erro: 'Erro interno ao listar inscritos.' });
  }
}

// -------------------------------------------------------------------
// Historico de edicoes
// -------------------------------------------------------------------

async function listarHistoricoAdmin(req, res) {
  try {
    const { id } = req.params;
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    const resultado = await query(
      'SELECT id, titulo, conteudo, alterado_em FROM blog_posts_historico WHERE post_id = $1 ORDER BY alterado_em DESC',
      [id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar historico do post:', error);
    res.status(500).json({ erro: 'Erro interno ao listar historico.' });
  }
}

// -------------------------------------------------------------------
// Analytics simples
// -------------------------------------------------------------------

async function obterAnalyticsAdmin(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const totaisRes = await query(`
      SELECT
        (SELECT COUNT(*) FROM blog_posts WHERE publicado = true)::int AS total_posts,
        (SELECT COALESCE(SUM(visualizacoes),0) FROM blog_posts)::int AS total_visualizacoes,
        (SELECT COUNT(*) FROM blog_comentarios)::int AS total_comentarios,
        (SELECT COUNT(*) FROM blog_newsletter)::int AS total_inscritos
    `);
    const maisVistosRes = await query(`
      SELECT titulo, slug, visualizacoes FROM blog_posts
      WHERE publicado = true ORDER BY visualizacoes DESC LIMIT 5
    `);

    res.json({ ...totaisRes.rows[0], mais_vistos: maisVistosRes.rows });
  } catch (error) {
    console.error('Erro ao obter analytics do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao obter analytics.' });
  }
}

// -------------------------------------------------------------------
// RSS
// -------------------------------------------------------------------

async function gerarRSS(req, res) {
  try {
    const resultado = await query(
      `SELECT titulo, slug, resumo, conteudo, criado_em FROM blog_posts
       WHERE publicado = true AND (publicar_em IS NULL OR publicar_em <= NOW())
       ORDER BY criado_em DESC LIMIT 30`
    );
    const baseUrl = 'https://palatos.com.br';

    const escaparXml = (texto) => (texto || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const itens = resultado.rows.map(post => `
  <item>
    <title>${escaparXml(post.titulo)}</title>
    <link>${baseUrl}/blog/${encodeURIComponent(post.slug)}</link>
    <guid>${baseUrl}/blog/${encodeURIComponent(post.slug)}</guid>
    <pubDate>${new Date(post.criado_em).toUTCString()}</pubDate>
    <description>${escaparXml(post.resumo || (post.conteudo || '').slice(0, 200))}</description>
  </item>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Blog Palatos</title>
  <link>${baseUrl}/blog</link>
  <description>Novidades, dicas e conteúdo do blog Palatos.</description>
  <language>pt-BR</language>${itens}
</channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml');
    res.send(xml);
  } catch (error) {
    console.error('Erro ao gerar RSS do blog:', error);
    res.status(500).send('Erro ao gerar RSS.');
  }
}

// -------------------------------------------------------------------
// Exportar posts (backup simples em JSON)
// -------------------------------------------------------------------

async function exportarPostsAdmin(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    const resultado = await query('SELECT * FROM blog_posts ORDER BY criado_em DESC');
    res.set('Content-Disposition', 'attachment; filename="posts-blog-palatos.json"');
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao exportar posts do blog:', error);
    res.status(500).json({ erro: 'Erro interno ao exportar posts.' });
  }
}

module.exports = {
  listarPublicados, buscarPorSlug, criarComentario,
  listarTodosAdmin, obterPostAdmin, criarAdmin, atualizarAdmin, excluirAdmin,
  listarComentariosAdmin, responderComentarioAdmin, excluirComentarioAdmin,
  obterConfiguracoes, atualizarConfiguracoesAdmin, enviarImagemAdmin,
  obterPagina, atualizarPaginaAdmin, gerarSitemap,
  inscreverNewsletter, listarNewsletterAdmin, listarHistoricoAdmin, obterAnalyticsAdmin,
  gerarRSS, exportarPostsAdmin
};
