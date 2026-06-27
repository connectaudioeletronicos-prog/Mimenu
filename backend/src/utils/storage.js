// ===================================================================
// Helper para enviar imagens ao Supabase Storage
// Usa a REST API do Supabase Storage diretamente via fetch,
// sem precisar de SDK extra.
// ===================================================================
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'cardapio-imagens';

async function uploadImagem(buffer, mimetype, pasta) {
  const extensao = mimetype.split('/')[1];
  const nomeArquivo = `${pasta}/${uuidv4()}.${extensao}`;

  const resposta = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${nomeArquivo}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': mimetype
      },
      body: buffer
    }
  );

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`Falha ao enviar imagem: ${erro}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${nomeArquivo}`;
}

module.exports = { uploadImagem };