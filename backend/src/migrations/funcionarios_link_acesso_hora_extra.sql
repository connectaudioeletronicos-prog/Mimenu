-- Colunas usadas por funcionarioController.js (acessarPorLink, criar, listar,
-- listarEquipeOperacional, exigirDentroDoHorario, liberarHoraExtra) que
-- nunca foram criadas por nenhuma migration existente.

ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS token_acesso VARCHAR(64) UNIQUE;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS liberado_hora_extra_data DATE;

UPDATE funcionarios
SET token_acesso = md5(id::text || clock_timestamp()::text || random()::text) || md5(random()::text)
WHERE token_acesso IS NULL;
