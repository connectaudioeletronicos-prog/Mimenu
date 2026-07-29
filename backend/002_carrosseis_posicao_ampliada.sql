-- Permite posicionar carrosseis logo apos uma categoria especifica
-- (formato "apos-categoria:<uuid>"), alem dos pontos fixos de sempre.
ALTER TABLE carrosseis ALTER COLUMN posicao TYPE VARCHAR(80);
ALTER TABLE carrosseis DROP CONSTRAINT IF EXISTS carrosseis_posicao_check;
