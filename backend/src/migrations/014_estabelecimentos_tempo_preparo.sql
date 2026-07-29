-- Tempo estimado de preparo (minutos), configuravel pelo lojista e
-- exibido ao cliente tanto na retirada quanto no delivery.
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS tempo_preparo_min INT DEFAULT 30;
