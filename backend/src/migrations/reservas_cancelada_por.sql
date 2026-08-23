-- Distingue reserva recusada pela LOJA (admin aperta "Cancelar") de reserva
-- cancelada pelo proprio CLIENTE (fluxo de autoatendimento em "Minhas
-- reservas"). O status continua sendo so' 'cancelada' nos dois casos --
-- essa coluna nova e' so' pra saber quem tomou a acao, sem mexer em nenhuma
-- logica que ja depende de status = 'cancelada'.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancelada_por VARCHAR(10);
