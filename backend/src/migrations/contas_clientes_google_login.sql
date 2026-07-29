-- Permite login com Google na conta do cliente: guarda o ID unico do
-- Google (sub) e libera a senha para ser opcional (quem entra so pelo
-- Google nunca chega a definir uma senha nossa).
ALTER TABLE contas_clientes ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE contas_clientes ALTER COLUMN senha_hash DROP NOT NULL;
