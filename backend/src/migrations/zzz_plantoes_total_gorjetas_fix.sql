-- ===================================================================
-- Correcao: garante a coluna total_gorjetas em entregador.plantoes_entregador
-- ---------------------------------------------------------------------
-- A migration "plantoes_entregador_gorjetas.sql" deveria ter adicionado
-- essa coluna, mas o log de producao mostrou "column total_gorjetas does
-- not exist" -- ou seja, ela nunca rodou nesse banco (o arquivo
-- provavelmente ficou de fora do deploy).
--
-- Esse arquivo e seguro de rodar de novo mesmo que a coluna ja exista
-- (ADD COLUMN IF NOT EXISTS e idempotente), e usa o nome JA qualificado
-- com o schema "entregador" (diferente da migration original, que rodava
-- antes da tabela ser movida pra esse schema).
-- ===================================================================

ALTER TABLE entregador.plantoes_entregador
  ADD COLUMN IF NOT EXISTS total_gorjetas NUMERIC(10,2) DEFAULT 0;
