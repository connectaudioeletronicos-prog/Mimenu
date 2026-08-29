// Mascara CPF/CNPJ para exibicao, seguindo o padrao pedido:
// CPF  -> mostra so os 4 ULTIMOS digitos (ex: *******89-01 vira apenas os 4 finais visiveis)
// CNPJ -> mostra so os 4 PRIMEIROS digitos
// Mantem apenas os digitos (sem pontuacao) na saida, para nao vazar o
// tamanho/formato exato do documento original.
function mascararDocumento(tipo, valor) {
  if (!valor) return null;
  const digitos = String(valor).replace(/\D/g, '');
  if (digitos.length <= 4) return '*'.repeat(digitos.length); // documento invalido/curto demais -- nao expõe nada

  if (tipo === 'cnpj') {
    return digitos.slice(0, 4) + '*'.repeat(digitos.length - 4);
  }
  return '*'.repeat(digitos.length - 4) + digitos.slice(-4);
}

module.exports = { mascararDocumento };
