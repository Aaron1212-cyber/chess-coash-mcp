// [accuracy %, Chess.com game rating]
export const CAL: [number, number][] = [
  [11.63, 100],   // likely Chess.com's floor, not a real measurement
  [62.48, 600],
  [83.87, 1250],
];

export function estimateGameRating(acc: number, cal: [number, number][] = CAL) {
  const q = [...cal].sort((a, b) => a[0] - b[0]);
  const n = q.length;
  let r: number;
  let flag = "";
  if (acc <= q[0][0]) {
    r = q[0][1];
    if (acc < q[0][0]) flag = "below calibration range";
  } else if (acc >= q[n - 1][0]) {
    const s = (q[n - 1][1] - q[n - 2][1]) / Math.max(q[n - 1][0] - q[n - 2][0], 0.01);
    r = q[n - 1][1] + s * (acc - q[n - 1][0]);
    if (acc > q[n - 1][0]) flag = "extrapolated, rough guess";
  } else {
    const i = q.findIndex((p, k) => k < n - 1 && acc >= p[0] && acc <= q[k + 1][0]);
    const t = (acc - q[i][0]) / (q[i + 1][0] - q[i][0]);
    r = q[i][1] + t * (q[i + 1][1] - q[i][1]);
  }
  return {
    rating: Math.min(3000, Math.max(100, Math.round(r / 50) * 50)),
    flag,
  };
}
