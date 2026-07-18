// ===================================================================
// Controller de COMUNICACAO com lojistas (uso exclusivo do superadmin)
// Permite enviar uma mensagem por e-mail (via Resend) ou preparar um
// link de WhatsApp pronto para o telefone do responsavel pela loja.
// Protegido pela mesma CHAVE_CADASTRO_ADMIN usada no resto do painel.
// ===================================================================
const { query } = require('../config/database');
const { enviarEmailGenerico } = require('../utils/email');

function chaveValida(chave) {
  return !!chave && chave === process.env.CHAVE_CADASTRO_ADMIN;
}

// Lista lojistas com os dados de contato disponiveis (e-mail sempre existe;
// telefone vem de dados_legais quando o cadastro completo ja foi preenchido).
async function listarContatos(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `SELECT e.id, e.slug, e.nome, e.email, e.ativo,
              dl.nome AS nome_responsavel, dl.sobrenome AS sobrenome_responsavel,
              dl.telefone
       FROM estabelecimentos e
       LEFT JOIN dados_legais dl ON dl.estabelecimento_id = e.id
       ORDER BY e.criado_em DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar contatos:', error);
    res.status(500).json({ erro: 'Erro interno ao listar contatos.' });
  }
}

// Envia uma mensagem de suporte por e-mail para um lojista especifico.
async function enviarEmail(req, res) {
  try {
    const { chaveMestra, estabelecimentoId, assunto, mensagem } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!estabelecimentoId || !assunto || !mensagem) {
      return res.status(400).json({ erro: 'Preencha destinatario, assunto e mensagem.' });
    }

    const resultado = await query(
      'SELECT nome, email FROM estabelecimentos WHERE id = $1',
      [estabelecimentoId]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    const destinatario = resultado.rows[0];
    const enviado = await enviarEmailGenerico(destinatario.email, destinatario.nome, assunto, mensagem);

    if (!enviado.enviado) {
      return res.status(502).json({ erro: 'Não foi possível enviar o e-mail: ' + (enviado.motivo || 'erro desconhecido') });
    }

    res.json({ mensagem: 'E-mail enviado com sucesso.' });
  } catch (error) {
    console.error('Erro ao enviar e-mail de suporte:', error);
    res.status(500).json({ erro: 'Erro interno ao enviar e-mail.' });
  }
}

module.exports = { listarContatos, enviarEmail };
