// Prisma can't read the datasource provider from an env var, so this script
// rewrites it based on DATABASE_URL: postgres URLs get "postgresql",
// anything else stays on "sqlite". Run before `prisma generate`.
import { readFileSync, writeFileSync } from "node:fs";

const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const url = process.env.DATABASE_URL ?? "";
const provider = /^postgres(ql)?:\/\//.test(url) ? "postgresql" : "sqlite";

const schema = readFileSync(schemaPath, "utf8");
const updated = schema.replace(
  /(datasource db \{[^}]*provider\s*=\s*)"[^"]+"/,
  `$1"${provider}"`,
);

if (updated !== schema) {
  writeFileSync(schemaPath, updated);
}
console.log(`Prisma datasource provider: ${provider}`);
