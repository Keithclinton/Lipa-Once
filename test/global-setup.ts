import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Tests get their own SQLite file, recreated from the schema on every run.
// Only this throwaway file is touched, never the dev database.
export default function setup() {
  rmSync("prisma/test.db", { force: true });
  rmSync("prisma/test.db-journal", { force: true });
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
