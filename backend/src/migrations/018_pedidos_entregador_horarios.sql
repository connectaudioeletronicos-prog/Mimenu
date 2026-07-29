-- Pedido saiu para entrega -> atribuido automaticamente ao proximo
-- entregador da fila (por ordem de chegada). Guarda quem ficou responsavel
-- e os horarios de "pronto" e "saiu para entrega" pra rastreio/relatorios.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregador_id UUID REFERENCES funcionarios(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregador_nome VARCHAR(150);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS horario_pronto TIMESTAMP;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS horario_saiu_entrega TIMESTAMP;
