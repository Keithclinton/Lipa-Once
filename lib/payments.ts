import type { Prisma } from "@prisma/client";
import { type InvoiceFile, extractInvoice } from "./ai/extract";
import { reviewInvoice } from "./ai/explain";
import { prisma } from "./db";
import { quote } from "./pricing";
import { newReference } from "./reference";
import { saveUpload } from "./uploads";
import type { VerdictDetails } from "./verdict-details";
import { type VerifyContext, applyAiConcerns, verifyExtraction } from "./verify";

export type SenderDetails = {
  senderName?: string;
  senderEmail?: string;
  familyName?: string;
  familyPhone?: string;
};

export async function loadVerifyContext(): Promise<VerifyContext> {
  const [institutions, settledPayments] = await Promise.all([
    prisma.institution.findMany({
      where: { verified: true },
      include: { feeSchedules: { select: { level: true, term: true, amountKes: true } } },
    }),
    prisma.payment.findMany({
      where: { status: "SETTLED", isDemo: false },
      select: { reference: true, institutionId: true, beneficiaryRef: true, term: true, settledAt: true },
    }),
  ]);
  return { institutions, settledPayments };
}

async function uniqueReference(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const reference = newReference();
    if (!(await prisma.payment.findUnique({ where: { reference } }))) return reference;
  }
  throw new Error("Could not allocate a payment reference");
}

// Upload -> extract -> rule checks -> AI review -> priced Payment record.
// Throws AiError (with a user-facing message) if the invoice can't be read.
export async function createPaymentFromInvoice(file: InvoiceFile, sender: SenderDetails, isDemo = false) {
  const [invoiceImagePath, extraction] = await Promise.all([saveUpload(file), extractInvoice(file)]);

  const result = verifyExtraction(extraction, await loadVerifyContext());
  const review = await reviewInvoice(extraction, result.findings, result.verdict);
  const concerns = review?.concerns ?? [];
  const verdict = applyAiConcerns(result.verdict, concerns);
  const details: VerdictDetails = { summary: review?.summary ?? null, findings: result.findings, concerns };

  const q = quote(extraction.totalKes);
  return prisma.payment.create({
    data: {
      reference: await uniqueReference(),
      institutionId: result.institution?.id ?? null,
      beneficiaryName: extraction.beneficiaryName || "Unknown",
      beneficiaryRef: extraction.beneficiaryRef,
      level: extraction.level,
      term: extraction.term,
      amountKes: extraction.totalKes,
      amountUsd: q.totalUsd,
      fxRate: q.fxRate,
      verdict,
      verdictReasons: details as unknown as Prisma.InputJsonValue,
      extraction: extraction as unknown as Prisma.InputJsonValue,
      invoiceImagePath,
      ...sender,
      isDemo,
      status: verdict === "BLOCK" ? "BLOCKED" : "VERIFIED",
    },
  });
}
