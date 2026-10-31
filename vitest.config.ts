import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    // Database tests use a throwaway SQLite file, reset once per run.
    env: { DATABASE_URL: "file:./test.db", FX_KES_PER_USD: "129" },
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
  },
});
