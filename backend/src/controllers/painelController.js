// ===================================================================
// Controller do PAINEL SUPER-ADMIN (uso exclusivo seu, dono do sistema)
// Protegido pela mesma CHAVE_CADASTRO_ADMIN usada nos convites.
// ===================================================================
const crypto = require('crypto');
const { query } = require('../config/database');
const { mascararDocumento } = require('../utils/mascarar');
const { hashToken, montarBaseFrontend } = require('./conviteController');

function chaveValida(chave) {
  return !!chave && chave === process.env.CHAVE_CADASTRO_ADMIN;
}

// Lista todos os estabelecimentos (lojistas) cadastrados
async function listarEstabelecimentos(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `SELECT id, slug, nome, email, ativo, plano, criado_em
       FROM estabelecimentos ORDER BY criado_em DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar estabelecimentos:', error);
    res.status(500).json({ erro: 'Erro interno ao listar estabelecimentos.' });
  }
}

// Bloqueia ou desbloqueia um estabelecimento (ativo = true/false)
async function alternarStatusEstabelecimento(req, res) {
  try {
    const { chaveMestra, ativo } = req.body;
    const { id } = req.params;

    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (typeof ativo !== 'boolean') {
      return res.status(400).json({ erro: 'Campo "ativo" deve ser true ou false.' });
    }

    const resultado = await query(
      `UPDATE estabelecimentos SET ativo = $1, atualizado_em = NOW() WHERE id = $2 RETURNING id, slug, nome, ativo`,
      [ativo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    res.json({ mensagem: 'Status atualizado com sucesso.', estabelecimento: resultado.rows[0] });
  } catch (error) {
    console.error('Erro ao alternar status do estabelecimento:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar status.' });
  }
}

// Cancela um convite que ainda nao foi usado
async function cancelarConvite(req, res) {
  try {
    const { chaveMestra } = req.body;
    const { id } = req.params;

    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query(
      `UPDATE convites_cadastro SET status = 'cancelado'
       WHERE id = $1 AND status IN ('pendente', 'em_andamento')
       RETURNING id`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Convite nao encontrado ou ja finalizado.' });
    }

    res.json({ mensagem: 'Convite cancelado com sucesso.' });
  } catch (error) {
    console.error('Erro ao cancelar convite:', error);
    res.status(500).json({ erro: 'Erro interno ao cancelar convite.' });
  }
}

// Detalhe completo de UM estabelecimento (dados de contato + dados legais),
// para o admin supremo consultar/corrigir quando o lojista pedir suporte
// (ex: perdeu acesso ao telefone/e-mail antigo). CPF/CNPJ sempre mascarados.
async function buscarEstabelecimentoDetalhe(req, res) {
  try {
    const { chaveMestra } = req.query;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const { id } = req.params;
    const resultado = await query(
      `SELECT e.id, e.slug, e.nome, e.email, e.whatsapp, e.telefone, e.endereco, e.ativo, e.criado_em,
              dl.nome AS responsavel_nome, dl.sobrenome AS responsavel_sobrenome,
              dl.telefone AS responsavel_telefone, dl.tipo_registro,
              dl.cpf, dl.cnpj, dl.razao_social, dl.nome_fantasia,
              dl.cep, dl.rua, dl.numero, dl.bairro, dl.zona, dl.cidade, dl.uf
       FROM estabelecimentos e
       LEFT JOIN dados_legais dl ON dl.estabelecimento_id = e.id
       WHERE e.id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    const dados = resultado.rows[0];
    dados.cpf = mascararDocumento('cpf', dados.cpf);
    dados.cnpj = mascararDocumento('cnpj', dados.cnpj);

    res.json(dados);
  } catch (error) {
    console.error('Erro ao buscar detalhe do estabelecimento:', error);
    res.status(500).json({ erro: 'Erro interno ao buscar os dados da loja.' });
  }
}

