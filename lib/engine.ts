import { Chess } from "chess.js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import stockfishInit from "stockfish";

const CLAMP = 1000;
export interface Eval { cp: number; best: string | null; mate: number | null } // cp from SIDE-TO-MOVE view

export class Engine {
  private sf: any;
  private resolver: ((e: Eval) => void) | null = null;
  private last: Eval = { cp: 0, best: null, mate: null };
  private ready: Promise<void>;
  private readyRes!: () => void;

  constructor() {
    this.ready = new Promise((r) => (this.readyRes = r));
    this.sf = (stockfishInit as any)("lite-single", (line: string) => this.onLine(String(line)));
    this.sf.processCommand("uci");
  }
  private onLine(line: string) {
    if (line === "uciok") setTimeout(() => this.sf.processCommand("isready"), 0);
    else if (line === "readyok") this.readyRes();
    else if (line.startsWith("info") && line.includes(" score ") && !line.includes("lowerbound") && !line.includes("upperbound")) {
      const m = /score (cp|mate) (-?\d+)/.exec(line);
      if (m) {
        const v = Number(m[2]);
        this.last = m[1] === "cp" ? { cp: Math.max(-CLAMP, Math.min(CLAMP, v)), best: this.last.best, mate: null }
                                  : { cp: v > 0 ? CLAMP : -CLAMP, best: this.last.best, mate: v };
      }
    } else if (line.startsWith("bestmove")) {
      const b = /bestmove (\S+)/.exec(line)?.[1];
      const out = { ...this.last, best: b && b !== "(none)" ? b : null };
      const r = this.resolver; this.resolver = null; r?.(out);
    }
  }
  async evaluate(fen: string, depth = 10): Promise<Eval> {
    await this.ready;
    this.last = { cp: 0, best: null, mate: null };
    return new Promise((res) => {
      this.resolver = res;
      setTimeout(() => {
        this.sf.processCommand("position fen " + fen);
        this.sf.processCommand("go depth " + depth);
      }, 0);
    });
  }
}

// The WASM module can only be instantiated once per process, so share one engine and serialise use.
let shared: Engine | null = null;
let lock: Promise<unknown> = Promise.resolve();
function withEngine<T>(fn: (e: Engine) => Promise<T>): Promise<T> {
  const run = lock.then(() => fn((shared ??= new Engine())));
  lock = run.catch(() => undefined);
  return run;
}

/** Eval of a position from WHITE's view, handling game-over positions without the engine. */
async function evalWhite(eng: Engine, fen: string, depth: number) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { cp: c.turn() === "w" ? -CLAMP : CLAMP, best: null, mate: 0 };
  if (c.isGameOver()) return { cp: 0, best: null, mate: null };
  const e = await eng.evaluate(fen, depth);
  return { cp: c.turn() === "w" ? e.cp : -e.cp, best: e.best, mate: e.mate };
}

const uciToSan = (fen: string, uci: string | null) => {
  if (!uci) return null;
  try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? null; } catch { return null; }
};

export function evaluatePosition(fen: string, depth = 12) {
  return withEngine(async (eng) => {
    const c = new Chess(fen);
    const e = await evalWhite(eng, fen, depth);
    return { fen, side_to_move: c.turn() === "w" ? "white" : "black", eval_white_cp: e.cp, mate_in: e.mate, best_move: uciToSan(fen, e.best), depth };
  });
}

export async function reviewGame(pgn: string, color: "white" | "black", depth = 10, budgetMs = 48_000) {
  const t0 = Date.now();
  const src = new Chess(); src.loadPgn(pgn);
  if (src.getHeaders().SetUp === "1" || src.getHeaders().Variant) throw new Error("Only standard chess supported");
  const hist = src.history({ verbose: true });
  const fens = [hist[0]?.before ?? new Chess().fen(), ...hist.map((m) => m.after)];
  const ev: { cp: number; best: string | null; mate: number | null }[] = [];
  let truncated = false;
  await withEngine(async (eng) => {
    for (const f of fens) {
      if (Date.now() - t0 > budgetMs) { truncated = true; break; }
      ev.push(await evalWhite(eng, f, depth));
    }
  });

  const me = color === "white" ? 1 : -1, mover = color === "white" ? "w" : "b";
  const moves: { no: number; san: string; before: number; after: number; loss: number; best: string | null; fen: string }[] = [];
  hist.forEach((m, i) => {
    if (m.color !== mover || i + 1 >= ev.length) return;
    const before = ev[i].cp * me, after = ev[i + 1].cp * me;
    const bothDecided = (before > 600 && after > 600) || (before < -600 && after < -600);
    const loss = bothDecided ? 0 : Math.max(0, before - after);
    moves.push({ no: Math.floor(i / 2) + 1, san: m.san, before, after, loss, best: uciToSan(fens[i], ev[i].best), fen: fens[i] });
  });

  const n = moves.length;
  const cnt = (lo: number, hi: number) => moves.filter((x) => x.loss >= lo && x.loss < hi).length;
  const blunders = cnt(300, 1e9), mistakes = cnt(150, 300), inacc = cnt(70, 150);
  const evalAt = (no: number) => { const m = moves.find((x) => x.no === no); return m ? m.after : null; };
  const key = [...moves].filter((x) => x.loss >= 150).sort((a, b) => b.loss - a.loss).slice(0, 4)
    .sort((a, b) => a.no - b.no)
    .map((x) => ({ move_no: x.no, played: x.san, best: x.best, eval_before: x.before, eval_after: x.after, cp_lost: x.loss, blown_win: x.before >= 200 && x.after <= 50 }));
  return {
    depth, engine: "Stockfish 19 lite (WASM)", positions_evaluated: ev.length, truncated,
    my_moves: n,
    avg_cp_loss: n ? Math.round(moves.reduce((a, x) => a + x.loss, 0) / n) : null,
    blunders, mistakes, inaccuracies: inacc,
    blunders_per_40: n ? Math.round((blunders * 40 / n) * 10) / 10 : null,
    eval_after_my_move: { m10: evalAt(10), m20: evalAt(20), m30: evalAt(30), m40: evalAt(40) },
    key_moments: key,
    note: "Evals in centipawns from YOUR view (+100 ≈ one pawn up). Shallow lite engine: reliable for blunders (≥300) and mistakes (≥150), noisy for small losses. Thresholds are my own, not Chess.com's.",
  };
}
