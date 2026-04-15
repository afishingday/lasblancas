/**
 * Recaudo “histórico” desde el 30 de abril de 2026: cada proyecto puede tener
 * `historicRaisedBaseline` (COP ya contados antes de esa ventana). Lo mostrado es max(0, raised - baseline).
 */
export const HISTORIC_RECAUDO_SINCE_LABEL = '30 de abril de 2026'

export function fundHistoricDisplayRaised(fund) {
  const raised = Number(fund?.raised)
  const baseline = Number(fund?.historicRaisedBaseline)
  const r = Number.isFinite(raised) && raised > 0 ? Math.round(raised) : 0
  const b = Number.isFinite(baseline) && baseline > 0 ? Math.round(baseline) : 0
  return Math.max(0, r - b)
}

export function sumFundsHistoricDisplayRaised(funds) {
  return (funds || []).reduce((acc, f) => acc + fundHistoricDisplayRaised(f), 0)
}
