-- Agendamento: se publicar_em estiver no futuro, o post fica marcado
-- como publicado=true mas nao aparece nas rotas publicas ate a data
-- chegar (ver WHERE nas queries publicas em blogController.js).
-- Deixar NULL = publica imediatamente, comportamento de sempre.
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS publicar_em TIMESTAMP;

-- Contador de visualizacoes, incrementado a cada vez que alguem abre
-- o post pela rota publica (nao conta quando o admin abre pra editar,
-- que usa uma rota separada).
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS visualizacoes INTEGER NOT NULL DEFAULT 0;