// Atualiza dados de contato/cadastrais de um estabelecimento (uso do admin
// supremo, tipicamente a pedido do lojista via suporte). CPF/CNPJ, nome e
// tipo de registro NAO sao editaveis por aqui -- sao dados de identidade
// verificados no cadastro; mudar exigiria nova verificacao.
async function atualizarEstabelecimentoDetalhe(req, res) {
  try {
    const { chaveMestra, email, whatsapp, telefone, endereco, responsavel_telefone, cep, rua, numero, bairro, zona, cidade, uf } = req.body;
    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const { id } = req.params;
    const existe = await query('SELECT id FROM estabelecimentos WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    await query(
      `UPDATE estabelecimentos SET
         email = COALESCE($1, email), whatsapp = COALESCE($2, whatsapp),
         telefone = COALESCE($3, telefone), endereco = COALESCE($4, endereco),
         atualizado_em = NOW()
       WHERE id = $5`,
      [email || null, whatsapp || null, telefone || null, endereco || null, id]
    );

    // Antes: se a loja nao tivesse nenhuma linha em dados_legais (contas
    // antigas/de teste criadas antes dessa etapa existir, ou sem KYC ainda),
    // este UPDATE simplesmente nao encontrava nada pra atualizar e o
    // endereco/telefone do responsavel eram perdidos silenciosamente --
    // mesmo assim a resposta dizia "sucesso". Agora, se nao existir a
    // linha, criamos uma (parcial, so com os campos que este painel edita;
    // CPF/CNPJ/nome/tipo_registro continuam nulos ate a loja completar o
    // KYC de verdade) em vez de descartar o que o admin preencheu.
    let avisoDadosLegais = null;
    const temDadosLegais = await query('SELECT id FROM dados_legais WHERE estabelecimento_id = $1', [id]);
    if (temDadosLegais.rows.length > 0) {
      await query(
        `UPDATE dados_legais SET
           telefone = COALESCE($1, telefone), cep = COALESCE($2, cep), rua = COALESCE($3, rua),
           numero = COALESCE($4, numero), bairro = COALESCE($5, bairro), zona = COALESCE($6, zona),
           cidade = COALESCE($7, cidade), uf = COALESCE($8, uf)
         WHERE estabelecimento_id = $9`,
        [responsavel_telefone || null, cep || null, rua || null, numero || null, bairro || null, zona || null, cidade || null, uf || null, id]
      );
    } else {
      try {
        await query(
          `INSERT INTO dados_legais (estabelecimento_id, telefone, cep, rua, numero, bairro, zona, cidade, uf)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, responsavel_telefone || null, cep || null, rua || null, numero || null, bairro || null, zona || null, cidade || null, uf || null]
        );
      } catch (erroInsercao) {
        console.error('Nao foi possivel criar registro parcial de dados_legais:', erroInsercao.message);
        avisoDadosLegais = 'O e-mail, WhatsApp, telefone e endereco (do cardapio) foram salvos. Mas o endereco cadastral (KYC) e telefone do responsavel nao puderam ser salvos: esta loja ainda nao tem nenhum cadastro de dados legais no sistema, e a criacao automatica falhou.';
      }
    }

    res.json({ mensagem: 'Dados atualizados com sucesso.', aviso: avisoDadosLegais || undefined });
  } catch (error) {
    console.error('Erro ao atualizar dados do estabelecimento:', error);
    res.status(500).json({ erro: 'Erro interno ao atualizar os dados da loja.' });
  }
}

// Gera um link temporario de autoatendimento para UMA loja especifica,
// para o proprio lojista usar (em vez do superadmin editar os dados
// diretamente). Dois tipos:
//  - completar_kyc: para lojas que nunca tiveram dados_legais (o link
//    fica valido por 30 dias, sem pressa, ja que normalmente e usado
//    uma vez so, por uma loja que ja existe ha tempos).
//  - editar_contato: valido por 24h, so para telefone/WhatsApp/endereco.
async function gerarLinkAutoatendimento(req, res) {
  try {
    const { chaveMestra, tipo } = req.body;
    const { id } = req.params;

    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }
    if (!['completar_kyc', 'editar_contato'].includes(tipo)) {
      return res.status(400).json({ erro: 'Tipo de link invalido.' });
    }

    const existe = await query('SELECT id FROM estabelecimentos WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    if (tipo === 'completar_kyc') {
      const jaTemDadosLegais = await query('SELECT id FROM dados_legais WHERE estabelecimento_id = $1', [id]);
      if (jaTemDadosLegais.rows.length > 0) {
        return res.status(409).json({ erro: 'Esta loja ja tem cadastro de dados legais (KYC). Use "Gerar link de edicao de contato" para correcoes pontuais.' });
      }
    }

    const tokenBruto = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(tokenBruto);
    const horasValidade = tipo === 'editar_contato' ? 24 : (24 * 30);
    const expiraEm = new Date(Date.now() + horasValidade * 60 * 60 * 1000);

    await query(
      `INSERT INTO convites_cadastro (token, status, tipo, estabelecimento_id, expira_em)
       VALUES ($1, 'pendente', $2, $3, $4)`,
      [tokenHash, tipo, id, expiraEm]
    );

    const baseUrl = montarBaseFrontend();
    const pagina = tipo === 'completar_kyc' ? 'completar-cadastro-loja.html' : 'editar-contato-loja.html';
    const link = `${baseUrl}/frontend/admin/${pagina}?token=${tokenBruto}`;

    res.status(201).json({ link, expira_em: expiraEm });
  } catch (error) {
    console.error('Erro ao gerar link de autoatendimento:', error);
    res.status(500).json({ erro: 'Erro interno ao gerar o link.' });
  }
}

// Exclui definitivamente um estabelecimento (loja) e todos os dados
// dele. Acao IRREVERSIVEL -- por isso exige que o superadmin digite o
// nome exato da loja como confirmacao, alem da chave mestra.
//
// A exclusao tenta remover primeiro as tabelas que sabemos que
// referenciam estabelecimento_id (para nao deixar nada orfao) e so
// depois apaga a linha em "estabelecimentos". Se alguma tabela que a
// gente nao conhece tambem referenciar essa loja e travar a exclusao,
// o Postgres recusa com um erro de chave estrangeira -- nesse caso
// avisamos exatamente qual tabela e devolvemos, sem apagar nada pela
// metade (tudo roda dentro da mesma conexao, e o erro interrompe antes
// do DELETE final em estabelecimentos).
async function excluirEstabelecimento(req, res) {
  try {
    const { chaveMestra, confirmacaoNome } = req.body;
    const { id } = req.params;

    if (!chaveValida(chaveMestra)) {
      return res.status(403).json({ erro: 'Chave mestra invalida.' });
    }

    const resultado = await query('SELECT id, nome FROM estabelecimentos WHERE id = $1', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    }

    const loja = resultado.rows[0];
    if (!confirmacaoNome || confirmacaoNome.trim().toLowerCase() !== loja.nome.trim().toLowerCase()) {
      return res.status(400).json({ erro: 'Nome de confirmacao nao confere com o nome da loja. Digite o nome exatamente igual para confirmar a exclusao.' });
    }

    // Tabelas conhecidas que guardam estabelecimento_id. Apagamos nessa
    // ordem (das mais "dependentes" para as mais "base") antes da loja
    // em si, para nao esbarrar em chave estrangeira. Cada DELETE e
    // tolerante a tabela nao existir/nao ter linhas.
    const tabelasDependentes = [
      'dados_legais', 'convites_cadastro', 'itens_pedido', 'pedidos',
      'itens_comanda', 'comandas', 'reservas', 'produtos', 'categorias',
      'promocoes', 'imagens_carrossel', 'carrosseis', 'vitrines',
      'caixas_texto', 'funcionarios', 'fornecedores', 'movimentacoes_estoque',
      'notificacoes_estoque', 'plantoes_entregador', 'clientes'
    ];

    for (const tabela of tabelasDependentes) {
      try {
        await query(`DELETE FROM ${tabela} WHERE estabelecimento_id = $1`, [id]);
      } catch (erroTabela) {
        // Tabela pode nao existir neste banco, ou nao ter essa coluna --
        // ignora e segue tentando as demais; o DELETE final acusa se
        // sobrar algo de verdade preso por chave estrangeira.
        console.error(`Aviso ao limpar "${tabela}" antes de excluir a loja:`, erroTabela.message);
      }
    }

    await query('DELETE FROM estabelecimentos WHERE id = $1', [id]);

    res.json({ mensagem: `Loja "${loja.nome}" excluida com sucesso.` });
  } catch (error) {
    console.error('Erro ao excluir estabelecimento:', error);
    if (error.code === '23503') {
      return res.status(409).json({
        erro: `Nao foi possivel excluir: ainda existem dados dependentes na tabela "${error.table || 'desconhecida'}" que nao foram removidos automaticamente. Avise para eu adicionar essa tabela na lista de limpeza.`
      });
    }
    res.status(500).json({ erro: 'Erro interno ao excluir a loja.' });
  }
}

module.exports = { listarEstabelecimentos, alternarStatusEstabelecimento, cancelarConvite, buscarEstabelecimentoDetalhe, atualizarEstabelecimentoDetalhe, gerarLinkAutoatendimento, excluirEstabelecimento };
