import { describe, expect, it } from "vitest";
import { type Extraction, normaliseExtraction, normaliseTerm } from "./extraction";

describe("normaliseTerm", () => {
  it.each([
    ["2026-T3", "2026-T3"],
    ["Term 3, 2026", "2026-T3"],
    ["term 1 2027", "2027-T1"],
    ["T2 2026", "2026-T2"],
  ])("%s -> %s", (raw, expected) => {
    expect(normaliseTerm(raw)).toBe(expected);
  });

  it("returns null when the year or term is missing", () => {
    expect(normaliseTerm(null)).toBeNull();
    expect(normaliseTerm("Term 3")).toBeNull();
    expect(normaliseTerm("2026")).toBeNull();
  });
});

describe("normaliseExtraction", () => {
  const base: Extraction = {
    documentType: "SCHOOL_FEE_INVOICE",
    institutionName: "Mlima Girls National School",
    institutionLocation: "Eldoret",
    beneficiaryName: "Achieng Otieno",
    beneficiaryRef: "4521",
    level: "Form 3",
    term: "Term 3, 2026",
    lineItems: [{ description: "Tuition", amountKes: 9000.4 }],
    totalKes: 20300.2,
    paymentDetails: { paybill: "582 614", accountNo: "0114-2290-3381", bank: "  Rift Cooperative Bank " },
    issueDate: null,
    dueDate: null,
    confidence: 1.3,
    legibilityIssues: [],
  };

  it("rounds amounts, strips payment number formatting and clamps confidence", () => {
    const n = normaliseExtraction(base);
    expect(n.term).toBe("2026-T3");
    expect(n.totalKes).toBe(20300);
    expect(n.lineItems[0].amountKes).toBe(9000);
    expect(n.paymentDetails).toEqual({ paybill: "582614", accountNo: "011422903381", bank: "Rift Cooperative Bank" });
    expect(n.confidence).toBe(1);
  });
});
