// Bills the bursar sends as PayPal invoices. Each invoice is backed by a
// Payment priced from the school's own fee schedule, so a paid invoice flows
// through the same payout and receipt pipeline as an uploaded one.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatKes, shortName, termLabel } from "./format";
import { createAndSendInvoice } from "./paypal/invoices";
import { quote } from "./pricing";
import { newReference } from "./reference";
import type { VerdictDetails } from "./verdict-details";

export type InvoiceRequest = {
  institutionId: string;
  admNo: string;
  term: string; // "2026-T3"
  recipientEmail: string;
  recipientName: string | null;
};

export type InvoiceResult =
  | { ok: true; reference: string; amountKes: number; totalUsd: string; payUrl: string | null; reviewUrl: string }
  | { ok: false; error: string };

export async function sendFeeInvoice(req: InvoiceRequest): Promise<InvoiceResult> {
  const inst = await prisma.institution.findUnique({ where: { id: req.institutionId } });
  if (!inst) return { ok: false, error: "Unknown institution." };
  const student = await prisma.student.findUnique({
    where: { institutionId_admNo: { institutionId: inst.id, admNo: req.admNo } },
  });
  if (!student) return { ok: false, error: `No student with admission number ${req.admNo} at ${shortName(inst.name)}.` };

  const schedule = await prisma.feeSchedule.findUnique({
    where: { institutionId_level_term: { institutionId: inst.id, level: student.level, term: req.term } },
  });
  if (!schedule) return { ok: false, error: `No ${student.level} fee is set for ${termLabel(req.term)}.` };

  const settled = await prisma.payment.findFirst({
    where: { institutionId: inst.id, beneficiaryRef: student.admNo, term: req.term, status: "SETTLED" },
  });
  if (settled) return { ok: false, error: `${student.name}'s ${termLabel(req.term)} fees were already paid (ref ${settled.reference}).` };

  const q = quote(schedule.amountKes);
  const what = `${student.level}, ${termLabel(req.term)}`;
  const details: VerdictDetails = {
    summary: `Issued by ${shortName(inst.name)} from its own fee schedule.`,
    findings: [
      { code: "INSTITUTION", severity: "PASS", message: `${inst.name} is a verified institution.` },
      { code: "AMOUNT", severity: "PASS", message: `Amount matches the ${what} fee.` },
    ],
    concerns: [],
  };

  const payment = await prisma.payment.create({
    data: {
      reference: newReference(),
      institutionId: inst.id,
      beneficiaryName: student.name,
      beneficiaryRef: student.admNo,
      level: student.level,
      term: req.term,
      amountKes: schedule.amountKes,
      amountUsd: q.totalUsd,
      fxRate: q.fxRate,
      verdict: "APPROVE",
      verdictReasons: details as unknown as Prisma.InputJsonValue,
      extraction: { source: "paypal-invoice" },
      invoiceImagePath: "invoice",
      familyName: req.recipientName,
      senderEmail: req.recipientEmail,
      status: "VERIFIED",
    },
  });

  try {
    const invoice = await createAndSendInvoice({
      reference: payment.reference,
      businessName: `${shortName(inst.name)} via Lipa Moja`,
      recipientEmail: req.recipientEmail,
      recipientName: req.recipientName,
      itemName: `${student.name} (Adm ${student.admNo}) school fees, ${what}`,
      itemDescription: `${formatKes(schedule.amountKes)} at an indicative KES ${q.fxRate} per US$1. Paid directly to ${inst.name}.`,
      billUsd: q.feeUsd,
      serviceFeeUsd: q.serviceFeeUsd,
      note: `Lipa Moja ref ${payment.reference}. The full fee goes directly to ${inst.name}'s verified account.`,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { paypalInvoiceId: invoice.id } });
    return {
      ok: true,
      reference: payment.reference,
      amountKes: schedule.amountKes,
      totalUsd: q.totalUsd,
      payUrl: invoice.payUrl,
      reviewUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/pay/${payment.id}`,
    };
  } catch (err) {
    console.error("[invoicing] PayPal invoice failed", err);
    await prisma.payment.delete({ where: { id: payment.id } });
    return { ok: false, error: "PayPal couldn't create the invoice right now." };
  }
}
