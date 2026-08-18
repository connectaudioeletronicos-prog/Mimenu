// ===================================================================
// Criptografia simetrica (AES-256-GCM) para dados sensiveis salvos no
// banco -- hoje usada so no Access Token do Mercado Pago (mp_access_token).
//
// A chave vem de CHAVE_CRIPTOGRAFIA no .env (32 bytes em base64). Gere uma
// com: openssl rand -base64 32
//
// Formato salvo no banco: "enc:<iv>:<tag>:<dados>" (tudo em base64).
// O prefixo "enc:" permite distinguir de valores antigos que ainda estao
// em texto puro (salvos antes dessa mudanca) -- ver descriptografar().
// ===================================================================
const crypto = require('crypto');

const ALGORITMO = 'aes-256-gcm';
const PREFIXO = 'enc:';

function obterChave() {
  const chaveBase64 = process.env.CHAVE_CRIPTOGRAFIA;
  if (!chaveBase64) {
    throw new Error(
      'CHAVE_CRIPTOGRAFIA nao configurada no .env -- necessaria para salvar ' +
      'dados sensiveis (ex: token do Mercado Pago). Gere uma com: openssl rand -base64 32'
    );
  }
  const chave = Buffer.from(chaveBase64, 'base64');
  if (chave.length !== 32) {
    throw new Error(
      'CHAVE_CRIPTOGRAFIA invalida -- precisa ser uma chave de 32 bytes ' +
      'codificada em base64 (gere com: openssl rand -base64 32).'
    );
  }
  return chave;
}

// Criptografa um texto. Retorna null/undefined/'' sem alterar (nada pra
// criptografar quando o campo e limpo ou nao enviado).
function criptografar(textoPlano) {
  if (!textoPlano) return textoPlano;

  const chave = obterChave();
  const iv = crypto.randomBytes(12); // 12 bytes e o recomendado para GCM
  const cifra = crypto.createCipheriv(ALGORITMO, chave, iv);
  const criptografado = Buffer.concat([cifra.update(String(textoPlano), 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();

  return PREFIXO + [iv, tag, criptografado].map((b) => b.toString('base64')).join(':');
}

// Descriptografa um valor salvo. Se o valor nao tiver o prefixo "enc:",
// assume que e um token antigo (salvo em texto puro antes dessa mudanca)
// e devolve como esta -- assim nada quebra pros lojistas que ja tinham
// credenciais cadastradas. Na proxima vez que o lojista salvar as
// credenciais de novo, o valor passa a ser criptografado.
function descriptografar(valorSalvo) {
  if (!valorSalvo) return valorSalvo;
  if (!valorSalvo.startsWith(PREFIXO)) return valorSalvo;

  const chave = obterChave();
  const partes = valorSalvo.slice(PREFIXO.length).split(':');
  if (partes.length !== 3) {
    throw new Error('Valor criptografado em formato invalido.');
  }
  const [ivBase64, tagBase64, dadosBase64] = partes;
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const dados = Buffer.from(dadosBase64, 'base64');

  const decifra = crypto.createDecipheriv(ALGORITMO, chave, iv);
  decifra.setAuthTag(tag);
  const textoPlano = Buffer.concat([decifra.update(dados), decifra.final()]);

  return textoPlano.toString('utf8');
}

module.exports = { criptografar, descriptografar };
