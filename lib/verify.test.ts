import { describe, expect, it } from "vitest";
import { INSTITUTIONS, PAYMENTS, TERMS, HOSPITAL_TERM, termFee } from "../prisma/seed-data";
import type { Extraction } from "./extraction";
import {
  type RegistryInstitution,
  type VerifyContext,
  applyAiConcerns,
  matchInstitution,
  nameSimilarity,
  verifyExtraction,
  worstVerdict,
} from "./verify";

// Build the verification context from the same data the database is seeded with.
const institutions: RegistryInstitution[] = INSTITUTIONS.map((inst) => ({
  id: inst.slug,
  name: inst.name,
  county: inst.county,
  officialPaybill: inst.officialPaybill,
  officialAccountNo: inst.officialAccountNo,
  feeSchedules: Object.entries(inst.term1Fees).flatMap(([level, fee]) =>
    inst.type === "HOSPITAL"
      ? [{ level, term: HOSPITAL_TERM, amountKes: fee }]
      : TERMS.map((term) => ({ level, term, amountKes: termFee(fee, term) })),
  ),
}));

const ctx: VerifyContext = {
  institutions,
  settledPayments: PAYMENTS.filter((p) => p.status === "SETTLED").map((p) => ({
    reference: p.reference,
    institutionId: p.institutionSlug,
    beneficiaryRef: p.beneficiaryRef,
    term: p.term,
    settledAt: p.settledAt ? new Date(p.settledAt) : null,
  })),
};

const mlimaItems = [
  { description: "Tuition", amountKes: 9_000 },
  { description: "Boarding & meals", amountKes: 7_800 },
  { description: "Development & PTA levy", amountKes: 2_000 },
  { description: "Activity fee", amountKes: 1_000 },
  { description: "Medical cover", amountKes: 500 },
];

// What a correct extraction of public/samples/genuine-invoice.png looks like.
const genuine: Extraction = {
  documentType: "SCHOOL_FEE_INVOICE",
  institutionName: "Mlima Girls National School",
  institutionLocation: "Eldoret, Uasin Gishu County",
  beneficiaryName: "Achieng Otieno",
  beneficiaryRef: "4521",
  level: "Form 3",
  term: "2026-T3",
  lineItems: mlimaItems,
  totalKes: 20_300,
  paymentDetails: { paybill: "582614", accountNo: "011422903381", bank: "Rift Cooperative Bank" },
  issueDate: "28 Aug 2026",
  dueDate: "30 Nov 2026",
  confidence: 0.96,
  legibilityIssues: [],
};

const doctored: Extraction = {
  ...genuine,
  beneficiaryName: "Wairimu Kamau",
  beneficiaryRef: "4533",
  lineItems: [
    ...mlimaItems,
    { description: "Laboratory equipment levy", amountKes: 14_900 },
    { description: "Educational tour (compulsory)", amountKes: 11_500 },
  ],
  totalKes: 46_700,
  paymentDetails: { paybill: "582641", accountNo: "017866029915", bank: "Equatorial Commercial Bank" },
};

const blurry: Extraction = {
  ...genuine,
  institutionName: "Nyanza Lakeside Boys High School",
  institutionLocation: "Kisumu",
  beneficiaryName: "Brian Otieno",
  beneficiaryRef: "6245",
  lineItems: [
    { description: "Tuition", amountKes: 7_800 },
    { description: "Boarding & meals", amountKes: 6_800 },
    { description: "Development & PTA levy", amountKes: 1_700 },
    { description: "Activity fee", amountKes: 900 },
    { description: "Medical cover", amountKes: 400 },
  ],
  totalKes: 17_600,
  paymentDetails: { paybill: "739120", accountNo: "020755130942", bank: "Rift Cooperative Bank" },
  confidence: 0.55,
  legibilityIssues: ["image is blurred", "total partially obscured by a stain"],
};

