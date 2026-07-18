// ===================================================================
// Middlewares de upload (multer)
// - upload: imagens (logo, banner, fotos de produtos) - usado no painel
// - uploadDocumentos: documento de identidade + comprovante de residencia
//   (aceita imagem ou PDF, usado so no cadastro do lojista)
// ===================================================================
const multer = require('multer');

const TIPOS_IMAGEM_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const TIPOS_DOCUMENTO_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TAMANHO_MAXIMO_DOCUMENTO = 8 * 1024 * 1024;

const armazenamento = multer.memoryStorage();

function filtroImagem(req, file, cb) {
  if (!TIPOS_IMAGEM_PERMITIDOS.includes(file.mimetype)) {
    return cb(new Error('Formato de imagem nao permitido. Use JPG, PNG ou WEBP.'));
  }
  cb(null, true);
}

function filtroDocumento(req, file, cb) {
  if (!TIPOS_DOCUMENTO_PERMITIDOS.includes(file.mimetype)) {
    return cb(new Error('Formato de arquivo nao permitido. Use JPG, PNG, WEBP ou PDF.'));
  }
  cb(null, true);
}

const upload = multer({
  storage: armazenamento,
  limits: { fileSize: TAMANHO_MAXIMO_IMAGEM },
  fileFilter: filtroImagem
});

const uploadDocumentos = multer({
  storage: armazenamento,
  limits: { fileSize: TAMANHO_MAXIMO_DOCUMENTO },
  fileFilter: filtroDocumento
});

module.exports = upload;
module.exports.uploadDocumentos = uploadDocumentos;
