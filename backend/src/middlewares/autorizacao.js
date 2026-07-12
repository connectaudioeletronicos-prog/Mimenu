const jwt = require('jsonwebtoken');

// Autentica funcionario pelo token JWT
function autenticarFuncionario(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token nao fornecido.' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.funcionarioId = payload.funcionarioId;
    req.estabelecimentoId = payload.estabelecimentoId;
    req.cargo = payload.cargo;
    req.slug = payload.slug;
    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token invalido ou expirado.' });
  }
}

// Verifica se o funcionario tem cargo suficiente
function exigirCargo(...cargosPermitidos) {
  return (req, res, next) => {
    if (!cargosPermitidos.includes(req.cargo)) {
      return res.status(403).json({ erro: 'Acesso negado. Cargo insuficiente.' });
    }
    next();
  };
}

// Atalhos por cargo
const soAdmin = exigirCargo('administrador');
const adminOuGerente = exigirCargo('administrador', 'gerente');
const adminGerenteOuAtendente = exigirCargo('administrador', 'gerente', 'atendente');
const todos = exigirCargo('administrador', 'gerente', 'atendente', 'colaborador');

module.exports = { autenticarFuncionario, exigirCargo, soAdmin, adminOuGerente, adminGerenteOuAtendente, todos };
