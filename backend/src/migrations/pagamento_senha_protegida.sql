-- Protecao por senha da tela de Pagamentos (mesmo esquema ja usado no
-- Controle de Estoque, ver estoque_senha_protegida). Quando true, a
-- tela de Pagamentos (Access Token, Public Key e o toggle de cobrar
-- cartao online no atendimento) so abre depois de confirmar a senha de
-- login do estabelecimento.
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS pagamento_senha_protegida BOOLEAN NOT NULL DEFAULT false;
