// Deterministic checks that run before any AI reasoning. Pure functions:
// callers load the registry and payment history and pass them in.
import type { Extraction } from "./extraction";
import { formatDate, formatKes, shortName, termLabel } from "./format";

export type Verdict = "APPROVE" | "FLAG" | "BLOCK";
export type Severity = "PASS" | "FLAG" | "BLOCK";

export type CheckCode =
  | "DOCUMENT_TYPE"
  | "INSTITUTION"
  | "PAYMENT_DETAILS"
  | "AMOUNT"
  | "LINE_ITEMS"
  | "DUPLICATE"
  | "LEGIBILITY";

export type Finding = { code: CheckCode; severity: Severity; message: string };

export type RegistryInstitution = {
  id: string;
  name: string;
  county: string;
  officialPaybill: string | null;
  officialAccountNo: string | null;
  feeSchedules: { level: string; term: string; amountKes: number }[];
};

export type SettledPayment = {
  reference: string;
  institutionId: string | null;
  beneficiaryRef: string | null;
  term: string | null;
  settledAt: Date | null;
};

export type VerifyContext = {
  institutions: RegistryInstitution[];
  settledPayments: SettledPayment[];
};

export type VerifyResult = {
  verdict: Verdict;
  institution: RegistryInstitution | null;
  findings: Finding[];
};

export const MIN_CONFIDENCE = 0.7;
export const FLAG_RATIO = 1.5;
export const BLOCK_RATIO = 2;
export const NAME_MATCH_THRESHOLD = 0.75;
// Fees with no term (hospital services) are stored under this term.
export const ANY_TERM = "ANY";

const SEVERITY_RANK: Record<Severity, number> = { PASS: 0, FLAG: 1, BLOCK: 2 };

// Words that don't distinguish one institution from another.
const GENERIC_WORDS = new Set(["the", "of", "and", "school", "high", "secondary", "sec", "sch", "national", "academy"]);

export function nameTokens(name: string): string[] {
  return shortName(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !GENERIC_WORDS.has(t));
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// Tolerates one typo in longer words ("Lakside" for "Lakeside").
function sameWord(a: string, b: string): boolean {
  return a === b || (Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1);
}

// Dice similarity over distinguishing words, 0..1.
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const unmatched = [...tb];
  let shared = 0;
  for (const t of ta) {
    const i = unmatched.findIndex((u) => sameWord(t, u));
    if (i >= 0) {
      shared++;
      unmatched.splice(i, 1);
    }
  }
  return (2 * shared) / (ta.length + tb.length);
}

export function matchInstitution(
  extraction: Pick<Extraction, "institutionName" | "institutionLocation">,
  institutions: RegistryInstitution[],
): RegistryInstitution | null {
  const location = (extraction.institutionLocation ?? "").toLowerCase();
  let best: { inst: RegistryInstitution; score: number } | null = null;
  for (const inst of institutions) {
    let score = nameSimilarity(extraction.institutionName, inst.name);
    // A matching town or county breaks ties between similar names.
    const town = inst.name.split(",")[1]?.trim().toLowerCase();
    if (location && ((town && location.includes(town)) || location.includes(inst.county.toLowerCase()))) {
      score += 0.05;
    }
    if (!best || score > best.score) best = { inst, score };
  }
  return best && best.score >= NAME_MATCH_THRESHOLD ? best.inst : null;
}

const digitsOnly = (s: string | null) => (s ? s.replace(/\D/g, "") : null);

function checkPaymentDetails(e: Extraction, inst: RegistryInstitution): Finding {
  const name = shortName(inst.name);
  const paybill = digitsOnly(e.paymentDetails.paybill);
  const accountNo = digitsOnly(e.paymentDetails.accountNo);
  const officialPaybill = digitsOnly(inst.officialPaybill);
  const officialAccountNo = digitsOnly(inst.officialAccountNo);
  const problems: string[] = [];
  if (paybill && officialPaybill && paybill !== officialPaybill) {
    problems.push(`paybill ${paybill}`);
  }
  // Ignore an "account" that is really the M-Pesa reference (the admission number).
  if (accountNo && officialAccountNo && accountNo !== e.beneficiaryRef && accountNo !== officialAccountNo) {
    problems.push(`bank account ${e.paymentDetails.accountNo}`);
  }
  if (problems.length) {
    return {
      code: "PAYMENT_DETAILS",
      severity: "BLOCK",
      message: `Payment details don't match ${name}'s verified account: the invoice shows ${problems.join(" and ")}.`,
    };
  }
  if (!paybill && !accountNo) {
    return {
      code: "PAYMENT_DETAILS",
      severity: "FLAG",
      message: `No payment details are printed on this invoice. We'll pay ${name}'s verified account.`,
    };
  }
  return { code: "PAYMENT_DETAILS", severity: "PASS", message: `Payment details match ${name}'s verified account.` };
}

