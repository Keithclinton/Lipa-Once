# Decisions

Short log of choices not dictated by the original plan.

## 2026-10-10 — Prisma 6, one schema for SQLite and Postgres
- Pinned Prisma 6.x. Prisma 7+ requires driver adapters and a config file, which adds setup without helping the demo.
- Prisma can't take the datasource provider from an env var, so `scripts/set-db-provider.mjs` sets it from `DATABASE_URL` (`postgres://…` → `postgresql`, otherwise `sqlite`). It runs on `postinstall` and `db:push`.
- The schema is applied with `prisma db push` rather than migrations, because migration history is provider-specific.

## 2026-10-10 — `Payment.settledAt`
- Added so the duplicate check can say "Already paid on {date}" from the settlement time rather than `updatedAt`.
- Added a unique constraint on `FeeSchedule(institutionId, level, term)` and an index on `Payment(institutionId, beneficiaryRef, term)` for the duplicate lookup.

## 2026-10-10 — Fictional registry and seed history
- Five invented institutions (Mlima Girls Eldoret, Nyanza Lakeside Boys Kisumu, Upendo Day Nairobi, Pwani Heritage Mombasa, Tumaini County Referral Hospital Nakuru). Names, paybills and account numbers are made up.
- The demo's girls' school is "Mlima Girls" rather than a real national school.
- Term 2 and Term 3 fees are 65% and 45% of Term 1, rounded to KES 100.
- Hospital fee schedules are per service (Outpatient, Maternity, Inpatient, Surgery) with term `ANY`.
- Seed history is in 2026-T3 (the current term at demo time). It includes a SETTLED payment (`LM-H7K2P`, Mercy Jepkoech, Adm 3187) that the duplicate sample invoice will collide with, plus FLAG, FAILED, BLOCKED and PAYOUT_PENDING rows for the dashboard.
- Payout receivers default to `<slug>@business.example.com`; `PAYOUT_EMAIL_<SLUG>` overrides any of them with a real sandbox business account.
