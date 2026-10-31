import { describe, expect, it } from "vitest";
import { templateReceipt } from "./receipt";

describe("templateReceipt", () => {
  it("writes both languages with the key facts", () => {
    const r = templateReceipt({
      senderName: "Wanjiru",
      familyName: null,
      beneficiaryName: "Achieng Otieno",
      beneficiaryRef: "4521",
      level: "Form 3",
      term: "2026-T3",
      amountKes: 20_300,
      institutionName: "Mlima Girls National School, Eldoret",
      institutionType: "SCHOOL",
      reference: "LM-7K3Q9",
    });
    expect(r.en).toBe(
      "Wanjiru has paid KES 20,300 school fees for Achieng Otieno (4521), Form 3, Term 3 2026, directly to Mlima Girls National School. Ref LM-7K3Q9.",
    );
    expect(r.sw).toContain("amelipa karo ya KES 20,300");
    expect(r.sw).toContain("Kidato 3, muhula wa 3 2026");
    expect(r.sw).toContain("LM-7K3Q9");
  });

  it("handles hospital bills without a term or sender", () => {
    const r = templateReceipt({
      senderName: null,
      familyName: null,
      beneficiaryName: "John Kamau",
      beneficiaryRef: null,
      level: "Inpatient",
      term: "ANY",
      amountKes: 45_000,
      institutionName: "Tumaini County Referral Hospital, Nakuru",
      institutionType: "HOSPITAL",
      reference: "LM-Z4F8Q",
    });
    expect(r.en).toBe(
      "Your relative has paid KES 45,000 hospital bill for John Kamau, Inpatient, directly to Tumaini County Referral Hospital. Ref LM-Z4F8Q.",
    );
    expect(r.sw).toContain("bili ya hospitali");
  });
});
