/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["stockfish"],
  // The engine file is chosen at runtime, so Next can't trace it. Include only the lite single-threaded build.
  outputFileTracingIncludes: {
    "/api/[transport]": ["./node_modules/stockfish/package.json", "./node_modules/stockfish/scripts/*", "./node_modules/stockfish/bin/stockfish-19-lite-single.*"],
  },
  outputFileTracingExcludes: {
    "*": ["./node_modules/stockfish/bin/stockfish-19.*", "./node_modules/stockfish/bin/stockfish-19-single.*", "./node_modules/stockfish/bin/stockfish-19-lite.*", "./node_modules/stockfish/bin/stockfish-19-asm.js"],
  },
};
