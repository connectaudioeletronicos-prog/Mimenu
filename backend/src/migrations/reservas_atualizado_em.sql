-- Guarda quando a reserva foi confirmada/recusada pela loja (alem de
-- 'criado_em', que ja guarda quando o CLIENTE solicitou). Sem essa coluna
-- nao da pra mostrar pro cliente "solicitada em X, confirmada em Y".
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP;
