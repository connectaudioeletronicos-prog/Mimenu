-- Prepara o terreno pra outros bancos/provedores no futuro (hoje so existe
-- 'mercadopago', mas o dispatcher em backend/src/utils/pagamentos/index.js
-- ja le essa coluna pra decidir qual arquivo usar).
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS provedor_pagamento VARCHAR(30) DEFAULT 'mercadopago';
