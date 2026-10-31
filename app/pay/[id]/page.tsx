import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { VerdictCard } from "@/components/VerdictCard";
import { prisma } from "@/lib/db";
import { ExtractionSchema } from "@/lib/extraction";
import { formatKes, shortName, termLabel } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { readVerdictDetails } from "@/lib/verdict-details";
import { PayPanel } from "./PayPanel";

export const metadata: Metadata = { title: "Review your bill — Lipa Moja" };

const PAID_STATUSES = new Set(["PAID", "PAYOUT_PENDING", "SETTLED", "FAILED"]);

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await prisma.payment.findUnique({ where: { id }, include: { institution: true } });
  if (!payment) notFound();

  const details = readVerdictDetails(payment.verdictReasons, payment.verdict);
  const extraction = ExtractionSchema.safeParse(payment.extraction);
  const lineItems = extraction.success ? extraction.data.lineItems : [];
  const printedName = extraction.success ? extraction.data.institutionName : null;
  const q = quote(payment.amountKes, payment.fxRate.toString());
  const institutionName = payment.institution?.name ?? printedName ?? "Unknown institution";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6">
        <p className="text-sm text-muted">Reference {payment.reference}</p>
        <h1 className="font-display mt-1 text-3xl font-semibold sm:text-4xl">Review before you pay</h1>

        {PAID_STATUSES.has(payment.status) && (
          <p className="mt-4 rounded-2xl bg-approve/10 px-4 py-3 text-approve">
            This bill has already been paid.{" "}
            <Link href={`/r/${payment.reference}`} className="font-medium underline">
              View the receipt
            </Link>
          </p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-8">
            <VerdictCard verdict={payment.verdict} details={details} />

            <section className="rounded-3xl border border-ink/10 bg-white p-6" aria-labelledby="bill-title">
              <h2 id="bill-title" className="font-display text-xl font-semibold">
                What we read on the invoice
              </h2>
              <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Paying">
                  {institutionName}
                  {payment.institution?.verified && (
                    <span className="ml-2 rounded-full bg-approve/10 px-2 py-0.5 text-xs font-medium text-approve">
                      Verified
                    </span>
                  )}
                </Detail>
                <Detail label={payment.institution?.type === "HOSPITAL" ? "Patient" : "Student"}>
                  {payment.beneficiaryName}
                </Detail>
                {payment.beneficiaryRef && (
                  <Detail label={payment.institution?.type === "HOSPITAL" ? "Patient no." : "Admission no."}>
                    {payment.beneficiaryRef}
                  </Detail>
                )}
                {(payment.level || payment.term) && (
                  <Detail label="For">{[payment.level, termLabel(payment.term)].filter(Boolean).join(", ")}</Detail>
                )}
              </dl>

              {lineItems.length > 0 && (
                <table className="mt-6 w-full text-sm">
                  <caption className="sr-only">Invoice line items</caption>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-ink/10">
                        <td className="py-2">{li.description}</td>
                        <td className="py-2 text-right tabular-nums">{formatKes(li.amountKes)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2">Total</td>
                      <td className="py-2 text-right tabular-nums">{formatKes(payment.amountKes)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-ink/10 bg-white p-6" aria-labelledby="pay-title">
              <h2 id="pay-title" className="font-display text-xl font-semibold">
                You pay
              </h2>
              <p className="font-display mt-2 text-4xl font-semibold">${q.totalUsd}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <Row label={`Bill (${formatKes(payment.amountKes)})`} value={`$${q.feeUsd}`} />
                <Row label="Service fee (2.5% + $0.50)" value={`$${q.serviceFeeUsd}`} />
                <Row label="Total" value={`$${q.totalUsd}`} strong />
              </dl>
              <p className="mt-3 text-xs text-muted">
                Indicative rate: KES {q.fxRate} per US$1. The full bill amount goes directly to{" "}
                {payment.institution ? shortName(payment.institution.name) : "the institution"}.
              </p>
              <div className="mt-6">
                {PAID_STATUSES.has(payment.status) ? null : (
                  <PayPanel paymentId={payment.id} verdict={payment.verdict} totalUsd={q.totalUsd} />
                )}
              </div>
            </section>

            {payment.invoiceImagePath !== "seed" && (
              <figure className="overflow-hidden rounded-3xl border border-ink/10 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, dynamic upload */}
                <img src={`/api/invoices/${payment.id}`} alt="The uploaded invoice" className="w-full" />
                <figcaption className="px-4 py-2 text-xs text-muted">Your uploaded invoice</figcaption>
              </figure>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-ink/10 pt-2 font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
