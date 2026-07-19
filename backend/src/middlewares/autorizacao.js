// ===================================================================
// Validadores padronizados de telefone e CPF, usados em qualquer
// cadastro do sistema (funcionarios, clientes, dados legais). O
// formato de telefone e EXATAMENTE o mesmo usado no checkout do
// cliente final: "(99) 999999999" (DDD entre parenteses + 9 digitos).
// ===================================================================
const REGEX_TELEFONE = /^\(\d{2}\)\s\d{9}$/;
const REGEX_CPF = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

function validarTelefone(telefone) {
  return REGEX_TELEFONE.test((telefone || '').trim());
}

function validarCPF(cpf) {
  return REGEX_CPF.test((cpf || '').trim());
}

module.exports = { validarTelefone, validarCPF, REGEX_TELEFONE, REGEX_CPF };
