-- Carga horaria (opcional) de cada funcionario: dias da semana + horario
-- de entrada/saida. Guardado como JSONB pra nao precisar de tabela nova
-- pra um unico turno por funcionario.
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS carga_horaria JSONB DEFAULT '{}';
