-- Equipe operacional (cozinha/entregador) + fila de entrega automatica.
-- disponivel_entrega/ultima_fila_em/total_entregas so tem sentido pra
-- cargo = 'entregador', mas ficam disponiveis na tabela toda por
-- simplicidade (mesmo padrao ja usado pros campos de cadastro completo).
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS disponivel_entrega BOOLEAN DEFAULT true;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS ultima_fila_em TIMESTAMP DEFAULT NOW();
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS total_entregas INT DEFAULT 0;
