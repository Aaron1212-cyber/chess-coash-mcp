import type { NormGame } from "./chesscom";

const pct = (w: number, n: number) => (n ? Math.round((100 * w) / n) : 0);
function group(games: NormGame[], key: (g: NormGame) => string, min = 1) {
  const m = new Map<string, NormGame[]>();
  for (const g of games) { const k = key(g); if (!m.has(k)) m.set(k, []); m.get(k)!.push(g); }
  return [...m.entries()].filter(([, a]) => a.length >= min).map(([k, a]) => {
    const W = a.filter((x) => x.outcome === "win").length, D = a.filter((x) => x.outcome === "draw").length;
    return { key: k, games: a.length, W, D, L: a.length - W - D, score_pct: pct(W + D / 2, a.length) };
  }).sort((a, b) => b.games - a.games);
}

export function summarize(games: NormGame[]) {
  const n = games.length;
  const w = games.filter((g) => g.outcome === "win").length, d = games.filter((g) => g.outcome === "draw").length;
  const lossBy = (h: string) => games.filter((g) => g.outcome === "loss" && g.how === h).length;
  const acc = games.filter((g) => g.accuracy != null).map((g) => g.accuracy as number);
  let streak = 0; const last = games[n - 1]?.outcome;
  for (let i = n - 1; i >= 0 && games[i].outcome === last; i--) streak++;
  return {
    games: n, W: w, D: d, L: n - w - d, score_pct: pct(w + d / 2, n),
    current_streak: n ? `${last} x${streak}` : "none",
    losses: { checkmated: lossBy("checkmated"), resigned: lossBy("resigned"), timeout: lossBy("timeout") },
    avg_accuracy: acc.length ? Math.round((acc.reduce((a, b) => a + b, 0) / acc.length) * 10) / 10 : null,
    avg_opp_rating: n ? Math.round(games.reduce((a, g) => a + g.opp_rating, 0) / n) : null,
    by_time_class: group(games, (g) => g.time_class),
    by_colour: group(games, (g) => g.color),
    by_time_of_day: group(games, (g) => g.time_of_day),
    by_opening: group(games, (g) => `${g.color}: ${g.opening}`).slice(0, 12),
    worst_openings: group(games, (g) => `${g.color}: ${g.opening}`, 2).sort((a, b) => a.score_pct - b.score_pct).slice(0, 5),
  };
}
