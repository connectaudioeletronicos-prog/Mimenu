-- ===================================================================
-- Banco de dados dedicado ao app do entregador
-- ---------------------------------------------------------------------
-- O Postgres do projeto (Supabase) e um so, entao "banco separado" aqui
-- vira um SCHEMA proprio ("entregador"), isolado do schema "public" onde
-- fica o resto do sistema (cardapio, pedidos, painel admin etc.).
--
-- Por que schema e nao um banco fisico separado: as tabelas do app do
-- entregador dependem de pedidos e funcionarios (chave estrangeira,
-- join direto) -- se estivessem num banco de verdade separado, o Postgres
-- nao consegue fazer JOIN nem checar FOREIGN KEY entre bancos diferentes
-- sem um mecanismo extra (dblink/postgres_fdw), o que deixaria o app mais
-- lento e mais fragil sem necessidade. Um schema dedicado ja entrega o
-- que importa (dados do entregador isolados/organizados a parte) sem
-- quebrar essa integracao.
--
-- Continuam no schema "public" (compartilhados com o resto do sistema,
-- por causa da integridade referencial): funcionarios e pedidos.
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS entregador;

-- Move a tabela de plantoes pro schema novo (o Postgres atualiza sozinho
-- as referencias internas de indices/foreign keys -- nao perde dado nem
-- quebra o vinculo com pedidos.plantao_id).
ALTER TABLE IF EXISTS public.plantoes_entregador SET SCHEMA entregador;
