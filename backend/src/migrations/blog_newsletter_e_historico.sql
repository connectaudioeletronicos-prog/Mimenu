-- Newsletter: captura de e-mail de quem quer ser avisado de posts
-- novos. So captura -- o envio em si (quando voce decidir disparar)
-- fica pra depois, reaproveitando o Resend que ja existe no projeto.
CREATE TABLE IF NOT EXISTS blog_newsletter (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(150) NOT NULL UNIQUE,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Historico de edicoes: guarda um "antes" do titulo/conteudo toda vez
-- que um post e atualizado pelo admin, pra dar pra ver o que mudou e
-- quando. Nao e um diff, e uma foto de cada versao anterior.
CREATE TABLE IF NOT EXISTS blog_posts_historico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  titulo VARCHAR(200),
  conteudo TEXT,
  alterado_em TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_historico_post ON blog_posts_historico(post_id, alterado_em DESC);
