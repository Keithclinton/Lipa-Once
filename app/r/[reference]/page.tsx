import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { SiteHeader } from "@/components/SiteHeader";
import { prisma } from "@/lib/db";
import { formatDate, formatKes, termLabel } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { CopyButton, StatusPoller } from "./ReceiptLive";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }): Promise<Metadata> {
  const { reference } = await params;
  return { title: `Receipt ${reference} — Lipa Once` };
}

const STEPS = [
  { key: "PAID", label: "Paid", detail: "Payment received from the sender" },
  { key: "PAYOUT_PENDING", label: "Sent to institution", detail: "On its way to the institution's verified PayPal account" },
  { key: "SETTLED", label: "Settled", detail: "Received by the institution" },
] as const;

const PROGRESS: Record<string, number> = { PAID: 0, PAYOUT_PENDING: 1, SETTLED: 2, FAILED: 1 };

// "+254 712 345 678" or "0712345678" -> "254712345678" for wa.me links.
function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && /^[17]/.test(digits)) return `254${digits}`;
  return digits.length >= 10 ? digits : null;
}

export default async function ReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const payment = await prisma.payment.findUnique({ where: { reference }, include: { institution: true } });
  if (!payment) notFound();

  if (!(payment.status in PROGRESS)) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 pb-20 pt-6">
          <h1 className="font-display text-3xl font-semibold">This bill hasn&rsquo;t been paid</h1>
          <p className="mt-3 text-muted">There&rsquo;s no receipt for {reference} yet.</p>
          <Link href={`/pay/${payment.id}`} className="mt-6 inline-block text-forest underline">
            Go to the bill
          </Link>
        </main>
      </div>
    );
  }

  const step = PROGRESS[payment.status];
  const failed = payment.status === "FAILED";
  const settled = payment.status === "SETTLED";
  const q = quote(payment.amountKes, payment.fxRate.toString());
  const url = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/r/${reference}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#14532d", light: "#ffffff" } });
  const wa = whatsappNumber(payment.familyPhone);
  const shareText = [payment.receiptSw, payment.receiptEn, url].filter(Boolean).join("\n\n");
  const isHospital = payment.institution?.type === "HOSPITAL";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <StatusPoller reference={reference} status={payment.status} hasReceipt={Boolean(payment.receiptEn)} />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
        <p className="text-sm text-muted">Receipt {reference}</p>
        <h1 className="font-display mt-1 text-3xl font-semibold sm:text-4xl">
          {settled ? "Paid in full" : failed ? "Payout needs attention" : "Payment on its way"}
        </h1>
        <p className="mt-3 text-lg">
          {formatKes(payment.amountKes)} for {payment.beneficiaryName}
          {payment.institution && <> to {payment.institution.name}</>}.
        </p>

        <ol className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Payment progress">
          {STEPS.map((s, i) => {
            const done = i < step || (i === step && settled);
            const current = i === step && !settled;
            const isFailed = failed && i === step;
            return (
              <li
                key={s.key}
                aria-current={current ? "step" : undefined}
                className={`rounded-2xl border p-4 ${
                  isFailed
                    ? "border-block/40 bg-block/5"
                    : done
                      ? "border-approve/30 bg-approve/5"
                      : current
                        ? "border-flag/40 bg-ochre-soft/50"
                        : "border-ink/10 bg-white text-muted"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <span aria-hidden>{isFailed ? "✕" : done ? "✓" : current ? "…" : "○"}</span>
                  {s.label}
                </div>
                <p className="mt-1 text-sm">{isFailed ? "PayPal couldn't deliver this payout. We'll retry or refund it." : s.detail}</p>
              </li>
            );
          })}
        </ol>

        <section className="mt-8 rounded-3xl border border-ink/10 bg-white p-6" aria-labelledby="msg-title">
          <h2 id="msg-title" className="font-display text-xl font-semibold">
            Message for the family
          </h2>
          {payment.receiptEn && payment.receiptSw ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <figure className="rounded-2xl bg-[#e7f6e7] p-4">
                <figcaption className="text-xs font-semibold uppercase tracking-wide text-muted">Kiswahili</figcaption>
                <p className="mt-2" lang="sw">
                  {payment.receiptSw}
                </p>
              </figure>
              <figure className="rounded-2xl bg-[#e7f6e7] p-4">
                <figcaption className="text-xs font-semibold uppercase tracking-wide text-muted">English</figcaption>
                <p className="mt-2">{payment.receiptEn}</p>
              </figure>
            </div>
          ) : (
            <p className="mt-3 text-muted">The message will appear here once the institution has received the payment.</p>
          )}
          {payment.receiptEn && (
            <div className="mt-4 flex flex-wrap gap-3">
              <CopyButton text={shareText} label="Copy for WhatsApp" />
              <a
                href={`https://wa.me/${wa ?? ""}?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest-dark"
              >
                {wa && payment.familyName ? `Send to ${payment.familyName}` : "Share on WhatsApp"}
              </a>
            </div>
          )}
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-[1fr_auto]">
          <dl className="grid gap-x-6 gap-y-3 rounded-3xl border border-ink/10 bg-white p-6 text-sm sm:grid-cols-2">
            <Item label={isHospital ? "Patient" : "Student"}>
              {payment.beneficiaryName}
              {payment.beneficiaryRef && ` (${payment.beneficiaryRef})`}
            </Item>
            <Item label="For">{[payment.level, termLabel(payment.term)].filter(Boolean).join(", ") || "—"}</Item>
            <Item label="Amount">
              {formatKes(payment.amountKes)} (US${q.feeUsd})
            </Item>
            <Item label="Paid by">{payment.senderName ?? "A relative abroad"}</Item>
            <Item label="Date">{formatDate(payment.settledAt ?? payment.updatedAt)}</Item>
            {(payment.payoutItemId ?? payment.paypalCaptureId) && (
              <Item label="PayPal reference">{payment.payoutItemId ?? payment.paypalCaptureId}</Item>
            )}
          </dl>
          <figure className="mx-auto w-40 text-center">
            <div className="rounded-2xl border border-ink/10 bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <figcaption className="mt-2 text-xs text-muted">Scan to check this receipt</figcaption>
          </figure>
        </section>
      </main>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
