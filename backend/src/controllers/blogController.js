// ===================================================================
// Controller do blog publico (palatos.com.br/blog). So o super admin
// publica/edita posts e responde comentarios (protegido pela mesma
// CHAVE_CADASTRO_ADMIN usada no resto do painel). Leitura de posts e
// envio de comentario sao publicos, sem login -- qualquer visitante.
// ===================================================================
const { query } = require('../config/database');
const { uploadImagem } = require('../utils/storage');
const { moderarComentario } = require('../utils/moderacaoComentarios');

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

    const resultado = await query(
      `SELECT id, titulo, slug, resumo, conteudo, categoria, imagem_capa_url, criado_em
       FROM blog_posts
       WHERE publicado = true
       ORDER BY criado_em DESC
       LIMIT $1 OFFSET $2`,
      [limite, offset]
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
       FROM blog_posts WHERE slug = $1 AND publicado = true`,
      [slug]
    );
    if (postRes.rows.length === 0) {
      return res.status(404).json({ erro: 'Post nao encontrado.' });
    }
    const post = postRes.rows[0];

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
      'SELECT id FROM blog_posts WHERE slug = $1 AND publicado = true',
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
      `SELECT p.id, p.titulo, p.slug, p.publicado, p.criado_em, p.atualizado_em,
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

async function criarAdmin(req, res) {
  try {
    const { chaveMestra, titulo, resumo, conteudo, link_url, link_texto, categoria, publicado } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!titulo || !titulo.trim() || !conteudo || !conteudo.trim()) {
      return res.status(400).json({ erro: 'Titulo e conteudo sao obrigatorios.' });
    }

    let imagemUrl = null;
    if (req.file) {
      imagemUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'blog');
    }

    const slug = await gerarSlugUnico(titulo);

    const resultado = await query(
      `INSERT INTO blog_posts (titulo, slug, resumo, conteudo, imagem_capa_url, link_url, link_texto, categoria, publicado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        titulo.trim(), slug, (resumo || '').trim() || null, conteudo.trim(),
        imagemUrl, (link_url || '').trim() || null, (link_texto || '').trim() || null,
        (categoria || '').trim() || null,
        publicado === 'false' ? false : true
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
    const { chaveMestra, titulo, resumo, conteudo, link_url, link_texto, categoria, publicado } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const atualRes = await query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    if (atualRes.rows.length === 0) {
      return res.status(404).json({ erro: 'Post nao encontrado.' });
    }
    const atual = atualRes.rows[0];

    let imagemUrl = atual.imagem_capa_url;
    if (req.file) {
      imagemUrl = await uploadImagem(req.file.buffer, req.file.mimetype, 'blog');
    }

    const novoTitulo = titulo && titulo.trim() ? titulo.trim() : atual.titulo;
    const slug = novoTitulo !== atual.titulo ? await gerarSlugUnico(novoTitulo, id) : atual.slug;

    const resultado = await query(
      `UPDATE blog_posts SET
        titulo = $1, slug = $2, resumo = $3, conteudo = $4, imagem_capa_url = $5,
        link_url = $6, link_texto = $7, categoria = $8, publicado = $9, atualizado_em = NOW()
       WHERE id = $10 RETURNING *`,
      [
        novoTitulo, slug,
        resumo !== undefined ? ((resumo || '').trim() || null) : atual.resumo,
        conteudo && conteudo.trim() ? conteudo.trim() : atual.conteudo,
        imagemUrl,
        link_url !== undefined ? ((link_url || '').trim() || null) : atual.link_url,
        link_texto !== undefined ? ((link_texto || '').trim() || null) : atual.link_texto,
        categoria !== undefined ? ((categoria || '').trim() || null) : atual.categoria,
        publicado !== undefined ? publicado !== 'false' : atual.publicado,
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
       WHERE id = $2 RETURNING id, nome, comentario, resposta_admin, respondido_em, criado_em`,
      [resposta.trim(), id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Comentario nao encontrado.' });
    }
    res.json(resultado.rows[0]);
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

module.exports = {
  listarPublicados, buscarPorSlug, criarComentario,
  listarTodosAdmin, criarAdmin, atualizarAdmin, excluirAdmin,
  listarComentariosAdmin, responderComentarioAdmin, excluirComentarioAdmin
};
