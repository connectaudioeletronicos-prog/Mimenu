-- A migration anterior (blog_paginas_legais.sql) gravou o titulo como
-- "Termos de Servico". Padronizando para "Termos de Uso", que e o nome
-- usado em todo o resto do blog (menu, rodape). So corrige se o titulo
-- ainda estiver com o nome antigo -- nao sobrescreve se voce ja tiver
-- editado manualmente pelo painel.
UPDATE blog_paginas
  SET titulo = 'Termos de Uso', atualizado_em = NOW()
  WHERE id = 'termos-servico' AND titulo = 'Termos de Serviço';
