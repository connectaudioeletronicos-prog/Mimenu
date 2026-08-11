-- Codigo sequencial permanente pra cada comanda e cada pedido (rodada).
-- BIGSERIAL cria a sequence e ja preenche sozinho as linhas que ja existem
-- no banco (historico anterior a essa migration tambem ganha codigo, na
-- ordem em que foram criadas) -- nada precisa ser migrado a mao.
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS numero_comanda BIGSERIAL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS numero_pedido BIGSERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comandas_numero_comanda ON comandas(numero_comanda);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_numero_pedido ON pedidos(numero_pedido);

-- Acelera a listagem paginada do historico por funcionario (admin + app
-- do garcom), que agora busca "todas as fechadas de um garcom", nao so as
-- de hoje.
CREATE INDEX IF NOT EXISTS idx_comandas_funcionario_status ON comandas(estabelecimento_id, funcionario_id, status, fechada_em DESC);
