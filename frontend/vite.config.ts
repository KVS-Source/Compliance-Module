import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const prototypeReference = (): Plugin => ({
  name: "genbioca-prototype-reference",
  configureServer(server) {
    const serveReference = (url: string, file: string) => {
      server.middlewares.use(url, (_request, response) => {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        createReadStream(resolve(import.meta.dirname, file)).pipe(response);
      });
    };
    serveReference(
      "/prototype/GenBioCa-Compliance-Platform.html",
      "../docs/prototype/GenBioCa-Compliance-Platform.html",
    );
    serveReference(
      "/prototype/GenBioCa-Compliance-Platform-v2.html",
      "../GenBioCa-Compliance-Platform (1).html",
    );
  },
});

/**
 * The dev server port and its API proxy target are configurable so a second
 * stack can run alongside the default one — parallel worktrees, or the
 * real-stack E2E runner bringing up its own API on a spare port. Defaults are
 * unchanged, so an ordinary `npm run dev` behaves exactly as before.
 */
const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), prototypeReference()],
  server: {
    port: devPort,
    strictPort: true,
    proxy: {
      "/api": apiProxyTarget,
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
