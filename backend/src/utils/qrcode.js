// ===================================================================
// Utilitario para gerar QR Code (imagem) a partir de um link.
// Usa a biblioteca "qrcode" (adicionada ao package.json).
// ===================================================================
const QRCode = require('qrcode');

// Retorna uma string "data:image/png;base64,...." pronta para ser
// usada direto num <img src="..."> no frontend, sem precisar salvar
// nenhum arquivo em disco.
async function gerarQRCodeBase64(link) {
  return await QRCode.toDataURL(link, {
    width: 600,
    margin: 3,
    errorCorrectionLevel: 'L',
    color: { dark: '#000000', light: '#FFFFFF' }
  });
}

module.exports = { gerarQRCodeBase64 };
