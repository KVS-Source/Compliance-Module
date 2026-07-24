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

export default defineConfig({
  plugins: [react(), prototypeReference()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