const duplicate: Extraction = {
  ...genuine,
  beneficiaryName: "Mercy Jepkoech",
  beneficiaryRef: "3187",
  level: "Form 2",
  lineItems: [
    { description: "Tuition", amountKes: 8_800 },
    { description: "Boarding & meals", amountKes: 7_600 },
    { description: "Development & PTA levy", amountKes: 1_900 },
    { description: "Activity fee", amountKes: 1_000 },
    { description: "Medical cover", amountKes: 500 },
  ],
  totalKes: 19_800,
};

const severityOf = (e: Extraction, code: string) =>
  verifyExtraction(e, ctx).findings.find((f) => f.code === code)?.severity;

describe("sample invoices", () => {
  it("approves the genuine invoice", () => {
    const result = verifyExtraction(genuine, ctx);
    expect(result.verdict).toBe("APPROVE");
    expect(result.institution?.id).toBe("mlima-girls-eldoret");
    expect(result.findings.every((f) => f.severity === "PASS")).toBe(true);
  });

  it("blocks the doctored invoice for the paybill and the inflated amount", () => {
    const result = verifyExtraction(doctored, ctx);
    expect(result.verdict).toBe("BLOCK");
    const messages = result.findings.filter((f) => f.severity === "BLOCK").map((f) => f.message);
    expect(messages).toContain(
      "Payment details don't match Mlima Girls National School's verified account: the invoice shows paybill 582641 and bank account 017866029915.",
    );
    expect(messages).toContain("Amount is 2.3× the usual Form 3 Term 3 2026 fee of KES 20,300.");
  });

  it("flags the blurry invoice", () => {
    const result = verifyExtraction(blurry, ctx);
    expect(result.verdict).toBe("FLAG");
    expect(severityOf(blurry, "LEGIBILITY")).toBe("FLAG");
    expect(result.findings.find((f) => f.code === "LEGIBILITY")?.message).toContain("total partially obscured");
  });

  it("blocks the duplicate invoice with the earlier reference", () => {
    const result = verifyExtraction(duplicate, ctx);
    expect(result.verdict).toBe("BLOCK");
    expect(result.findings.find((f) => f.code === "DUPLICATE")?.message).toBe(
      "This bill was already paid on 2 Sept 2026, ref LM-H7K2P.",
    );
  });
});

describe("institution matching", () => {
  it("ignores generic words and tolerates a typo", () => {
    expect(nameSimilarity("Mlima Girls High School", "Mlima Girls National School, Eldoret")).toBe(1);
    expect(matchInstitution({ institutionName: "Nyanza Lakside Boys", institutionLocation: null }, institutions)?.id).toBe(
      "lakeside-boys-kisumu",
    );
  });

  it("does not confuse a boys' school for a girls' school", () => {
    expect(matchInstitution({ institutionName: "Mlima Boys National School", institutionLocation: null }, institutions)).toBeNull();
  });

  it("blocks unknown institutions", () => {
    const result = verifyExtraction({ ...genuine, institutionName: "Sunrise Academy" }, ctx);
    expect(result.verdict).toBe("BLOCK");
    expect(severityOf({ ...genuine, institutionName: "Sunrise Academy" }, "INSTITUTION")).toBe("BLOCK");
  });

  it("matches hospital names without the town", () => {
    const bill: Extraction = {
      ...genuine,
      documentType: "HOSPITAL_BILL",
      institutionName: "Tumaini Referral Hospital",
      institutionLocation: "Nakuru",
      beneficiaryRef: "IP-30001",
      level: "Inpatient",
      term: null,
      lineItems: [],
      totalKes: 45_000,
      paymentDetails: { paybill: "318249", accountNo: null, bank: null },
    };
    expect(verifyExtraction(bill, ctx).verdict).toBe("APPROVE");
  });
});

