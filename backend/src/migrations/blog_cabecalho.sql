-- Titulo e "tagline" do cabecalho do blog publico, hoje fixos no HTML.
-- Ficam com valor padrao pra quem ja tem o blog no ar nao ver o
-- cabecalho vazio antes de configurar.
ALTER TABLE blog_configuracoes
  ADD COLUMN IF NOT EXISTS cabecalho_titulo VARCHAR(100) DEFAULT 'Nosso Blog',
  ADD COLUMN IF NOT EXISTS cabecalho_tagline VARCHAR(150) DEFAULT 'Dicas, novidades e muito mais!';

UPDATE blog_configuracoes
  SET cabecalho_titulo = COALESCE(cabecalho_titulo, 'Nosso Blog'),
      cabecalho_tagline = COALESCE(cabecalho_tagline, 'Dicas, novidades e muito mais!')
  WHERE id = 1;
