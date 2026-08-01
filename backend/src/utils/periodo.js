// ===================================================================
// Utilitario de resolucao de periodo para relatorios de vendas
// Caminho no projeto: backend/src/utils/periodo.js
// ===================================================================
// Recebe o parametro "intervalo" (ex: hoje, ontem, 7dias, 15dias, mes,
// ano, personalizado) e devolve { inicio, fim } como objetos Date, prontos
// para usar num WHERE criado_em BETWEEN inicio AND fim.
// "mes" e "ano" aqui sao janelas moveis (ultimos 30 / 365 dias), nao o
// mes/ano civil -- mais simples e nao depende de fuso do servidor.
// ===================================================================

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

function resolverIntervalo(intervalo, dataInicioPersonalizada, dataFimPersonalizada) {
  const agora = new Date();

  switch (intervalo) {
    case 'ontem': {
      const ontem = new Date(agora);
      ontem.setDate(ontem.getDate() - 1);
      return { inicio: inicioDoDia(ontem), fim: fimDoDia(ontem) };
    }
    case '7dias': {
      const inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 6);
      return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
    }
    case '15dias': {
      const inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 14);
      return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
    }
    case 'mes': {
      const inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
    }
    case 'ano': {
      const inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 364);
      return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
    }
    case 'personalizado': {
      if (!dataInicioPersonalizada || !dataFimPersonalizada) {
        return { inicio: inicioDoDia(agora), fim: fimDoDia(agora) };
      }
      return { inicio: inicioDoDia(dataInicioPersonalizada), fim: fimDoDia(dataFimPersonalizada) };
    }
    case 'hoje':
    default:
      return { inicio: inicioDoDia(agora), fim: fimDoDia(agora) };
  }
}

module.exports = { resolverIntervalo };
