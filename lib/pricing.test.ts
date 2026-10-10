import { describe, expect, it } from "vitest";
import { centsToUsd, kesToUsdCents, parseFxRate, quote, serviceFeeCents } from "./pricing";

describe("parseFxRate", () => {
  it("parses whole and decimal rates into hundredths", () => {
    expect(parseFxRate("129")).toBe(12900n);
    expect(parseFxRate("129.5")).toBe(12950n);
    expect(parseFxRate("129.35")).toBe(12935n);
  });

  it("defaults to 129 when unset", () => {
    expect(parseFxRate(undefined)).toBe(12900n);
  });

  it("rejects malformed or zero rates", () => {
    expect(() => parseFxRate("abc")).toThrow();
    expect(() => parseFxRate("129.123")).toThrow();
    expect(() => parseFxRate("0")).toThrow();
  });
});

describe("kesToUsdCents", () => {
  it("converts and rounds half up to the cent", () => {
    // 45,000 / 129 = 348.837... -> 348.84
    expect(kesToUsdCents(45_000, 12900n)).toBe(34884n);
    // 129 KES is exactly $1
    expect(kesToUsdCents(129, 12900n)).toBe(100n);
  });

  it("rejects fractional or negative KES", () => {
    expect(() => kesToUsdCents(10.5, 12900n)).toThrow();
    expect(() => kesToUsdCents(-1, 12900n)).toThrow();
  });
});

describe("serviceFeeCents", () => {
  it("charges 2.5% plus 50 cents", () => {
    expect(serviceFeeCents(10_000n)).toBe(300n); // $100 -> $2.50 + $0.50
    expect(serviceFeeCents(34_884n)).toBe(922n); // 872.1 -> 872 + 50
  });
});

describe("quote", () => {
  it("builds the full sender breakdown", () => {
    expect(quote(45_000, "129")).toEqual({
      amountKes: 45_000,
      fxRate: "129.00",
      feeUsd: "348.84",
      serviceFeeUsd: "9.22",
      totalUsd: "358.06",
    });
  });

  it("formats cents with two decimals", () => {
    expect(centsToUsd(5n)).toBe("0.05");
    expect(centsToUsd(100n)).toBe("1.00");
  });
});
