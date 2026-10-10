// All money math is done in integers: KES as whole shillings, USD as cents.
// The FX rate is parsed into hundredths so a rate like "129.35" stays exact.

export const SERVICE_FEE_BASIS_POINTS = 250n; // 2.5%
export const SERVICE_FEE_FIXED_CENTS = 50n; // $0.50

export type Quote = {
  amountKes: number;
  fxRate: string; // KES per USD, as shown to the sender
  feeUsd: string; // the bill, paid out to the institution
  serviceFeeUsd: string;
  totalUsd: string; // what the sender pays
};

export function parseFxRate(raw: string | undefined): bigint {
  const value = (raw ?? "129").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid FX rate: "${value}"`);
  const hundredths = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (hundredths === 0n) throw new Error("FX rate must be greater than zero");
  return hundredths;
}

// Integer division rounding half up (inputs are non-negative).
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function centsToUsd(cents: bigint): string {
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

export function formatFxRate(hundredths: bigint): string {
  return centsToUsd(hundredths);
}

export function kesToUsdCents(amountKes: number, fxHundredths: bigint): bigint {
  if (!Number.isInteger(amountKes) || amountKes < 0) {
    throw new Error("KES amount must be a non-negative integer");
  }
  // cents = kes * 100 / (fxHundredths / 100)
  return divRound(BigInt(amountKes) * 10_000n, fxHundredths);
}

export function serviceFeeCents(feeCents: bigint): bigint {
  return divRound(feeCents * SERVICE_FEE_BASIS_POINTS, 10_000n) + SERVICE_FEE_FIXED_CENTS;
}

export function quote(amountKes: number, fxRaw: string | undefined = process.env.FX_KES_PER_USD): Quote {
  const fx = parseFxRate(fxRaw);
  const fee = kesToUsdCents(amountKes, fx);
  const service = serviceFeeCents(fee);
  return {
    amountKes,
    fxRate: formatFxRate(fx),
    feeUsd: centsToUsd(fee),
    serviceFeeUsd: centsToUsd(service),
    totalUsd: centsToUsd(fee + service),
  };
}
