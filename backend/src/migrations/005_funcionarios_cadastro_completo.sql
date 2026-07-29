-- Campos extras do cadastro de funcionario: telefone (rapido, no cadastro
-- inicial) e o cadastro completo opcional (celular, nascimento, RG, CPF),
-- preenchivel so por proprietario/administrador.
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS celular VARCHAR(20);
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS rg VARCHAR(20);
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
