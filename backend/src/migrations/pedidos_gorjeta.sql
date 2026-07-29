-- Pedido para retirar no local usa a coluna tipo_pedido que ja existia
-- (valor 'retirada', ao lado do 'entrega' que ja era o padrao). Gorjeta
-- e nova: opcional, informada pelo cliente no fechamento do pedido.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS gorjeta NUMERIC(10,2) DEFAULT 0;
