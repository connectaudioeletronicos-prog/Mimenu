-- E-mail agora e opcional no cadastro do cliente (ele pode entrar so com
-- telefone). Pelo menos um dos dois (email ou telefone) e exigido pela
-- aplicacao na hora do cadastro/login, nao pelo banco.
ALTER TABLE contas_clientes ALTER COLUMN email DROP NOT NULL;
ALTER TABLE contas_clientes ADD COLUMN IF NOT EXISTS telefone VARCHAR(20) UNIQUE;
