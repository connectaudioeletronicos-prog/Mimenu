// Mostra APENAS os 4 digitos usados para confirmar identidade do lojista
// no suporte -- nada de asteriscos ou tamanho do documento original.
// CPF  -> os 4 ULTIMOS digitos
// CNPJ -> os 4 PRIMEIROS digitos
function mascararDocumento(tipo, valor) {
  if (!valor) return null;
  const digitos = String(valor).replace(/\D/g, '');
  if (digitos.length < 4) return null; // documento invalido/curto demais -- nao ha o que exibir

  if (tipo === 'cnpj') {
    return digitos.slice(0, 4);
  }
  return digitos.slice(-4);
}

module.exports = { mascararDocumento };
