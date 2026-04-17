/**
 * Suma del recaudo registrado en todos los proyectos (campo `raised` de cada fondo).
 */
export function sumFundsRaisedTotal(funds) {
  return (funds || []).reduce((acc, f) => {
    const r = Number(f?.raised)
    const n = Number.isFinite(r) && r > 0 ? Math.round(r) : 0
    return acc + n
  }, 0)
}
