-- Banner da home do blog (hero). Tudo opcional -- se os campos
-- estiverem vazios, o front simplesmente nao mostra o banner.
--   hero_titulo         -> cabecalho principal (texto grande)
--   hero_apresentacao   -> paragrafo de apresentacao, abaixo do titulo
--   hero_imagem_url     -> imagem de fundo do banner
--   hero_caixa_titulo   -> titulo da caixa de texto que fica sobreposta na imagem
--   hero_caixa_corpo    -> corpo da caixa de texto sobreposta
--   hero_botao_texto    -> texto do botao (tambem sobreposto)
--   hero_botao_link     -> destino do botao -- aceita link interno
--                          (ex: /blog/nome-do-post) ou externo (https://...)
ALTER TABLE blog_configuracoes
  ADD COLUMN IF NOT EXISTS hero_titulo VARCHAR(200),
  ADD COLUMN IF NOT EXISTS hero_apresentacao TEXT,
  ADD COLUMN IF NOT EXISTS hero_imagem_url TEXT,
  ADD COLUMN IF NOT EXISTS hero_caixa_titulo VARCHAR(200),
  ADD COLUMN IF NOT EXISTS hero_caixa_corpo TEXT,
  ADD COLUMN IF NOT EXISTS hero_botao_texto VARCHAR(100),
  ADD COLUMN IF NOT EXISTS hero_botao_link TEXT;

-- Paginas fixas do blog (Sobre nos / Contato). Reaproveita o mesmo
-- "markdown" leve dos posts (## subtitulo, ![](url) pra imagem no meio
-- do texto). O "id" e o proprio tipo da pagina, nao um uuid.
CREATE TABLE IF NOT EXISTS blog_paginas (
  id VARCHAR(30) PRIMARY KEY,
  titulo VARCHAR(200),
  conteudo TEXT,
  imagem_url TEXT,
  atualizado_em TIMESTAMP DEFAULT NOW()
);
INSERT INTO blog_paginas (id) VALUES ('sobre-nos') ON CONFLICT (id) DO NOTHING;
INSERT INTO blog_paginas (id) VALUES ('contato') ON CONFLICT (id) DO NOTHING;
