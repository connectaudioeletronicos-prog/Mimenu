-- Campo de categoria/tag exibido no post (ex.: "Dicas", "Promoções",
-- "Novidades"). Opcional -- quando vazio, o front usa "Blog" como rotulo.
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(60);
