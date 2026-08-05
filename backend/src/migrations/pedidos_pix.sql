-- Colunas necessarias pra integracao real de Pix via Mercado Pago.
-- Seguro rodar de novo (IF NOT EXISTS em tudo).

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(60);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;           -- codigo "copia e cola"
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_qr_code_base64 TEXT;    -- imagem do QR, pronta pra <img src="data:image/png;base64,...">
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pix_expira_em TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_pedidos_mp_payment_id ON pedidos(mp_payment_id);
