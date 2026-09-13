-- Modelo hibrido de comissao do entregador: um valor FIXO que ja cobre ate
-- X km, e alem disso soma R$/km excedente. Reaproveita as colunas que ja
-- existiam (valor_por_entrega = valor fixo base, valor_por_km = valor do
-- km excedente) -- so faltava guardar o "X km inclusos no fixo".
-- Exemplo: fixo R$5 cobre ate 3km; entrega de 6km = R$5 + (6-3)*R$2 = R$11.
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS km_incluido_no_fixo NUMERIC(10,2) DEFAULT 0;
