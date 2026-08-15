// ===================================================================
// Numeracao mensal por estabelecimento (comprovante de auditoria)
// ---------------------------------------------------------------------
// Gera o proximo numero de comanda/pedido, sempre comecando em 1 no
// dia 1 de cada mes, sem repetir dentro do mesmo mes -- por
// estabelecimento (nao e mais uma sequencia global do sistema todo).
//
// Usa UPSERT atomico (INSERT ... ON CONFLICT DO UPDATE) pra evitar
// corrida entre duas vendas acontecendo ao mesmo tempo no mesmo
// estabelecimento -- o banco garante que cada numero so sai uma vez.
// ===================================================================
const { query } = require('../config/database');

function anoMesAtual() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

// tipo: 'comanda' | 'pedido'
async function proximoNumero(estabelecimentoId, tipo) {
  const anoMes = anoMesAtual();
  const resultado = await query(
    `INSERT INTO contadores_mensais (estabelecimento_id, tipo, ano_mes, ultimo_numero)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (estabelecimento_id, tipo, ano_mes)
     DO UPDATE SET ultimo_numero = contadores_mensais.ultimo_numero + 1
     RETURNING ultimo_numero`,
    [estabelecimentoId, tipo, anoMes]
  );
  return { numero: resultado.rows[0].ultimo_numero, anoMes };
}

module.exports = { proximoNumero, anoMesAtual };
