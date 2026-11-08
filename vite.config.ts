import { cpSync, createReadStream, mkdirSync, rmSync } from "node:fs";
import { extname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const ortFiles = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

function ortRuntime(): Plugin {
  const source = resolve("node_modules/onnxruntime-web/dist");
  return {
    name: "ort-runtime",
    buildStart() {
      rmSync(resolve("public/ort"), { recursive: true, force: true });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/ort/")) return next();
        const name = decodeURIComponent(url.slice("/ort/".length));
        if (!ortFiles.includes(name)) return next();
        res.setHeader("Content-Type", extname(name) === ".wasm" ? "application/wasm" : "text/javascript");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        createReadStream(resolve(source, name)).pipe(res);
      });
    },
    writeBundle() {
      const dest = resolve("dist/ort");
      mkdirSync(dest, { recursive: true });
      for (const file of ortFiles) cpSync(resolve(source, file), resolve(dest, file));
    },
  };
}

export default defineConfig({
  plugins: [ortRuntime()],
  server: {
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
