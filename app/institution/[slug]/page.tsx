import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { currentTerm } from "@/lib/ai/assistant";
import { cookieName, isValidSession } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/db";
import { formatKes, termLabel } from "@/lib/format";
import { reasonList, readVerdictDetails } from "@/lib/verdict-details";
import { AssistantPanel } from "./AssistantPanel";
import { PasscodeForm } from "./PasscodeForm";
import { type PaymentRow, PaymentsGrid } from "./PaymentsGrid";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const inst = await prisma.institution.findUnique({ where: { slug }, select: { name: true } });
  return { title: `${inst?.name ?? "Dashboard"} — Lipa Once` };
}

export default async function InstitutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const inst = await prisma.institution.findUnique({ where: { slug } });
  if (!inst) notFound();

  if (!isValidSession(slug, (await cookies()).get(cookieName(slug))?.value)) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <PasscodeForm slug={slug} name={inst.name} />
      </div>
    );
  }

  const payments = await prisma.payment.findMany({
    where: { institutionId: inst.id },
    orderBy: { createdAt: "desc" },
  });

  const rows: PaymentRow[] = payments.map((p) => ({
    reference: p.reference,
    createdAt: p.createdAt.toISOString(),
    beneficiaryName: p.beneficiaryName,
    beneficiaryRef: p.beneficiaryRef,
    level: p.level,
    term: p.term,
    amountKes: p.amountKes,
    status: p.status,
    verdict: p.verdict,
    reasons: reasonList(readVerdictDetails(p.verdictReasons, p.verdict)),
    senderName: p.senderName,
  }));

  const term = termLabel(currentTerm()).replace(/ \d{4}$/, "");
  const suggestions =
    inst.type === "HOSPITAL"
      ? ["Show this week's payments", "Are any payouts stuck or failed?"]
      : [
          `Which Form 3 students haven't paid for ${term}?`,
          "Show today's payments and any failed payouts",
          `Invoice Brenda Jeruto's ${term} fees to her guardian at samuel.rotich@example.com`,
        ];

  const settled = payments.filter((p) => p.status === "SETTLED");
  const stats = [
    { label: "Received", value: formatKes(settled.reduce((s, p) => s + p.amountKes, 0)), note: `${settled.length} payments settled` },
    {
      label: "On the way",
      value: String(payments.filter((p) => p.status === "PAID" || p.status === "PAYOUT_PENDING").length),
      note: "payouts in progress",
    },
    {
      label: "Stopped",
      value: String(payments.filter((p) => p.verdict === "BLOCK").length),
      note: "suspicious invoices blocked",
      tone: "text-block",
    },
    {
      label: "Need attention",
      value: String(payments.filter((p) => p.status === "FAILED" || (p.verdict === "FLAG" && p.status !== "SETTLED")).length),
      note: "failed payouts or open warnings",
      tone: "text-flag",
    },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-6">
        <p className="text-sm text-muted">Bursar dashboard</p>
        <h1 className="font-display mt-1 text-3xl font-semibold">{inst.name}</h1>
        <p className="mt-2 text-sm text-muted">
          Payouts go to <span className="font-mono">{inst.paypalEmail}</span>
          {inst.officialPaybill && <> · Verified paybill {inst.officialPaybill}</>}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-ink/10 bg-white p-4">
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className={`font-display mt-1 text-2xl font-semibold ${s.tone ?? ""}`}>{s.value}</dd>
              <dd className="text-xs text-muted">{s.note}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-labelledby="payments-title" className="min-w-0">
            <h2 id="payments-title" className="font-display mb-3 text-xl font-semibold">
              Payments
            </h2>
            <PaymentsGrid rows={rows} />
          </section>
          <AssistantPanel slug={slug} suggestions={suggestions} />
        </div>
      </main>
    </div>
  );
}
