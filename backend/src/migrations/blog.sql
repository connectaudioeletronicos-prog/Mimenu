-- ===================================================================
-- Blog publico do super admin (palatos.com.br/blog). Qualquer pessoa
-- le e comenta, sem precisar de conta -- so o super admin publica
-- posts e responde comentarios (protegido pela mesma CHAVE_CADASTRO_ADMIN
-- ja usada no resto do painel super-admin).
--
-- link_url/link_texto sao opcionais: quando presentes, viram um botao
-- no post (ex.: "Ver cardapio da Loja Teste") que manda o leitor pra
-- uma loja/produto especifico. Sem eles, o post fica so informativo,
-- sem levar a lugar nenhum dentro do app.
-- ===================================================================
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  resumo TEXT,
  conteudo TEXT NOT NULL,
  imagem_capa_url TEXT,
  link_url TEXT,
  link_texto VARCHAR(100),
  publicado BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_publicado ON blog_posts(publicado, criado_em DESC);

-- Comentario publico (tipo YouTube): qualquer leitor comenta informando
-- nome + e-mail (usado tambem como lead, nao exibido publicamente).
-- Aparece na hora pros outros leitores (sem fila de aprovacao), mas
-- passa antes pela moderacao automatica (spam + Perspective API) --
-- ver backend/src/utils/moderacaoComentarios.js. So o super admin
-- responde (resposta_admin); ninguem mais tem esse acesso.
CREATE TABLE IF NOT EXISTS blog_comentarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  comentario TEXT NOT NULL,
  resposta_admin TEXT,
  respondido_em TIMESTAMP,
  criado_em TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_comentarios_post ON blog_comentarios(post_id, criado_em ASC);
