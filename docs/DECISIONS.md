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

## 2026-10-31 — One `POST /api/payments` route instead of `/api/extract` + `/api/verify`
- Upload, extraction, rule checks, AI review and pricing run in one request (`lib/payments.ts`), and the result is stored as a Payment (`VERIFIED` or `BLOCKED`). This keeps the client simple and means a verdict can never be computed without being saved.
- The route accepts `sample=genuine|doctored|blurry|duplicate` so `/demo` can run the real flow on the bundled sample invoices.
- Upload type is detected from the file's bytes, not the browser's MIME type.
- `Payment.verdictReasons` stores `{ summary, findings[], concerns[] }` (rule findings with severity, plus the AI's summary and extra concerns). Seeded rows still use a plain string list; `readVerdictDetails()` reads both.

## 2026-10-31 — AI review can raise, never lower
- `lib/ai/explain.ts` adds a short summary and extra concerns. Any concern lifts APPROVE to FLAG; nothing lowers a verdict. If the call fails, the rule findings are shown on their own.
- AI calls use structured outputs (zod). The server-side refusal fallback (`fallbacks: "default"`) is sent only to models that support it; Claude Haiku 5.5 has none.

## 2026-10-31 — "Ask Lipa Moja" uses our own tools, not the PayPal Agent Toolkit
- The assistant is a Claude tool-runner agent (`lib/ai/assistant.ts`) with five tools, all scoped to the dashboard's institution: `search_payments`, `unpaid_students`, `payment_totals`, `check_payout` (live PayPal Payouts lookup) and `send_fee_invoice` (PayPal Invoicing).
- Custom tools rather than the Agent Toolkit/MCP server, so every tool can be limited to one school's data and the agent has no refund or payout capability at all.
- Added a `Student` roster so "who hasn't paid?" compares enrolment with settled payments.
- Each PayPal invoice is backed by a VERIFIED Payment priced from the school's fee schedule. `INVOICING.INVOICE.PAID` (or polling) moves it to PAID and it is paid out like any other bill.

## 2026-10-31 — Tests use a throwaway SQLite file
- `vitest.config.ts` points `DATABASE_URL` at `prisma/test.db`, which the global setup deletes and recreates with `prisma db push`. Prisma refuses `--force-reset` when run by an AI agent, and deleting a dedicated test file avoids touching the dev database.

## 2026-11-01 — Sample invoices can be paid by every demo visitor
- Paying a sample invoice settles that student's term, so on a shared deployment the next visitor would get "already paid". Payments created from a bundled sample (the `/demo` buttons, or an upload byte-identical to a sample) are marked `isDemo`, and the duplicate check ignores demo payments.
- The seeded `LM-H7K2P` is not a demo payment, so the duplicate sample still blocks.

## 2026-11-01 — Full page navigation after PayPal approval
- After capture the review page uses `window.location.assign` to open the receipt. `router.push` called from inside the PayPal SDK's `onApprove` callback did not navigate.
