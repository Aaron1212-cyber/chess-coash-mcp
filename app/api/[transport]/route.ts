import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { Chess } from "chess.js";
import { cc, DEFAULT_USER, monthGames, recentGames, normalize, type RawGame } from "@/lib/chesscom";
import { analyzeGame } from "@/lib/analyze";
import { summarize } from "@/lib/summary";
import { reviewGame, evaluatePosition } from "@/lib/engine";
import { estimateGameRating } from "@/lib/gameRating";

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 1) }] });
const user = (u?: string) => (u ?? DEFAULT_USER).toLowerCase();
const TZ = process.env.TZ_DISPLAY ?? "Europe/Berlin";
async function loadGame(u: string, pgn?: string, game_url?: string) {
  let raw: RawGame | undefined;
  if (!pgn) {
    const games = (await recentGames(u, 3)).filter((g) => g.rules === "chess" && g.pgn);
    raw = game_url ? games.find((g) => g.url.split("/").pop() === game_url.split("/").pop()) : games[games.length - 1];
    if (!raw) return null;
    pgn = raw.pgn!;
  }
  const white = /\[White "([^"]+)"\]/.exec(pgn)?.[1]?.toLowerCase();
  return { raw, pgn, color: (white === u ? "white" : "black") as "white" | "black" };
}
const TC = z.enum(["rapid", "blitz", "bullet", "daily"]);

const handler = createMcpHandler(
  (server) => {
    server.tool("get_stats", "Current Chess.com ratings (rapid, blitz, bullet, daily) with best rating and W/L/D record.",
      { username: z.string().optional() },
      async ({ username }) => {
        const s: any = await cc(`/player/${user(username)}/stats`);
        const pick = (k: string) => (s[k] ? { rating: s[k].last?.rating, best: s[k].best?.rating, record: s[k].record } : undefined);
        return text({ user: user(username), rapid: pick("chess_rapid"), blitz: pick("chess_blitz"), bullet: pick("chess_bullet"), daily: pick("chess_daily") });
      });

    server.tool("get_games", "List games of one month (default: current) in compact form: result, colour, opponent rating, opening, accuracy, URL. Newest first.",
      { month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM"), time_class: TC.optional(), limit: z.number().int().min(1).max(100).default(30), username: z.string().optional() },
      async ({ month, time_class, limit, username }) => {
        const [y, m] = (month ?? new Date().toISOString().slice(0, 7)).split("-");
        let g = (await monthGames(user(username), y, m)).map((x) => normalize(x, user(username), TZ));
        if (time_class) g = g.filter((x) => x.time_class === time_class);
        g = g.map((x) => ({ ...x, est_game_rating: x.accuracy == null ? null : estimateGameRating(x.accuracy).rating }));
        return text({ total: g.length, games: g.slice(-limit).reverse() });
      });

    server.tool("weekly_summary", "Aggregate the last N days: score, losses by type, results by time class / colour / time of day / opening, average accuracy. Use to compare with the 16 Nov baseline.",
      { days: z.number().int().min(1).max(90).default(7), time_class: TC.optional(), username: z.string().optional() },
      async ({ days, time_class, username }) => {
        const since = Date.now() / 1000 - days * 86400;
        const raw = (await recentGames(user(username), days > 28 ? 4 : 2)).filter((g) => g.end_time >= since && g.rules === "chess");
        let g = raw.map((x) => normalize(x, user(username), TZ));
        if (time_class) g = g.filter((x) => x.time_class === time_class);
        return text({ window_days: days, ...summarize(g) });
      });

    server.tool("analyze_game", "Scan one game for missed mates (in 1/2), allowed mates and hung material. Provide a PGN, a Chess.com game URL, or nothing (= latest game). Engine-free pattern scan, not Stockfish.",
      { pgn: z.string().optional(), game_url: z.string().optional(), username: z.string().optional() },
      async ({ pgn, game_url, username }) => {
        const u = user(username);
        let raw: RawGame | undefined;
        if (!pgn) {
          const games = (await recentGames(u, 3)).filter((g) => g.rules === "chess" && g.pgn);
          raw = game_url ? games.find((g) => g.url.split("/").pop() === game_url.split("/").pop()) : games[games.length - 1];
          if (!raw) return text("Game not found in the last 3 months. Paste the PGN instead.");
          pgn = raw.pgn!;
        }
        const white = /\[White "([^"]+)"\]/.exec(pgn)?.[1]?.toLowerCase();
        const color = white === u ? "white" : "black";
        return text({ game: raw ? normalize(raw, u, TZ) : { color }, ...analyzeGame(pgn, color) });
      });

    server.tool("engine_review", "Stockfish 19 (lite, WASM) review of one game: average centipawn loss, blunders/mistakes/inaccuracies, blunders per 40 moves, eval after moves 10/20/30/40, and the key moments with the better move. Provide a PGN, a Chess.com game URL, or nothing (= latest game).",
      { pgn: z.string().optional(), game_url: z.string().optional(), username: z.string().optional(), depth: z.number().int().min(6).max(16).default(12) },
      async ({ pgn, game_url, username, depth }) => {
        const u = user(username);
        const g = await loadGame(u, pgn, game_url);
        if (!g) return text("Game not found in the last 3 months. Paste the PGN instead.");
        return text({ game: g.raw ? normalize(g.raw, u, TZ) : { color: g.color }, ...(await reviewGame(g.pgn, g.color, depth)) });
      });

    server.tool("evaluate_position", "Stockfish evaluation of a single position (FEN): eval in centipawns from White's view, mate distance and best move.",
      { fen: z.string(), depth: z.number().int().min(6).max(18).default(14) },
      async ({ fen, depth }) => text(await evaluatePosition(fen, depth)));

    server.tool("game_rating", "Estimate Chess.com Game Review game rating from accuracy (fitted to a few reviewed games, approximate).",
      { accuracy: z.number().min(0).max(100) },
      async ({ accuracy }) => {
        const { rating, flag } = estimateGameRating(accuracy);
        return text({ accuracy, est_game_rating: rating, note: flag || "within calibration range" });
      });
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

export { handler as GET, handler as POST, handler as DELETE };
