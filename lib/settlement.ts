// Checkout -> capture -> payout -> settled. Every transition is a guarded
// status update so concurrent callers (the browser, webhooks, polling)
// can't pay an institution twice.
import { generateReceipt } from "./ai/receipt";
import { prisma } from "./db";
import { formatKes, shortName, termLabel } from "./format";
import { PayPalError } from "./paypal/client";
import { PAID_INVOICE_STATUSES, getInvoice } from "./paypal/invoices";
import { captureOrder, createOrder } from "./paypal/orders";
import { FAILED_ITEM_STATUSES, createPayout, getPayoutStatus } from "./paypal/payouts";
import { quote } from "./pricing";

export class CheckoutError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "CheckoutError";
  }
}

const appUrl = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

export async function startCheckout(paymentId: string, acknowledgedWarnings: boolean): Promise<string> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { institution: true } });
  if (!payment) throw new CheckoutError("We couldn't find this bill.");
  if (payment.status !== "VERIFIED") throw new CheckoutError("This bill can't be paid again.");
  if (payment.verdict === "BLOCK" || !payment.institution) throw new CheckoutError("We can't pay this bill.");
  if (payment.verdict === "FLAG" && !acknowledgedWarnings) {
    throw new CheckoutError("Please confirm you've reviewed the warnings first.");
  }

  const q = quote(payment.amountKes, payment.fxRate.toString());
  const what = [payment.level, termLabel(payment.term)].filter(Boolean).join(" ");
  const orderId = await createOrder({
    reference: payment.reference,
    description: `${shortName(payment.institution.name)}: ${payment.beneficiaryName}${what ? `, ${what}` : ""}`,
    quote: q,
    returnUrl: `${appUrl()}/pay/${payment.id}`,
    cancelUrl: `${appUrl()}/pay/${payment.id}`,
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { paypalOrderId: orderId } });
  return orderId;
}

export async function completeCheckout(orderId: string) {
  const payment = await prisma.payment.findFirst({ where: { paypalOrderId: orderId } });
  if (!payment) throw new CheckoutError("We couldn't match this PayPal payment to a bill.");
  if (payment.status !== "VERIFIED") return payment; // already captured

  const capture = await captureOrder(orderId);
  if (capture.captureStatus !== "COMPLETED" && capture.captureStatus !== "PENDING") {
    throw new CheckoutError("PayPal didn't complete the payment. You haven't been charged.");
  }
  await prisma.payment.updateMany({
    where: { id: payment.id, status: "VERIFIED" },
    data: { status: "PAID", paypalCaptureId: capture.captureId },
  });
  // A PENDING capture is paid out when PAYMENT.CAPTURE.COMPLETED arrives.
  if (capture.captureStatus === "COMPLETED") await sendPayout(payment.id);
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

// Pays the bill (not the service fee) to the institution's verified PayPal account.
export async function sendPayout(paymentId: string): Promise<void> {
  // Claim the payout: only one caller can move PAID -> PAYOUT_PENDING.
  const claimed = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PAID", payoutBatchId: null },
    data: { status: "PAYOUT_PENDING" },
  });
  if (claimed.count === 0) return;

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { institution: true } });
  if (!payment.institution) throw new Error(`Payment ${payment.reference} has no institution`);

  const q = quote(payment.amountKes, payment.fxRate.toString());
  const forWhat = [payment.beneficiaryRef && `Adm/Ref ${payment.beneficiaryRef}`, payment.level, termLabel(payment.term)]
    .filter(Boolean)
    .join(", ");
  try {
    const { batchId } = await createPayout({
      reference: payment.reference,
      receiver: payment.institution.paypalEmail,
      amountUsd: q.feeUsd,
      note: `${formatKes(payment.amountKes)} for ${payment.beneficiaryName}${forWhat ? ` (${forWhat})` : ""}. Lipa Once ref ${payment.reference}.`,
    });
    await prisma.payment.update({ where: { id: paymentId }, data: { payoutBatchId: batchId } });
  } catch (err) {
    // The batch id is the reference, so a retry can never create a second payout.
    // Hand the claim back so polling or the next webhook can retry.
    console.error(`[settlement] payout for ${payment.reference} failed`, err instanceof PayPalError ? err.issue : err);
    await prisma.payment.updateMany({
      where: { id: paymentId, status: "PAYOUT_PENDING", payoutBatchId: null },
      data: { status: "PAID" },
    });
  }
}

// A PayPal invoice was paid: same as a capture, then pay the institution.
export async function recordInvoicePaid(reference: string, paypalPaymentId: string | null): Promise<void> {
  const paid = await prisma.payment.updateMany({
    where: { reference, status: "VERIFIED", paypalInvoiceId: { not: null } },
    data: { status: "PAID", paypalCaptureId: paypalPaymentId },
  });
  if (paid.count) {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { reference } });
    await sendPayout(payment.id);
  }
}

// Applies a payout item's status from a webhook or from polling.
export async function recordPayoutResult(reference: string, itemStatus: string | null, itemId: string | null) {
  if (itemStatus === "SUCCESS") {
    const settled = await prisma.payment.updateMany({
      where: { reference, status: "PAYOUT_PENDING" },
      data: { status: "SETTLED", settledAt: new Date(), payoutItemId: itemId },
    });
    if (settled.count) await writeReceipt(reference);
  } else if (itemStatus && FAILED_ITEM_STATUSES.has(itemStatus)) {
    await prisma.payment.updateMany({
      where: { reference, status: "PAYOUT_PENDING" },
      data: { status: "FAILED", payoutItemId: itemId },
    });
  } else if (itemId) {
    await prisma.payment.updateMany({ where: { reference, payoutItemId: null }, data: { payoutItemId: itemId } });
  }
}

async function writeReceipt(reference: string) {
  const p = await prisma.payment.findUniqueOrThrow({ where: { reference }, include: { institution: true } });
  if (p.receiptEn || !p.institution) return;
  const receipt = await generateReceipt({
    senderName: p.senderName,
    familyName: p.familyName,
    beneficiaryName: p.beneficiaryName,
    beneficiaryRef: p.beneficiaryRef,
    level: p.level,
    term: p.term,
    amountKes: p.amountKes,
    institutionName: p.institution.name,
    institutionType: p.institution.type,
    reference: p.reference,
  });
  await prisma.payment.update({ where: { reference }, data: { receiptEn: receipt.en, receiptSw: receipt.sw } });
}

// Fallback for when webhooks can't reach us (e.g. local dev): nudge a stuck
// payment forward by asking PayPal directly. Safe to call repeatedly.
export async function refreshSettlement(reference: string): Promise<void> {
  const p = await prisma.payment.findUnique({ where: { reference } });
  if (!p) return;
  try {
    if (p.status === "VERIFIED" && p.paypalInvoiceId) {
      const invoice = await getInvoice(p.paypalInvoiceId);
      if (PAID_INVOICE_STATUSES.has(invoice.status)) await recordInvoicePaid(reference, invoice.paymentId);
    } else if (p.status === "PAID") {
      await sendPayout(p.id);
    } else if (p.status === "PAYOUT_PENDING" && p.payoutBatchId) {
      const item = await getPayoutStatus(p.payoutBatchId);
      await recordPayoutResult(reference, item.status, item.itemId);
    } else if (p.status === "SETTLED" && !p.receiptEn) {
      await writeReceipt(reference);
    }
  } catch (err) {
    console.error(`[settlement] refresh for ${reference} failed`, err instanceof PayPalError ? err.issue : err);
  }
}
