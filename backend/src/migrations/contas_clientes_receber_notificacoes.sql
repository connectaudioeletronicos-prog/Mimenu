-- A tela "Meus dados" do app do cliente e o contaClienteController ja
-- leem/gravam receber_notificacoes, mas a coluna nunca foi criada no
-- banco -- por isso o toggle nao ficava salvo. Default TRUE: quem ja
-- tem conta continua "opt-in" ate decidir desligar (mesmo comportamento
-- que o front ja assume quando o valor ainda nao existe: `!== false`).
ALTER TABLE contas_clientes
  ADD COLUMN IF NOT EXISTS receber_notificacoes BOOLEAN NOT NULL DEFAULT TRUE;
