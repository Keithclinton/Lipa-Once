import { z } from "zod/v4";

// What the vision model returns for an uploaded bill. Kept free of numeric
// range constraints so it converts cleanly to a structured-output schema;
// normaliseExtraction() enforces the ranges afterwards.
export const ExtractionSchema = z.object({
  documentType: z.enum(["SCHOOL_FEE_INVOICE", "HOSPITAL_BILL", "OTHER"]),
  institutionName: z.string(),
  institutionLocation: z.string().nullable(),
  beneficiaryName: z.string(),
  beneficiaryRef: z.string().nullable().describe("Admission number or patient number"),
  level: z.string().nullable().describe('Class or service, e.g. "Form 3" or "Inpatient"'),
  term: z.string().nullable().describe('School term normalised to "YYYY-T1", "YYYY-T2" or "YYYY-T3"'),
  lineItems: z.array(z.object({ description: z.string(), amountKes: z.number() })),
  totalKes: z.number(),
  paymentDetails: z.object({
    paybill: z.string().nullable(),
    accountNo: z.string().nullable(),
    bank: z.string().nullable(),
  }),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  confidence: z.number().describe("Overall confidence in the extraction, 0 to 1"),
  legibilityIssues: z.array(z.string()),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const TERM_PATTERN = /^(\d{4})-T([123])$/;

// Accepts "2026-T3", "Term 3, 2026", "T3 2026", "Term 3 2026" and similar.
export function normaliseTerm(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (TERM_PATTERN.test(value)) return value;
  const year = /\b(20\d{2})\b/.exec(value)?.[1];
  const term = /\b(?:term|t)\s*([123])\b/i.exec(value)?.[1];
  return year && term ? `${year}-T${term}` : null;
}

// Whole shillings, digits-only payment numbers, clamped confidence.
export function normaliseExtraction(e: Extraction): Extraction {
  const digits = (s: string | null) => (s ? s.replace(/\D/g, "") || null : null);
  return {
    ...e,
    term: normaliseTerm(e.term),
    lineItems: e.lineItems.map((li) => ({ ...li, amountKes: Math.round(li.amountKes) })),
    totalKes: Math.round(e.totalKes),
    paymentDetails: {
      paybill: digits(e.paymentDetails.paybill),
      accountNo: digits(e.paymentDetails.accountNo),
      bank: e.paymentDetails.bank?.trim() || null,
    },
    confidence: Math.min(1, Math.max(0, e.confidence)),
  };
}
