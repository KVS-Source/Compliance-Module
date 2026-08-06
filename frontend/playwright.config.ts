import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.e2e\.ts/,
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  use: {
    baseURL: "http://127.0.0.1:5173",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173/login",
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
