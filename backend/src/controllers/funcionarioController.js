const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const { validarTelefone, validarCPF } = require('../utils/validadores');
const { gerarQRCodeBase64 } = require('../utils/qrcode');

// As 9 permissoes possiveis (caixinhas). O cargo NAO define o que o
// funcionario pode fazer -- serve so para limitar quantos de cada
// categoria podem existir. Quem manda de verdade e esse array.
const PERMISSOES_VALIDAS = [
  'gerenciar_funcionarios',       // cadastrar/descadastrar funcionarios
  'editar_funcionarios',          // editar dados / trocar senha de outros funcionarios
  'gerenciar_cardapio',           // produtos, categorias, promocoes (incl. precos)
  'criar_pedidos',
  'cancelar_pedidos',
  'mudar_status_pedidos',
  'ver_valores_concluidos',       // ver valores de pedidos entregues/cancelados
  'corrigir_valores_concluidos',  // alterar valores de pedidos ja concluidos
  'gerenciar_conta',              // configuracoes de conta/pagamento/paginas legais
  'ver_caixa_geral'               // ver o caixa geral (valores das entregas concluidas)
];

const CARGOS_VALIDOS = ['administrador', 'gerente', 'caixa', 'garcom', 'colaborador', 'cozinha', 'entregador'];
const LIMITES_POR_CARGO = { administrador: 1, gerente: 1, caixa: 5 }; // garcom/colaborador/cozinha/entregador: sem limite

// Carga horaria (opcional): { dias: ['seg','ter',...], inicio: 'HH:MM', fim: 'HH:MM' }.
// Um unico turno por funcionario e o suficiente pro que foi pedido; se um
// dia precisar de mais de um turno no futuro, isso vira um array de turnos.
const DIAS_SEMANA_VALIDOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
function sanitizarCargaHoraria(carga) {
  if (!carga || typeof carga !== 'object' || Array.isArray(carga)) return {};
  const horaValida = (h) => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  const dias = Array.isArray(carga.dias) ? [...new Set(carga.dias.filter(d => DIAS_SEMANA_VALIDOS.includes(d)))] : [];
  const inicio = horaValida(carga.inicio) ? carga.inicio : null;
  const fim = horaValida(carga.fim) ? carga.fim : null;
  if (dias.length === 0 && !inicio && !fim) return {};
  return { dias, inicio, fim };
}

function sanitizarPermissoes(permissoes) {
  if (!Array.isArray(permissoes)) return [];
  return permissoes.filter(p => PERMISSOES_VALIDAS.includes(p));
}

