const express = require('express');
const router = express.Router();
const funcionarioController = require('../controllers/funcionarioController');
const clienteController = require('../controllers/clienteController');
const pedidoController = require('../controllers/pedidoController');
const { autenticarFuncionario, exigirPermissao, exigirCargoAdministrativo } = require('../middlewares/autorizacao');

// Login de funcionario (publico)
router.post('/login', funcionarioController.loginFuncionario);

router.use(autenticarFuncionario);

// QR Code diario do entregador: quem gerencia funcionarios busca/exibe o QR
// (pra imprimir/mostrar na loja); o entregador manda de volta o que leu com
// a camera pra confirmar presenca e entrar na fila do dia.
router.get('/qrcode-entregador', exigirPermissao('gerenciar_funcionarios'), funcionarioController.obterQrcodeDoDia);
router.post('/checkin', funcionarioController.checkinEntregador);

// App do entregador: oferta/aceite/recusa/conclusao da entrega. So o
// proprio entregador enxerga e mexe nas entregas atribuidas a ele (o
// controller sempre filtra por req.funcionarioId).
router.get('/entregas/pendente', pedidoController.listarEntregaPendente);
router.get('/entregas/atual', pedidoController.entregaAtual);
router.put('/entregas/:id/aceitar', pedidoController.aceitarEntrega);
router.put('/entregas/:id/recusar', pedidoController.recusarEntrega);
router.put('/entregas/:id/encerrar', pedidoController.encerrarEntrega);

// Funcionarios
router.get('/', exigirPermissao('gerenciar_funcionarios'), funcionarioController.listar);
router.post('/', exigirPermissao('gerenciar_funcionarios'), funcionarioController.criar);
router.put('/:id', exigirPermissao('editar_funcionarios'), funcionarioController.atualizar);
router.put('/:id/cadastro-completo', exigirCargoAdministrativo, funcionarioController.atualizarCadastroCompleto);
router.delete('/:id', exigirPermissao('gerenciar_funcionarios'), funcionarioController.excluir);

// Equipe operacional (aba "Equipe"): cozinha, entregadores (com fila de
// atribuicao automatica) e atendimento.
router.get('/equipe', exigirPermissao('gerenciar_funcionarios'), funcionarioController.listarEquipeOperacional);

// Disponibilidade do entregador pra fila de atribuicao automatica: o
// controller ja verifica se e o proprio entregador ou quem tem a
// permissao 'gerenciar_funcionarios', entao nao ha checagem de permissao aqui.
router.put('/:id/disponibilidade', funcionarioController.alternarDisponibilidadeEntregador);

// Trocar senha: cada funcionario pode trocar a propria (verificado dentro do
// controller); para trocar a de outro, precisa da permissao 'editar_funcionarios'.
router.put('/:id/senha', (req, res, next) => {
  if (req.funcionarioId && req.funcionarioId === req.params.id) return next();
  return exigirPermissao('editar_funcionarios')(req, res, next);
}, funcionarioController.trocarSenha);

// Clientes (ligado a quem pode criar pedidos, ja que cadastro de cliente
// normalmente acontece junto de um pedido por telefone/balcao)
router.get('/clientes', exigirPermissao('criar_pedidos'), clienteController.listar);
router.get('/clientes/telefone/:telefone', exigirPermissao('criar_pedidos'), clienteController.buscarPorTelefone);
router.post('/clientes', exigirPermissao('criar_pedidos'), clienteController.criarOuAtualizar);
router.put('/clientes/:id', exigirPermissao('criar_pedidos'), clienteController.atualizar);

// Auditoria (mesma permissao de quem gerencia funcionarios, por ser dado sensivel)
router.get('/auditoria', exigirPermissao('gerenciar_funcionarios'), clienteController.listarAuditoria);

module.exports = router;
