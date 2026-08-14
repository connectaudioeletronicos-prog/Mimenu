-- Quando um pedido e lancado pela tela de Atendimento do dashboard (balcao/
-- mesa/WhatsApp), fica registrado qual funcionario (Caixa/Gerente/
-- Administrador) autenticou aquela sessao de Atendimento e lancou o
-- pedido -- pra permitir historico dividido por pessoa, igual ja existe
-- pra comanda do garcom.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lancado_por_funcionario_id UUID;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lancado_por_funcionario_nome TEXT;

CREATE INDEX IF NOT EXISTS idx_pedidos_lancado_por ON pedidos(estabelecimento_id, lancado_por_funcionario_id);
