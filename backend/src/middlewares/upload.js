// ===================================================================
// Middleware de upload de imagens (logo, banner, fotos de produtos)
// Valida tipo e tamanho do arquivo para evitar uploads maliciosos
// ===================================================================
const multer = require('multer');
const path = require('path');

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

const storage = multer.memoryStorage();

function filtroArquivo(req, file, cb) {
  if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
    return cb(new Error('Formato de imagem nao permitido. Use JPG, PNG ou WEBP.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: { fileSize: TAMANHO_MAXIMO },
  fileFilter: filtroArquivo
});

module.exports = upload;