// Valida CEP usando a ViaCEP (servico publico e gratuito, sem necessidade de chave de API).
// https://viacep.com.br

const CEP_REGEX = /^\d{5}-\d{3}$/;

function validarFormatoCep(cep) {
  return CEP_REGEX.test(cep || '');
}

async function validarCepViaCep(cep) {
  const cepLimpo = (cep || '').replace(/\D/g, '');

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      return { valido: false, motivo: 'cep_nao_encontrado' };
    }

    return { valido: true, dados };
  } catch (erro) {
    // Se a ViaCEP estiver fora do ar, nao travamos o cliente por uma falha externa.
    console.error('Falha ao consultar ViaCEP:', erro.message);
    return { valido: true, motivo: 'falha_rede_ignorada' };
  }
}

module.exports = { validarFormatoCep, validarCepViaCep };
