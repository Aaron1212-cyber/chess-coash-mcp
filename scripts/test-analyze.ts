import { analyzeGame } from "../lib/analyze";
const show = (l: string, r: ReturnType<typeof analyzeGame>) => console.log(l, JSON.stringify({ c: r.counts, f: r.findings }));
show("black allows Qxf7#:", analyzeGame("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nd4 4. Qxf7#", "black"));
show("white misses Qxf7#:", analyzeGame("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nd4 4. Nc3 Nxc2+ 5. Kd1 Nxa1", "white"));
show("white plays mate:", analyzeGame("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#", "white"));
show("black hangs queen:", analyzeGame("1. e4 e5 2. Nf3 Qh4 3. Nxh4", "black"));
