-- A gorjeta (caixinha) que o cliente da no pedido ja existia na tabela
-- pedidos, mas nunca contava pro ganho do entregador nem aparecia separada
-- no resumo do plantao. Esse campo guarda o total de caixinha recebida no
-- plantao (soma das gorjetas dos pedidos entregues nesse plantao).
ALTER TABLE plantoes_entregador ADD COLUMN IF NOT EXISTS total_gorjetas NUMERIC(10,2) DEFAULT 0;