// Login de funcionario
async function loginFuncionario(req, res) {
  try {
    const { login, senha, slug } = req.body;
    if (!login || !senha || !slug) {
      return res.status(400).json({ erro: 'Login, senha e slug sao obrigatorios.' });
    }

    const estRes = await query('SELECT id, nome FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    const estabelecimentoId = estRes.rows[0].id;
    const estabelecimentoNome = estRes.rows[0].nome;

    const resultado = await query(
      `SELECT id, nome, email, username, senha_hash, cargo, permissoes, ativo
       FROM funcionarios
       WHERE estabelecimento_id = $1 AND (email = $2 OR username = $2)`,
      [estabelecimentoId, login]
    );

    if (resultado.rows.length === 0) return res.status(401).json({ erro: 'Login ou senha invalidos.' });
    const funcionario = resultado.rows[0];
    if (!funcionario.ativo) return res.status(403).json({ erro: 'Funcionario desativado.' });

    const senhaCorreta = await bcrypt.compare(senha, funcionario.senha_hash);
    if (!senhaCorreta) return res.status(401).json({ erro: 'Login ou senha invalidos.' });

    const permissoes = funcionario.cargo === 'administrador' ? PERMISSOES_VALIDAS : (funcionario.permissoes || []);

    const token = jwt.sign(
      { funcionarioId: funcionario.id, estabelecimentoId, cargo: funcionario.cargo, permissoes, slug },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await registrarAuditoria(estabelecimentoId, funcionario.id, funcionario.nome, 'LOGIN', 'funcionarios', funcionario.id, null, null, req.ip);

    res.json({
      token,
      funcionario: {
        id: funcionario.id, nome: funcionario.nome, cargo: funcionario.cargo, permissoes, slug,
        estabelecimentoNome
      }
    });
  } catch (error) {
    console.error('Erro no login funcionario:', error);
    res.status(500).json({ erro: 'Erro interno ao processar login.' });
  }
}

// Listar funcionarios
async function listar(req, res) {
  try {
    const resultado = await query(
      `SELECT id, nome, email, username, telefone, celular, data_nascimento, rg, cpf, cargo, permissoes, ativo, ordem, carga_horaria, criado_em
       FROM funcionarios WHERE estabelecimento_id = $1 ORDER BY ordem ASC, criado_em ASC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar funcionarios.' });
  }
}

// Criar funcionario
async function criar(req, res) {
  try {
    const { nome, email, username, senha, cargo, permissoes, telefone, carga_horaria } = req.body;

    if (!nome || !email || !senha || !cargo) {
      return res.status(400).json({ erro: 'Nome, email, senha e categoria sao obrigatorios.' });
    }
    if (!CARGOS_VALIDOS.includes(cargo)) return res.status(400).json({ erro: 'Categoria invalida.' });
    if (telefone && !validarTelefone(telefone)) {
      return res.status(400).json({ erro: 'Telefone invalido. Use o formato (DDD) 000000000.' });
    }

    const limite = LIMITES_POR_CARGO[cargo];
    if (limite) {
      const count = await query(
        `SELECT COUNT(*) FROM funcionarios WHERE estabelecimento_id = $1 AND cargo = $2 AND ativo = true`,
        [req.estabelecimentoId, cargo]
      );
      if (parseInt(count.rows[0].count) >= limite) {
        return res.status(400).json({ erro: `Limite de ${limite} para essa categoria ja foi atingido.` });
      }
    }

    const permissoesFinais = cargo === 'administrador' ? PERMISSOES_VALIDAS : sanitizarPermissoes(permissoes);
    const senhaHash = await bcrypt.hash(senha, 10);

    const contagemTotal = await query('SELECT COUNT(*) FROM funcionarios WHERE estabelecimento_id = $1', [req.estabelecimentoId]);
    const proximaOrdem = parseInt(contagemTotal.rows[0].count);

    const resultado = await query(
      `INSERT INTO funcionarios (estabelecimento_id, nome, email, username, telefone, senha_hash, cargo, permissoes, ordem, carga_horaria)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, nome, email, username, telefone, cargo, permissoes, ativo, ordem, carga_horaria`,
      [req.estabelecimentoId, nome, email, username || null, telefone || null, senhaHash, cargo, JSON.stringify(permissoesFinais), proximaOrdem, JSON.stringify(sanitizarCargaHoraria(carga_horaria))]
    );

    const novo = resultado.rows[0];
    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'CRIAR_FUNCIONARIO', 'funcionarios', novo.id, null, { nome, email, cargo, permissoes: permissoesFinais }, req.ip);

    res.status(201).json(novo);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ erro: 'Email ou username ja cadastrado.' });
    console.error('Erro ao criar funcionario:', error);
    res.status(500).json({ erro: 'Erro ao criar funcionario.', detalhe: error.message, codigo: error.code });
  }
}

// Atualizar funcionario (dados, categoria, permissoes, ativo/inativo)
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, username, cargo, ativo, permissoes, ordem, telefone, carga_horaria } = req.body;

    if (cargo && !CARGOS_VALIDOS.includes(cargo)) return res.status(400).json({ erro: 'Categoria invalida.' });
    if (telefone && !validarTelefone(telefone)) {
      return res.status(400).json({ erro: 'Telefone invalido. Use o formato (DDD) 000000000.' });
    }

    const anterior = await query('SELECT * FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const cargoFinal = cargo || anterior.rows[0].cargo;
    const permissoesFinais = cargoFinal === 'administrador'
      ? PERMISSOES_VALIDAS
      : (permissoes !== undefined ? sanitizarPermissoes(permissoes) : undefined);
    const cargaHorariaFinal = carga_horaria !== undefined ? sanitizarCargaHoraria(carga_horaria) : undefined;

    const resultado = await query(
      `UPDATE funcionarios SET nome = COALESCE($1, nome), email = COALESCE($2, email),
       username = COALESCE($3, username), cargo = COALESCE($4, cargo),
       ativo = COALESCE($5, ativo),
       permissoes = COALESCE($6, permissoes),
       ordem = COALESCE($7, ordem),
       telefone = COALESCE($8, telefone),
       carga_horaria = COALESCE($9, carga_horaria),
       atualizado_em = NOW()
       WHERE id = $10 AND estabelecimento_id = $11 RETURNING id, nome, email, username, telefone, cargo, permissoes, ativo, ordem, carga_horaria`,
      [nome, email, username, cargo, ativo, permissoesFinais !== undefined ? JSON.stringify(permissoesFinais) : null, ordem, telefone, cargaHorariaFinal !== undefined ? JSON.stringify(cargaHorariaFinal) : null, id, req.estabelecimentoId]
    );

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'ATUALIZAR_FUNCIONARIO', 'funcionarios', id, anterior.rows[0], resultado.rows[0], req.ip);

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar funcionario:', error);
    res.status(500).json({ erro: 'Erro ao atualizar funcionario.' });
  }
}

// Cadastro completo (opcional) do funcionario: nome ja existe, aqui e so o
// complemento -- data de nascimento, RG, CPF, celular (obrigatorio) e
// telefone fixo (opcional). Restrito a proprietario/administrador na ROTA
// (exigirCargoAdministrativo), nao so por permissao, ja que sao dados
// pessoais sensiveis do funcionario.
async function atualizarCadastroCompleto(req, res) {
  try {
    const { id } = req.params;
    const { data_nascimento, rg, cpf, celular, telefone } = req.body;

    if (!celular || !validarTelefone(celular)) {
      return res.status(400).json({ erro: 'Celular e obrigatorio. Use o formato (DDD) 000000000.' });
    }
    if (telefone && !validarTelefone(telefone)) {
      return res.status(400).json({ erro: 'Telefone invalido. Use o formato (DDD) 000000000.' });
    }
    if (cpf && !validarCPF(cpf)) {
      return res.status(400).json({ erro: 'CPF invalido. Use o formato 000.000.000-00.' });
    }

    const anterior = await query('SELECT id FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const resultado = await query(
      `UPDATE funcionarios SET
        data_nascimento = COALESCE($1, data_nascimento),
        rg = COALESCE($2, rg),
        cpf = COALESCE($3, cpf),
        celular = $4,
        telefone = COALESCE($5, telefone),
        atualizado_em = NOW()
       WHERE id = $6 AND estabelecimento_id = $7
       RETURNING id, nome, email, telefone, celular, data_nascimento, rg, cpf`,
      [data_nascimento || null, rg || null, cpf || null, celular, telefone || null, id, req.estabelecimentoId]
    );

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'ATUALIZAR_CADASTRO_COMPLETO_FUNCIONARIO', 'funcionarios', id, null, { preenchido: true }, req.ip);

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar cadastro completo do funcionario:', error);
    res.status(500).json({ erro: 'Erro ao atualizar cadastro completo.' });
  }
}

// Trocar senha (funcionario troca a propria sempre; para trocar a de outro, a rota exige a permissao 'editar_funcionarios')
async function trocarSenha(req, res) {
  try {
    const { id } = req.params;
    const { senhaAtual, novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ erro: 'Nova senha deve ter pelo menos 6 caracteres.' });

    const resultado = await query('SELECT senha_hash FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const trocandoAPropria = req.funcionarioId && req.funcionarioId === id;

    // Trocando a propria senha: precisa confirmar a senha atual.
    // Trocando a de outro (via permissao editar_funcionarios): nao precisa saber a senha antiga.
    if (trocandoAPropria) {
      if (!senhaAtual) return res.status(400).json({ erro: 'Senha atual obrigatoria.' });
      const correta = await bcrypt.compare(senhaAtual, resultado.rows[0].senha_hash);
      if (!correta) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }

    const novoHash = await bcrypt.hash(novaSenha, 10);
    await query('UPDATE funcionarios SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2', [novoHash, id]);

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'TROCAR_SENHA_FUNCIONARIO', 'funcionarios', id, null, null, req.ip);

    res.json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Erro ao trocar senha:', error);
    res.status(500).json({ erro: 'Erro ao trocar senha.' });
  }
}

// Lista a equipe agrupada por funcao operacional, pra aba "Equipe" do
// dashboard: cozinha, entregadores (com posicao na fila de atribuicao
// automatica) e atendimento (garcom/caixa/colaborador).
async function listarEquipeOperacional(req, res) {
  try {
    const resultado = await query(
      `SELECT f.id, f.nome, f.email, f.cargo, f.ativo, f.disponivel_entrega,
              f.total_entregas, f.ultima_fila_em,
              EXISTS (
                SELECT 1 FROM pedidos p
                WHERE p.entregador_id = f.id AND p.status_pedido = 'saiu_entrega'
              ) AS em_entrega
       FROM funcionarios f
       WHERE f.estabelecimento_id = $1
         AND f.cargo IN ('cozinha', 'entregador', 'garcom', 'caixa', 'colaborador')
       ORDER BY f.cargo, f.ultima_fila_em ASC NULLS FIRST, f.criado_em ASC`,
      [req.estabelecimentoId]
    );

    const cozinha = resultado.rows.filter(f => f.cargo === 'cozinha');
    const atendimento = resultado.rows.filter(f => ['garcom', 'caixa', 'colaborador'].includes(f.cargo));

    // So entram na numeracao da fila os entregadores ativos, disponiveis e
    // que nao estejam com uma entrega em andamento agora.
    let posicao = 0;
    const entregadores = resultado.rows
      .filter(f => f.cargo === 'entregador')
      .map(f => {
        let posicaoFila = null;
        if (f.ativo && f.disponivel_entrega && !f.em_entrega) {
          posicao += 1;
          posicaoFila = posicao;
        }
        return { ...f, posicao_fila: posicaoFila };
      });

    res.json({ cozinha, entregadores, atendimento });
  } catch (error) {
    console.error('Erro ao listar equipe operacional:', error);
    res.status(500).json({ erro: 'Erro ao listar equipe operacional.' });
  }
}

// Liga/desliga a disponibilidade de um entregador pra fila de atribuicao
// automatica. O proprio entregador pode alternar a propria disponibilidade;
// pra alternar a de outro, precisa da permissao 'gerenciar_funcionarios'.
// Ao voltar a ficar disponivel, ele entra no fim da fila (ultima_fila_em =
// agora), respeitando a regra de sempre seguir a ordem de chegada.
async function alternarDisponibilidadeEntregador(req, res) {
  try {
    const { id } = req.params;
    const { disponivel_entrega } = req.body;

    const podeGerenciarOutro = req.cargo === 'proprietario' || req.cargo === 'administrador' ||
      (req.permissoes || []).includes('gerenciar_funcionarios');
    const ehOProprio = req.funcionarioId && req.funcionarioId === id;
    if (!ehOProprio && !podeGerenciarOutro) {
      return res.status(403).json({ erro: 'Voce nao tem permissao para alterar a disponibilidade desse entregador.' });
    }

    const alvo = await query('SELECT cargo, disponivel_entrega FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (alvo.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });
    if (alvo.rows[0].cargo !== 'entregador') return res.status(400).json({ erro: 'Esse funcionario nao e um entregador.' });

    const novoValor = !!disponivel_entrega;
    const voltandoADisponibilizar = novoValor === true && alvo.rows[0].disponivel_entrega === false;

    const resultado = await query(
      `UPDATE funcionarios SET
        disponivel_entrega = $1,
        ultima_fila_em = CASE WHEN $2 THEN NOW() ELSE ultima_fila_em END,
        atualizado_em = NOW()
       WHERE id = $3 AND estabelecimento_id = $4
       RETURNING id, nome, disponivel_entrega`,
      [novoValor, voltandoADisponibilizar, id, req.estabelecimentoId]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao alternar disponibilidade do entregador:', error);
    res.status(500).json({ erro: 'Erro ao alternar disponibilidade do entregador.' });
  }
}

// Registrar auditoria
async function registrarAuditoria(estabelecimentoId, funcionarioId, funcionarioNome, acao, tabela, registroId, dadosAnteriores, dadosNovos, ip) {
  try {
    await query(
      `INSERT INTO auditoria (estabelecimento_id, funcionario_id, funcionario_nome, acao, tabela_afetada, registro_id, dados_anteriores, dados_novos, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [estabelecimentoId, funcionarioId || null, funcionarioNome || null, acao, tabela || null, registroId || null,
       dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
       dadosNovos ? JSON.stringify(dadosNovos) : null, ip || null]
    );
  } catch (e) {
    console.error('Erro ao registrar auditoria:', e);
  }
}

// Exclui definitivamente um funcionario. Exige a senha de quem esta fazendo a
// exclusao (proprietario ou funcionario administrador) como confirmacao.
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const { senhaConfirmacao } = req.body;

    if (!senhaConfirmacao) {
      return res.status(400).json({ erro: 'Informe sua senha para confirmar a exclusao.' });
    }

    let hashParaConferir;
    if (req.funcionarioId) {
      const quem = await query('SELECT senha_hash FROM funcionarios WHERE id = $1', [req.funcionarioId]);
      if (quem.rows.length === 0) return res.status(401).json({ erro: 'Sessao invalida.' });
      hashParaConferir = quem.rows[0].senha_hash;
    } else {
      const quem = await query('SELECT senha_hash FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
      hashParaConferir = quem.rows[0].senha_hash;
    }

    const senhaCorreta = await bcrypt.compare(senhaConfirmacao, hashParaConferir);
    if (!senhaCorreta) return res.status(401).json({ erro: 'Senha incorreta.' });

    const anterior = await query('SELECT * FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    await query('DELETE FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'EXCLUIR_FUNCIONARIO', 'funcionarios', id, anterior.rows[0], null, req.ip);

    res.json({ mensagem: 'Funcionario excluido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir funcionario:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir funcionario.', detalhe: error.message, codigo: error.code });
  }
}

// ===================================================================
// Checkin diario do entregador via QR Code
// ===================================================================

// Gera (ou reaproveita, se ja foi gerado hoje) o token do QR Code do dia
// pra esse estabelecimento. E esse QR que fica exposto fisicamente na loja
// (impresso, ou numa tela) pro entregador ler com a camera do celular ao
// chegar, confirmando presenca antes de entrar na fila de entregas do dia.
async function obterQrcodeDoDia(req, res) {
  try {
    const atual = await query(
      'SELECT qrcode_entregador_token, qrcode_entregador_data FROM estabelecimentos WHERE id = $1',
      [req.estabelecimentoId]
    );
    let token = atual.rows[0]?.qrcode_entregador_token;
    const dataAtual = atual.rows[0]?.qrcode_entregador_data;
    const jaEhDeHoje = dataAtual && new Date(dataAtual).toDateString() === new Date().toDateString();

    if (!token || !jaEhDeHoje) {
      token = crypto.randomBytes(16).toString('hex');
      await query(
        'UPDATE estabelecimentos SET qrcode_entregador_token = $1, qrcode_entregador_data = CURRENT_DATE WHERE id = $2',
        [token, req.estabelecimentoId]
      );
    }

    // O conteudo do QR e so o token (o app do entregador le e manda pro
    // endpoint de checkin -- nao precisa ser um link).
    const qrcodeBase64 = await gerarQRCodeBase64(token);
    res.json({ qrcode_base64: qrcodeBase64, valido_ate: 'fim do dia' });
  } catch (error) {
    console.error('Erro ao gerar QR Code do dia:', error);
    res.status(500).json({ erro: 'Erro ao gerar QR Code do dia.' });
  }
}

// O entregador le o QR do dia (com a camera, no proprio app) e manda o
// token lido pra ca. Confirma presenca no dia e libera ele pra entrar na
// fila de ofertas de entrega.
async function checkinEntregador(req, res) {
  try {
    if (req.cargo !== 'entregador') {
      return res.status(403).json({ erro: 'Checkin disponivel apenas para entregadores.' });
    }
    const { token } = req.body;
    if (!token) return res.status(400).json({ erro: 'Informe o codigo lido do QR.' });

    const est = await query(
      'SELECT qrcode_entregador_token, qrcode_entregador_data FROM estabelecimentos WHERE id = $1',
      [req.estabelecimentoId]
    );
    const tokenValido = est.rows[0]?.qrcode_entregador_token;
    const dataValida = est.rows[0]?.qrcode_entregador_data;
    const ehDeHoje = dataValida && new Date(dataValida).toDateString() === new Date().toDateString();

    if (!ehDeHoje || !tokenValido || tokenValido !== token) {
      return res.status(400).json({ erro: 'QR Code invalido ou vencido. Peca o QR do dia atualizado na loja.' });
    }

    await query(
      'UPDATE funcionarios SET ultimo_checkin_data = CURRENT_DATE, disponivel_entrega = true, ultima_fila_em = COALESCE(ultima_fila_em, NOW()) WHERE id = $1',
      [req.funcionarioId]
    );

    // Ao bater o ponto, ja tenta puxar algum pedido "pronto" esperando fila.
    const { tentarOfertarPedidosPendentes } = require('./pedidoController');
    await tentarOfertarPedidosPendentes(req.estabelecimentoId);

    res.json({ mensagem: 'Checkin realizado. Voce esta na fila de entregas de hoje.' });
  } catch (error) {
    console.error('Erro no checkin do entregador:', error);
    res.status(500).json({ erro: 'Erro ao fazer checkin.' });
  }
}

module.exports = {
  loginFuncionario, listar, criar, atualizar, atualizarCadastroCompleto, trocarSenha, excluir,
  listarEquipeOperacional, alternarDisponibilidadeEntregador,
  obterQrcodeDoDia, checkinEntregador,
  registrarAuditoria, PERMISSOES_VALIDAS, CARGOS_VALIDOS
};
