// ===================================================================
// Helper para enviar imagens ao Supabase Storage
// Usa o SDK oficial do Supabase (@supabase/supabase-js)
// ===================================================================
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'cardapio-imagens';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function uploadImagem(buffer, mimetype, pasta) {
  const extensao = mimetype.split('/')[1];
  const nomeArquivo = `${pasta}/${uuidv4()}.${extensao}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(nomeArquivo, buffer, {
      contentType: mimetype,
      upsert: false
    });

  if (error) {
    throw new Error(`Falha ao enviar imagem: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

module.exports = { uploadImagem };