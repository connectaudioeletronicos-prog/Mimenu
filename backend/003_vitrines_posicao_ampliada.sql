-- Mesmo motivo da migration 002, aplicado a vitrines.
ALTER TABLE vitrines ALTER COLUMN posicao TYPE VARCHAR(80);
ALTER TABLE vitrines DROP CONSTRAINT IF EXISTS vitrines_posicao_check;
