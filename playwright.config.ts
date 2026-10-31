import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  // The dev server compiles each route on first visit.
  expect: { timeout: 20_000 },
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Against a deployed URL (E2E_BASE_URL) no local server is started.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npx next dev -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
});
