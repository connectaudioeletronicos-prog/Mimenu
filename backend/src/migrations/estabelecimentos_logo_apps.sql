-- A coluna "logo_apps_url" (logo usada nos apps internos -- entregador,
-- atendente -- separada do "logo_url" que aparece no cardapio pro cliente)
-- ja esta sendo usada no codigo (estabelecimentoController.js,
-- funcionarioController.js, admin.js) mas nao tinha migration nenhuma
-- criando ela -- ia quebrar com "column logo_apps_url does not exist"
-- assim que qualquer uma dessas rotas fosse chamada.
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS logo_apps_url TEXT;
