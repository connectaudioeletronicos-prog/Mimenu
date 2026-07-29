-- Mesmo motivo da migration 002, aplicado a caixas de texto.
ALTER TABLE caixas_texto ALTER COLUMN posicao TYPE VARCHAR(80);
ALTER TABLE caixas_texto DROP CONSTRAINT IF EXISTS caixas_texto_posicao_check;
