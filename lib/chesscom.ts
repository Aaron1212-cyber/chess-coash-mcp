const BASE = "https://api.chess.com/pub";
const UA = `chess-coach-mcp (${process.env.CHESSCOM_CONTACT ?? "no-contact-set"})`;
export const DEFAULT_USER = (process.env.CHESSCOM_USER ?? "aaronrpe2").toLowerCase();

const cache = new Map<string, { t: number; v: unknown }>();
export async function cc<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < 120_000) return hit.v as T; // 2 min cache per warm instance
  const r = await fetch(BASE + path, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Chess.com API ${r.status} for ${path}`);
  const v = await r.json();
  cache.set(path, { t: Date.now(), v });
  return v as T;
}

export interface RawGame {
  url: string; pgn?: string; time_control: string; end_time: number; rated: boolean;
  time_class: string; rules: string;
  accuracies?: { white: number; black: number };
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

export async function monthGames(user: string, y: number | string, m: number | string): Promise<RawGame[]> {
  const mm = String(m).padStart(2, "0");
  try { return (await cc<{ games: RawGame[] }>(`/player/${user}/games/${y}/${mm}`)).games ?? []; }
  catch (e) { if (String(e).includes(" 404 ")) return []; throw e; }
}

/** Last `months` calendar months, oldest first. */
export async function recentGames(user: string, months = 2): Promise<RawGame[]> {
  const now = new Date(); const out: RawGame[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(...(await monthGames(user, d.getUTCFullYear(), d.getUTCMonth() + 1)));
  }
  return out;
}

const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);

export function normalize(g: RawGame, user: string, tz = "Europe/Berlin") {
  const u = user.toLowerCase();
  const color = g.white.username.toLowerCase() === u ? "white" : "black";
  const me = g[color], opp = g[color === "white" ? "black" : "white"];
  const outcome = me.result === "win" ? "win" : DRAWS.has(me.result) ? "draw" : "loss";
  const eco = /\[ECOUrl "([^"]+)"\]/.exec(g.pgn ?? "")?.[1] ?? "";
  const opening = eco ? decodeURIComponent(eco.split("/").pop() ?? "").replace(/-?\d+\..*$/, "").replace(/-/g, " ") : "unknown";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date(g.end_time * 1000)));
  const tod = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return {
    url: g.url, date: new Date(g.end_time * 1000).toISOString().slice(0, 16).replace("T", " "),
    time_class: g.time_class, time_control: g.time_control, rated: g.rated, rules: g.rules,
    color, outcome, how: me.result, my_rating: me.rating, opp_rating: opp.rating, opp: opp.username,
    opening, time_of_day: tod, accuracy: g.accuracies?.[color] ?? null,
  };
}
export type NormGame = ReturnType<typeof normalize>;
