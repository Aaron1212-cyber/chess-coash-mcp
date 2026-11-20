import { reviewGame, evaluatePosition } from "../lib/engine";
const keep = setInterval(() => {}, 1000);
(async () => {
  let t = Date.now();
  console.log(JSON.stringify(await evaluatePosition("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", 12)), Date.now() - t, "ms");
  t = Date.now();
  // Black blunders with 3...Nd4?? allowing Qxf7#; white plays it
  const r = await reviewGame("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nd4 4. Qxf7#", "black", 10);
  console.log(JSON.stringify(r, null, 1), Date.now() - t, "ms");
  t = Date.now();
  const long = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Bg5 h6 8. Bh4 g5 9. Bg3 Bg4 10. h3 Bxf3 11. Qxf3 Nd4 12. Qd1 Nxc2 13. Qxc2 Nh5 14. Nd2 Nxg3 15. fxg3 Qf6 16. Rxf6";
  const r2 = await reviewGame(long, "white", 10);
  console.log(JSON.stringify(r2, null, 1), Date.now() - t, "ms");
  clearInterval(keep);
})();