function checkAmount(e: Extraction, inst: RegistryInstitution): Finding {
  if (e.totalKes <= 0) {
    return { code: "AMOUNT", severity: "BLOCK", message: "We couldn't read a total amount on this invoice." };
  }
  const schedule = inst.feeSchedules.find(
    (f) => e.level && f.level.toLowerCase() === e.level.toLowerCase() && (f.term === e.term || f.term === ANY_TERM),
  );
  const what = [e.level, termLabel(e.term)].filter(Boolean).join(" ") || "this bill";
  if (!schedule) {
    return {
      code: "AMOUNT",
      severity: "FLAG",
      message: `We don't have a standard fee for ${what} to compare against. Please check the amount.`,
    };
  }
  const usual = schedule.amountKes;
  // Integer comparisons: total > ratio * usual.
  const ratio = Math.round((e.totalKes * 10) / usual) / 10;
  if (e.totalKes * 10 > usual * BLOCK_RATIO * 10) {
    return {
      code: "AMOUNT",
      severity: "BLOCK",
      message: `Amount is ${ratio}× the usual ${what} fee of ${formatKes(usual)}.`,
    };
  }
  if (e.totalKes * 10 > usual * FLAG_RATIO * 10) {
    return {
      code: "AMOUNT",
      severity: "FLAG",
      message: `Amount is ${ratio}× the usual ${what} fee of ${formatKes(usual)}. Please confirm the extra charges.`,
    };
  }
  return { code: "AMOUNT", severity: "PASS", message: `Amount is in line with the usual ${what} fee.` };
}

function checkLineItems(e: Extraction): Finding | null {
  if (!e.lineItems.length) return null;
  const sum = e.lineItems.reduce((s, li) => s + li.amountKes, 0);
  if (Math.abs(sum - e.totalKes) > 1) {
    return {
      code: "LINE_ITEMS",
      severity: "FLAG",
      message: `The line items add up to ${formatKes(sum)}, but the invoice total is ${formatKes(e.totalKes)}.`,
    };
  }
  return { code: "LINE_ITEMS", severity: "PASS", message: "Line items add up to the total." };
}

function checkDuplicate(e: Extraction, inst: RegistryInstitution, settled: SettledPayment[]): Finding | null {
  if (!e.beneficiaryRef || !e.term) return null;
  const prior = settled.find(
    (p) => p.institutionId === inst.id && p.beneficiaryRef === e.beneficiaryRef && p.term === e.term,
  );
  if (!prior) return { code: "DUPLICATE", severity: "PASS", message: "No earlier payment found for this bill." };
  const when = prior.settledAt ? ` on ${formatDate(prior.settledAt)}` : "";
  return {
    code: "DUPLICATE",
    severity: "BLOCK",
    message: `This bill was already paid${when}, ref ${prior.reference}.`,
  };
}

function checkLegibility(e: Extraction): Finding {
  if (e.confidence < MIN_CONFIDENCE || e.legibilityIssues.length) {
    const issues = e.legibilityIssues.length ? ` (${e.legibilityIssues.join("; ")})` : "";
    return {
      code: "LEGIBILITY",
      severity: "FLAG",
      message: `Parts of this invoice are hard to read${issues}. Please check the details or upload a clearer photo.`,
    };
  }
  return { code: "LEGIBILITY", severity: "PASS", message: "The invoice is clear and readable." };
}

export function worstVerdict(severities: Severity[]): Verdict {
  const worst = severities.reduce<Severity>((a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a), "PASS");
  return worst === "PASS" ? "APPROVE" : worst;
}

// AI concerns can raise APPROVE to FLAG. Nothing the AI says lowers a verdict.
export function applyAiConcerns(ruleVerdict: Verdict, concerns: string[]): Verdict {
  return ruleVerdict === "APPROVE" && concerns.length ? "FLAG" : ruleVerdict;
}

export function verifyExtraction(e: Extraction, ctx: VerifyContext): VerifyResult {
  const findings: Finding[] = [];

  if (e.documentType === "OTHER") {
    findings.push({
      code: "DOCUMENT_TYPE",
      severity: "BLOCK",
      message: "This doesn't look like a school fee invoice or hospital bill.",
    });
  }

  const institution = matchInstitution(e, ctx.institutions);
  if (!institution) {
    findings.push({
      code: "INSTITUTION",
      severity: "BLOCK",
      message: `We can only pay verified institutions, and "${e.institutionName || "this institution"}" isn't in our registry.`,
    });
  } else {
    findings.push({
      code: "INSTITUTION",
      severity: "PASS",
      message: `${institution.name} is a verified institution.`,
    });
    findings.push(checkPaymentDetails(e, institution));
    findings.push(checkAmount(e, institution));
    const duplicate = checkDuplicate(e, institution, ctx.settledPayments);
    if (duplicate) findings.push(duplicate);
  }

  const lineItems = checkLineItems(e);
  if (lineItems) findings.push(lineItems);
  findings.push(checkLegibility(e));

  return { verdict: worstVerdict(findings.map((f) => f.severity)), institution, findings };
}
