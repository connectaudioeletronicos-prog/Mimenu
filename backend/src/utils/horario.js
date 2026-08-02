// ===================================================================
// Utilitario de horario com fuso FIXO em America/Sao_Paulo
// Caminho no projeto: backend/src/utils/horario.js
// ===================================================================
// O servidor (Render) roda em UTC, mas toda carga horaria cadastrada no
// painel (expediente do entregador, QR Code do dia, hora extra) e pensada
// no horario de Brasilia. Usar `new Date().getHours()`/`toDateString()`
// direto compara contra o horario/data do SERVIDOR, nao do Brasil -- as
// 18h no Brasil viram "21h" pro servidor, derrubando o entregador do
// expediente mesmo estando dentro do horario cadastrado.
//
// Este utilitario sempre calcula em cima do fuso America/Sao_Paulo,
// independente de onde o servidor estiver hospedado (Render, Railway,
// local, etc.) -- assim o "agora" e o "hoje" usados aqui sao sempre os
// mesmos que aparecem no relogio do celular do entregador.
// ===================================================================

const FUSO = 'America/Sao_Paulo';
const DIAS_SEMANA_EN_PARA_PT = { Sun: 'dom', Mon: 'seg', Tue: 'ter', Wed: 'qua', Thu: 'qui', Fri: 'sex', Sat: 'sab' };

// Retorna { dataISO: 'YYYY-MM-DD', hora: 'HH:MM', diaSemana: 'seg'|'ter'|... }
// sempre no horario de Brasilia, seja qual for o fuso do servidor.
function agoraNoFuso() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short'
  }).formatToParts(new Date());

  const obter = (tipo) => partes.find(p => p.type === tipo)?.value;

  return {
    dataISO: `${obter('year')}-${obter('month')}-${obter('day')}`,
    hora: `${obter('hour')}:${obter('minute')}`,
    diaSemana: DIAS_SEMANA_EN_PARA_PT[obter('weekday')]
  };
}

// Converte um valor de coluna DATE do Postgres (ou qualquer Date/string)
// para 'YYYY-MM-DD', sem depender do fuso local do processo Node -- coluna
// DATE do Postgres nao tem componente de hora, entao extrair direto em UTC
// e seguro e nao sofre o mesmo problema de fuso do "agora".
function dataParaISO(valor) {
  if (!valor) return null;
  return new Date(valor).toISOString().slice(0, 10);
}

module.exports = { agoraNoFuso, dataParaISO, FUSO };
