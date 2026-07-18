// ===================================================================
// Helper para enviar imagens/documentos ao Supabase Storage
// Usa o SDK oficial do Supabase (@supabase/supabase-js)
// ===================================================================
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_IMAGENS = 'cardapio-imagens';
const BUCKET_DOCUMENTOS = 'documentos-lojistas';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Upload de imagens publicas (logo, banner, fotos de produtos, promocoes...)
async function uploadImagem(buffer, mimetype, pasta) {
  const extensao = mimetype.split('/')[1];
  const nomeArquivo = `${pasta}/${uuidv4()}.${extensao}`;

  const { error } = await supabase.storage
    .from(BUCKET_IMAGENS)
    .upload(nomeArquivo, buffer, {
      contentType: mimetype,
      upsert: false
    });

  if (error) {
    throw new Error(`Falha ao enviar imagem: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET_IMAGENS).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

// Upload de documentos sensiveis (RG/CNH, comprovante de residencia).
// O bucket "documentos-lojistas" e PRIVADO -- ninguem acessa o arquivo
// direto pela URL. Guardamos so o caminho interno no banco; para
// visualizar o documento depois (uso exclusivo do superadmin), gera-se
// uma URL assinada de curta duracao com gerarUrlAssinadaDocumento().
async function uploadDocumentoPrivado(buffer, mimetype, pasta) {
  const extensao = mimetype.split('/')[1];
  const caminhoArquivo = `${pasta}/${uuidv4()}.${extensao}`;

  const { error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminhoArquivo, buffer, {
      contentType: mimetype,
      upsert: false
    });

  if (error) {
    throw new Error(`Falha ao enviar documento: ${error.message}`);
  }

  return caminhoArquivo;
}

// Gera uma URL temporaria (por padrao, 10 minutos) para visualizar um
// documento privado. Usar so quando realmente precisar exibir o arquivo.
async function gerarUrlAssinadaDocumento(caminhoArquivo, segundosValidade = 600) {
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(caminhoArquivo, segundosValidade);

  if (error) {
    throw new Error(`Falha ao gerar link do documento: ${error.message}`);
  }

  return data.signedUrl;
}

module.exports = { uploadImagem, uploadDocumentoPrivado, gerarUrlAssinadaDocumento };
