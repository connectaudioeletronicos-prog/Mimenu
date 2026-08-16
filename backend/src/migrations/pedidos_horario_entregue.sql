-- ===================================================================
-- DESTINO: backend/src/migrations/pedidos_horario_entregue.sql (novo arquivo)
-- ===================================================================
-- BUG ORFAO: encerrarEntrega() e buscarMinhasEntregas() (pedidoController.js)
-- sempre gravaram/leram "horario_entregue" em pedidos, mas NENHUMA
-- migration jamais criou essa coluna -- so "horario_pronto" e
-- "horario_saiu_entrega" foram migradas (pedidos_entregador_horarios.sql).
--
-- Efeito na pratica: todo UPDATE que finaliza uma entrega
-- (POST /funcionarios/entregas/:id/encerrar) quebrava com erro de coluna
-- inexistente -- a entrega NUNCA terminava de verdade no banco, ficava
-- presa em "saiu_entrega" pra sempre. E por isso que "Rotas realizadas"
-- do entregador sempre dava "Rota nao encontrada": nenhuma entrega jamais
-- concluia com sucesso.
-- Pedidos de balcao/mesa ("Marcar como finalizado") NAO passam por essa
-- funcao -- usam outro UPDATE, sem essa coluna -- por isso so as vendas
-- de mesa apareciam como "Entregues/Finalizado" no historico, nunca as
-- entregas de verdade.
-- ===================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS horario_entregue TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_pedidos_entregador_horario_entregue
  ON pedidos(estabelecimento_id, entregador_id, horario_entregue DESC);

-- ===================================================================
-- SEGUNDA COLUNA ORFA (mesmo problema, achada na mesma auditoria):
-- "canal_venda" e usada em varios lugares (criarPedido, criarPedidoManual,
-- relatorioVendasController, inteligenciaController, resumo do Caixa/
-- Gerente/Administrador) mas tambem nunca foi criada em nenhuma migration
-- versionada. Só nao quebra a criacao de pedido AGORA porque, na pratica,
-- ela ja deve existir na base ao vivo (adicionada direto pelo SQL Editor
-- do Supabase em algum momento, sem gerar o arquivo correspondente aqui).
-- ADD COLUMN IF NOT EXISTS e seguro rodar de qualquer forma -- vira um
-- no-op se ja existir, e deixa o schema versionado batendo com a base
-- real (essencial se um dia precisar recriar o banco do zero).
-- ===================================================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS canal_venda VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_pedidos_canal_venda ON pedidos(estabelecimento_id, canal_venda);
