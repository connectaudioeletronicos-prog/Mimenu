// Valida se um endereco existe de fato, usando a Google Geocoding API.
// Requer GOOGLE_MAPS_API_KEY no .env (backend). Nunca expor essa chave no frontend.

const CEP_REGEX = /^\d{5}-\d{3}$/;

function validarFormatoCep(cep) {
  return CEP_REGEX.test(cep || '');
}

async function validarEnderecoGoogleMaps(enderecoCompleto) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    // Sem chave configurada: nao bloqueia o pedido, apenas avisa no log.
    console.warn('GOOGLE_MAPS_API_KEY nao configurada — validacao de endereco pulada.');
    return { valido: true, motivo: 'sem_chave_configurada' };
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(enderecoCompleto)}&key=${apiKey}`;

  try {
    const resposta = await fetch(url);
    const dados = await resposta.json();

    if (dados.status === 'OK' && dados.results && dados.results.length > 0) {
      return { valido: true, resultado: dados.results[0] };
    }

    if (dados.status === 'ZERO_RESULTS') {
      return { valido: false, motivo: 'endereco_nao_encontrado' };
    }

    // Erros de API (REQUEST_DENIED, OVER_QUERY_LIMIT, etc) nao devem travar o cliente.
    console.error('Erro na Google Geocoding API:', dados.status, dados.error_message);
    return { valido: true, motivo: 'erro_api_ignorado' };
  } catch (erro) {
    console.error('Falha ao chamar Google Geocoding API:', erro.message);
    return { valido: true, motivo: 'falha_rede_ignorada' };
  }
}

module.exports = { validarFormatoCep, validarEnderecoGoogleMaps };
