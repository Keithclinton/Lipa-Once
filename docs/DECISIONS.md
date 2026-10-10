# Decisions

Short log of choices not dictated by the original plan.

## 2026-10-10 — Prisma 6, one schema for SQLite and Postgres
- Pinned Prisma 6.x. Prisma 7+ requires driver adapters and a config file, which adds setup without helping the demo.
- Prisma can't take the datasource provider from an env var, so `scripts/set-db-provider.mjs` sets it from `DATABASE_URL` (`postgres://…` → `postgresql`, otherwise `sqlite`). It runs on `postinstall` and `db:push`.
- The schema is applied with `prisma db push` rather than migrations, because migration history is provider-specific.

## 2026-10-10 — `Payment.settledAt`
- Added so the duplicate check can say "Already paid on {date}" from the settlement time rather than `updatedAt`.
- Added a unique constraint on `FeeSchedule(institutionId, level, term)` and an index on `Payment(institutionId, beneficiaryRef, term)` for the duplicate lookup.
