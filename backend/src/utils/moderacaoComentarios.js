// ===================================================================
// Moderacao de comentarios do blog. Como o comentario aparece na hora
// pros outros leitores (sem fila de aprovacao do super admin), toda
// checagem acontece ANTES de gravar no banco. Duas camadas:
//
//  1) Heuristica de spam local (barata, sem depender de servico externo):
//     link em excesso, caixa alta excessiva, caractere repetido, etc.
//
//  2) Perspective API (Google, gratuita) para toxicidade, ataque a
//     identidade e discriminacao racial/cultural. Uma lista fixa de
//     palavras proibidas nao pega ofensa disfarcada ou indireta -- por
//     isso essa camada e quem realmente cobre a exigencia de bloquear
//     discurso discriminatorio, nao a heuristica de spam.
//
// Se a Perspective API estiver fora do ar, sem chave configurada ou com
// cota estourada, o comentario passa so pela camada de spam e o erro
// fica no log -- prioriza manter o blog funcionando a bloquear todo
// mundo de comentar por causa de uma falha externa.
// ===================================================================
const LIMIAR_TOXICIDADE = Number(process.env.PERSPECTIVE_LIMIAR || 0.75);

const ATRIBUTOS_BLOQUEIO = [
  'TOXICITY', 'SEVERE_TOXICITY', 'IDENTITY_ATTACK', 'INSULT', 'THREAT', 'PROFANITY'
];

// Camada 1: heuristica de spam. Retorna null se ok, ou o motivo do bloqueio.
function pareceSpam(texto) {
  const limpo = (texto || '').trim();
  if (!limpo) return 'comentario vazio';
  if (limpo.length > 2000) return 'comentario muito longo';

  const qtdLinks = (limpo.match(/https?:\/\/|www\./gi) || []).length;
  if (qtdLinks >= 2) return 'muitos links';

  const letras = limpo.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const maiusculas = letras.replace(/[^A-ZÀ-Ý]/g, '');
  if (letras.length > 12 && maiusculas.length / letras.length > 0.7) {
    return 'caixa alta excessiva';
  }

  if (/(.)\1{6,}/.test(limpo)) return 'caracteres repetidos em excesso';

  return null;
}

// Camada 2: Perspective API. Nunca lanca erro -- se falhar, libera
// (fail-open) e so loga, pra nao derrubar o comentario por causa de
// uma instabilidade de terceiro.
async function analisarToxicidade(texto) {
  const chave = process.env.PERSPECTIVE_API_KEY;
  if (!chave) {
    console.warn('PERSPECTIVE_API_KEY nao configurada -- comentarios do blog passam so pela checagem de spam.');
    return { bloqueado: false };
  }

  try {
    const resposta = await fetch(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${chave}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: { text: texto },
          languages: ['pt'],
          requestedAttributes: ATRIBUTOS_BLOQUEIO.reduce((acc, nome) => {
            acc[nome] = {};
            return acc;
          }, {})
        })
      }
    );

    const dados = await resposta.json();
    if (!resposta.ok) {
      console.error('Erro ao consultar Perspective API:', dados);
      return { bloqueado: false };
    }

    for (const nome of ATRIBUTOS_BLOQUEIO) {
      const score = dados.attributeScores?.[nome]?.summaryScore?.value;
      if (typeof score === 'number' && score >= LIMIAR_TOXICIDADE) {
        return { bloqueado: true, motivo: nome, score };
      }
    }
    return { bloqueado: false };
  } catch (error) {
    console.error('Falha ao chamar Perspective API (comentario liberado so com checagem de spam):', error.message);
    return { bloqueado: false };
  }
}

// Retorna null se o comentario pode ser publicado, ou uma mensagem
// generica de bloqueio (o motivo detalhado so vai pro log do servidor,
// nunca na resposta pro usuario).
async function moderarComentario(texto) {
  const motivoSpam = pareceSpam(texto);
  if (motivoSpam) {
    console.warn('Comentario do blog bloqueado (spam):', motivoSpam);
    return 'Nao foi possivel publicar seu comentario. Revise o texto e tente novamente.';
  }

  const resultado = await analisarToxicidade(texto);
  if (resultado.bloqueado) {
    console.warn(`Comentario do blog bloqueado (${resultado.motivo}, score ${resultado.score.toFixed(2)})`);
    return 'Nao foi possivel publicar seu comentario. Revise o texto e tente novamente.';
  }

  return null;
}

module.exports = { moderarComentario };
