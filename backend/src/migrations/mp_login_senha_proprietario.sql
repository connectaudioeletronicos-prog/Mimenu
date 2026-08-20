-- Login/senha do proprietario na conta do Mercado Pago (guardado
-- criptografado pela mesma rotina do mp_access_token -- ver
-- backend/src/utils/criptografia.js). Nao confundir com Access
-- Token/Public Key, que sao as credenciais de API; esses dois campos
-- novos sao so o login humano da conta, guardado como conveniencia.
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS mp_login TEXT;
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS mp_senha TEXT;