describe("individual rules", () => {
  it("blocks documents that are not bills", () => {
    expect(verifyExtraction({ ...genuine, documentType: "OTHER" }, ctx).verdict).toBe("BLOCK");
  });

  it("flags between 1.5x and 2x the usual fee, blocks above 2x", () => {
    expect(severityOf({ ...genuine, lineItems: [], totalKes: 30_450 }, "AMOUNT")).toBe("PASS"); // exactly 1.5x
    expect(severityOf({ ...genuine, lineItems: [], totalKes: 30_451 }, "AMOUNT")).toBe("FLAG");
    expect(severityOf({ ...genuine, lineItems: [], totalKes: 40_600 }, "AMOUNT")).toBe("FLAG"); // exactly 2x
    expect(severityOf({ ...genuine, lineItems: [], totalKes: 40_601 }, "AMOUNT")).toBe("BLOCK");
  });

  it("flags when there is no fee schedule to compare against", () => {
    expect(severityOf({ ...genuine, term: "2027-T1" }, "AMOUNT")).toBe("FLAG");
  });

  it("flags line items that don't add up, with KES 1 tolerance", () => {
    expect(severityOf({ ...genuine, totalKes: 20_301 }, "LINE_ITEMS")).toBe("PASS");
    expect(severityOf({ ...genuine, totalKes: 20_302 }, "LINE_ITEMS")).toBe("FLAG");
  });

  it("accepts the admission number printed as the M-Pesa account", () => {
    const e = { ...genuine, paymentDetails: { paybill: "582614", accountNo: "4521", bank: null } };
    expect(severityOf(e, "PAYMENT_DETAILS")).toBe("PASS");
  });

  it("treats a near-miss on an unclear photo as a misread, not fraud", () => {
    const misread = { paybill: "739120", accountNo: "020735130942", bank: null };
    expect(severityOf({ ...blurry, paymentDetails: misread }, "PAYMENT_DETAILS")).toBe("FLAG");
    // The same near-miss on a clear photo is blocked.
    expect(severityOf({ ...blurry, paymentDetails: misread, confidence: 0.95, legibilityIssues: [] }, "PAYMENT_DETAILS")).toBe("BLOCK");
    // A completely different number is blocked even on an unclear photo.
    const swapped = { paybill: "111111", accountNo: null, bank: null };
    expect(severityOf({ ...blurry, paymentDetails: swapped }, "PAYMENT_DETAILS")).toBe("BLOCK");
  });

  it("keeps the legibility message short", () => {
    const e = { ...blurry, legibilityIssues: ["a", "b", "c", "d"] };
    expect(verifyExtraction(e, ctx).findings.find((f) => f.code === "LEGIBILITY")?.message).toContain("(a; b; and 2 more)");
  });

  it("flags when no payment details are printed", () => {
    const e = { ...genuine, paymentDetails: { paybill: null, accountNo: null, bank: null } };
    expect(severityOf(e, "PAYMENT_DETAILS")).toBe("FLAG");
  });

  it("flags low confidence even without listed issues", () => {
    expect(severityOf({ ...genuine, confidence: 0.69 }, "LEGIBILITY")).toBe("FLAG");
    expect(severityOf({ ...genuine, confidence: 0.7 }, "LEGIBILITY")).toBe("PASS");
  });

  it("only treats the same beneficiary and term as a duplicate", () => {
    expect(severityOf({ ...duplicate, term: "2026-T2" }, "DUPLICATE")).toBe("PASS");
    expect(severityOf({ ...duplicate, beneficiaryRef: "3188" }, "DUPLICATE")).toBe("PASS");
  });

  it("lets AI concerns raise but never lower the verdict", () => {
    expect(applyAiConcerns("APPROVE", ["Odd charge"])).toBe("FLAG");
    expect(applyAiConcerns("APPROVE", [])).toBe("APPROVE");
    expect(applyAiConcerns("BLOCK", [])).toBe("BLOCK");
    expect(applyAiConcerns("FLAG", ["Odd charge"])).toBe("FLAG");
  });

  it("picks the most severe result", () => {
    expect(worstVerdict(["PASS", "FLAG", "PASS"])).toBe("FLAG");
    expect(worstVerdict(["FLAG", "BLOCK"])).toBe("BLOCK");
    expect(worstVerdict([])).toBe("APPROVE");
  });
});
