-- Redes sociais do blog: config global (uma linha so, id fixo = 1), nao
-- e por post. O front so mostra o icone de cada rede se o campo estiver
-- preenchido -- por isso todos aceitam NULL.
CREATE TABLE IF NOT EXISTS blog_configuracoes (
  id INTEGER PRIMARY KEY DEFAULT 1,
  facebook TEXT,
  instagram TEXT,
  youtube TEXT,
  tiktok TEXT,
  atualizado_em TIMESTAMP DEFAULT NOW(),
  CONSTRAINT blog_configuracoes_singleton CHECK (id = 1)
);
INSERT INTO blog_configuracoes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
