-- Pedido agendado: recurso opcional por loja. Se ativo, o cliente pode
-- agendar um pedido (retirada ou entrega) pra um horario especifico,
-- inclusive fora do funcionamento normal da loja -- mas so e confirmado
-- apos pagamento online (sem opcao de pagar na entrega/retirada).
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS pedido_agendado_ativo BOOLEAN DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMP;
