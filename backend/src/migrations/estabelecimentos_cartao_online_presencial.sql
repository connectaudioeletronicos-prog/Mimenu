-- Permite que o lojista escolha se quer aceitar cartao de credito/debito
-- cobrado ONLINE pelo Mercado Pago no atendimento presencial (comanda do
-- garcom/caixa), ou se prefere manter como e hoje: essas formas so ficam
-- registradas no sistema, assumindo que o pagamento de verdade aconteceu
-- numa maquininha fisica separada.
--
-- Delivery/retirada (pedido feito pelo cliente no app) NAO usa essa chave --
-- la, cartao e pix ja sao sempre cobrados online, direto no momento do
-- pedido, entao o entregador nunca precisa de maquininha.
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS cartao_online_presencial BOOLEAN DEFAULT false;
