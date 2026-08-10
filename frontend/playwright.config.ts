import { defineConfig, devices } from "@playwright/test";

/**
 * The dev-server port is configurable so parallel git worktrees can run their
 * own suites without colliding. `reuseExistingServer` is deliberate — it makes
 * repeat local runs fast — but it also means a server already listening on this
 * port will be reused *whatever source tree it was started from*. Two worktrees
 * on the default port silently test each other's code.
 *
 * Set E2E_PORT per worktree (and keep it out of CI, where the default is fine).
 */
const port = Number(process.env.E2E_PORT ?? 5173);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.e2e\.ts/,
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  use: {
    baseURL: origin,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `${origin}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
