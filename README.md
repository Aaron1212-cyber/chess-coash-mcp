# chess-coach-mcp
Remote MCP server (Next.js + mcp-handler) for Chess.com data. Endpoint: `/api/mcp`.

Tools: `get_stats`, `get_games`, `weekly_summary`, `analyze_game` (engine-free mate/hang scan), `engine_review` (Stockfish 19 lite WASM: cp loss, blunders, key moments), `evaluate_position` (FEN eval).

Engine: `stockfish` npm package, lite single-threaded build, one shared instance per warm serverless instance. License: GPL-3.0 (engine only).

## Deploy
1. `git init && git add . && git commit -m init`, push to GitHub
2. vercel.com → New Project → import repo (framework: Next.js)
3. Env vars: `CHESSCOM_USER=aaronrpe2`, `CHESSCOM_CONTACT=<your email>`, optional `TZ_DISPLAY=Europe/Berlin`
4. Claude: Settings → Connectors → Add custom connector → `https://<project>.vercel.app/api/mcp`

Note: endpoint is public (serves only public Chess.com data). Anyone with the URL can call it; keep it unshared.
