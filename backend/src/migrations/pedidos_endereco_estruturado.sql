-- ===================================================================
-- Endereco estruturado do pedido (app do entregador)
-- ---------------------------------------------------------------------
-- Ate aqui o endereco do cliente ficava inteiro num unico campo de texto
-- livre (pedidos.cliente_endereco). O app do entregador agora precisa
-- exibir rua/numero/complemento, CEP e bairro em campos separados (telas
-- de rota em andamento, rotas realizadas e resumo da rota).
--
-- Em vez de forcar uma migracao destrutiva do historico existente (que so
-- tem o texto livre, sem como separar com 100% de certeza), a solucao e
-- aditiva: guarda os campos estruturados quando disponiveis (novos
-- pedidos, ou pedidos corrigidos manualmente) e o backend devolve, junto
-- da rota, um "cliente_endereco_formatado" pronto pra exibicao -- monta a
-- partir dos campos estruturados quando existirem, ou cai pro texto livre
-- antigo (cliente_endereco) quando nao existirem. Nada do historico se
-- perde e nada quebra pra pedidos antigos.
-- ===================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_endereco_rua VARCHAR(200);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_endereco_numero VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_endereco_complemento VARCHAR(120);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_endereco_cep VARCHAR(9);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_endereco_bairro VARCHAR(120);
