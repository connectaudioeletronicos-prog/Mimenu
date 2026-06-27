// ===================================================================
// Middleware de autenticacao - protege rotas do painel administrativo
// ===================================================================
const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticacao nao fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.estabelecimentoId = payload.estabelecimentoId;
    req.slug = payload.slug;
    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token invalido ou expirado.' });
  }
}

function garantirProprioEstabelecimento(req, res, next) {
  const idDaRota = req.params.estabelecimentoId;
  if (idDaRota && idDaRota !== req.estabelecimentoId) {
    return res.status(403).json({ erro: 'Acesso negado a dados de outro estabelecimento.' });
  }
  next();
}

module.exports = { autenticar, garantirProprioEstabelecimento };