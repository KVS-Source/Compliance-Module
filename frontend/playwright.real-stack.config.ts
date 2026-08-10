import { defineConfig, devices } from "@playwright/test";

/**
 * Real-stack Playwright — browser talks to a live API + PostgreSQL.
 *
 * Separate from the default mocked suite (`playwright.config.ts`). That suite
 * is fast and covers rendering; this one fails when the backend is broken.
 *
 * Start the API yourself first (or set REAL_STACK_API_URL). Default expects
 * the backend on :8000 and the Vite app on :5173 with Vite proxying /api.
 *
 * Do not use page.route intercepts here.
 */
export default defineConfig({
  testDir: "./tests-real-stack",
  testMatch: /.*\.e2e\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.REAL_STACK_BASE_URL ?? "http://127.0.0.1:5173",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
