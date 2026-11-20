import { Chess, type Move } from "chess.js";

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const mv = (m: Move) => ({ from: m.from, to: m.to, promotion: m.promotion });

function mateIn1(c: Chess): Move | null {
  for (const m of c.moves({ verbose: true })) {
    c.move(mv(m)); const mate = c.isCheckmate(); c.undo();
    if (mate) return m;
  }
  return null;
}

/** Forced mate in 2 via a CHECK first move (quiet mating moves are not searched). */
function isMate2Move(c: Chess, m: Move): boolean {
  if (!m.san.includes("+") && !m.san.includes("#")) return false;
  c.move(mv(m));
  let ok = c.isCheckmate();
  if (!ok) {
    const replies = c.moves({ verbose: true });
    ok = replies.length > 0 && replies.every((r) => { c.move(mv(r)); const f = mateIn1(c) !== null; c.undo(); return f; });
  }
  c.undo();
  return ok;
}
function findMate2(c: Chess): Move | null {
  for (const m of c.moves({ verbose: true })) if (isMate2Move(c, m)) return m;
  return null;
}

/** Biggest 1-ply material loss the side to move can inflict by capturing (counts a recapture). */
function worstHang(c: Chess): { loss: number; piece: string; square: string } | null {
  let best: { loss: number; piece: string; square: string } | null = null;
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured) continue;
    c.move(mv(m));
    const recapture = c.moves({ verbose: true }).some((r) => r.to === m.to && r.captured);
    c.undo();
    const loss = VAL[m.captured] - (recapture ? VAL[m.piece] : 0);
    if (loss >= 3 && (!best || loss > best.loss)) best = { loss, piece: m.captured, square: m.to };
  }
  return best;
}

export interface Finding { move_no: number; san: string; type: string; detail: string }

export function analyzeGame(pgn: string, color: "white" | "black") {
  const src = new Chess(); src.loadPgn(pgn);
  if (src.getHeaders().SetUp === "1" || src.getHeaders().Variant) throw new Error("Only standard chess supported");
  const hist = src.history({ verbose: true });
  const board = new Chess();
  const me = color === "white" ? "w" : "b";
  const findings: Finding[] = [];
  let myMoves = 0;

  hist.forEach((m, i) => {
    const no = Math.floor(i / 2) + 1;
    if (m.color !== me) { board.move(mv(m)); return; }
    myMoves++;
    const m1 = mateIn1(board);
    if (m1) {
      if (!m.san.endsWith("#")) findings.push({ move_no: no, san: m.san, type: "missed_mate_in_1", detail: `${m1.san} mates` });
    } else {
      const m2 = findMate2(board);
      if (m2 && !isMate2Move(board, m)) findings.push({ move_no: no, san: m.san, type: "missed_mate_in_2", detail: `${m2.san} forces mate in 2` });
    }
    board.move(mv(m));
    if (!board.isGameOver()) {
      const allowed = mateIn1(board);
      if (allowed) findings.push({ move_no: no, san: m.san, type: "allowed_mate_in_1", detail: `${allowed.san} mates` });
      else {
        const h = worstHang(board);
        if (h) findings.push({ move_no: no, san: m.san, type: "hung_material_candidate", detail: `opponent wins ${h.piece} on ${h.square} (net ~${h.loss})` });
      }
    }
  });

  const count = (t: string) => findings.filter((f) => f.type === t).length;
  return {
    my_moves: myMoves,
    counts: {
      missed_mates: count("missed_mate_in_1") + count("missed_mate_in_2"),
      allowed_mate_in_1: count("allowed_mate_in_1"),
      hung_material_candidates: count("hung_material_candidate"),
    },
    findings,
    note: "Engine-free pattern scan: mate-in-1/2 (checking first move only) and 1-ply hanging material. Not a full engine review; confirm turning points in Chess.com Game Review.",
  };
}
