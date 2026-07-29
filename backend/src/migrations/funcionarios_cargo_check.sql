-- Garante que a constraint funcionarios_cargo_check no banco esteja sempre
-- alinhada com a lista CARGOS_VALIDOS usada no codigo (funcionarioController.js).
ALTER TABLE funcionarios DROP CONSTRAINT IF EXISTS funcionarios_cargo_check;
ALTER TABLE funcionarios ADD CONSTRAINT funcionarios_cargo_check
  CHECK (cargo IN ('administrador', 'gerente', 'caixa', 'garcom', 'colaborador', 'cozinha', 'entregador'));
