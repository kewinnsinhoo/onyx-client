// Cálculos de estadísticas (funciones puras).
// Máximo de jugadores a la vez por día (función pura, también la usa el test)
export function peaksByDay(plays, since, until) {
  const DAY = 864e5;
  const start = Math.floor(since / DAY) * DAY;
  const out = [];
  for (let d = start; d <= until; d += DAY) out.push({ day: d, peak: 0 });
  const events = [];
  for (const p of plays) { events.push([p.started_at, 1]); events.push([Math.max(p.end_at, p.started_at), -1]); }
  events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cur = 0;
  for (const [ts, delta] of events) {
    cur += delta;
    const i = Math.floor((ts - start) / DAY);
    if (i >= 0 && i < out.length && cur > out[i].peak) out[i].peak = cur;
  }
  return out;
}

