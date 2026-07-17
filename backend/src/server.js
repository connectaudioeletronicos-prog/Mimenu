// ===================================================================
// SERVIDOR PRINCIPAL - Backend do Cardapio Digital Multi-tenant
// ===================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const rotasPublico = require('./routes/publico');
const rotasAuth = require('./routes/auth');
const rotasAdmin = require('./routes/admin');
const rotasWebhooks = require('./routes/webhooks');
const rotasFuncionarios = require('./routes/funcionarios');
const rotasConvites = require('./routes/convites');
const { sincronizarSchema } = require('./config/database');
const app = express();

// O Render roda o servidor atras de um proxy reverso. Sem esta linha,
// o Express nao confia no cabecalho X-Forwarded-For, o que quebra o
// express-rate-limit e pode causar falhas silenciosas nas requisicoes.
app.set('trust proxy', 1);

app.use(helmet());

function extrairOrigem(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

const origensFixasPermitidas = [
  'https://palatos.com.br',
  'https://www.palatos.com.br',
  'https://connectaudioeletronicos-prog.github.io'
];

const origensPermitidas = process.env.NODE_ENV === 'production'
  ? [...new Set([...origensFixasPermitidas, extrairOrigem(process.env.FRONTEND_URL)].filter(Boolean))]
  : true;

app.use(cors({ origin: origensPermitidas }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const limitadorGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { erro: 'Muitas requisicoes. Tente novamente em alguns minutos.' }
});
app.use(limitadorGlobal);

app.get('/', (req, res) => {
  res.json({ status: 'online', mensagem: 'API do Cardapio Digital funcionando.' });
});

app.use('/api/publico', rotasPublico);
app.use('/api/auth', rotasAuth);
app.use('/api/admin', rotasAdmin);
app.use('/api/webhooks', rotasWebhooks);
app.use('/api/funcionarios', rotasFuncionarios);
app.use('/api/convites', rotasConvites);

app.use((err, req, res, next) => {
  if (err.name === 'MulterError' || err.message?.includes('Formato de imagem')) {
    return res.status(400).json({ erro: err.message });
  }
  console.error('Erro nao tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota nao encontrada.' });
});

const PORTA = process.env.PORT || 3000;
sincronizarSchema().finally(() => {
  app.listen(PORTA, () => {
    console.log(`Servidor rodando na porta ${PORTA}`);
  });
});
