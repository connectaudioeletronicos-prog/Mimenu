-- Nota de 1 a 5 estrelas que o cliente da pro entregador apos a entrega.
-- So a quantidade de estrelas, sem comentario/descricao (conforme pedido).
-- Fica no proprio pedido (um pedido = uma entrega = uma nota possivel).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS avaliacao_entregador SMALLINT
  CHECK (avaliacao_entregador BETWEEN 1 AND 5);
