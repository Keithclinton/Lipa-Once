// Fictional institutions for the demo. Names, paybills and account numbers
// are invented and must not match any real school or hospital.

export type SeedInstitution = {
  slug: string;
  name: string;
  type: "SCHOOL" | "HOSPITAL";
  county: string;
  officialPaybill: string;
  officialAccountNo: string;
  // KES per level for Term 1; Terms 2 and 3 are derived from it.
  term1Fees: Record<string, number>;
};

export const TERMS = ["2026-T1", "2026-T2", "2026-T3"] as const;

// Kenyan schools front-load fees: Term 1 is the largest instalment.
const TERM_SHARE: Record<(typeof TERMS)[number], number> = {
  "2026-T1": 100,
  "2026-T2": 65,
  "2026-T3": 45,
};

export function termFee(term1Kes: number, term: (typeof TERMS)[number]): number {
  // Round to the nearest KES 100, the way fee structures are printed.
  return Math.round((term1Kes * TERM_SHARE[term]) / 100 / 100) * 100;
}

export const INSTITUTIONS: SeedInstitution[] = [
  {
    slug: "mlima-girls-eldoret",
    name: "Mlima Girls National School, Eldoret",
    type: "SCHOOL",
    county: "Uasin Gishu",
    officialPaybill: "582614",
    officialAccountNo: "0114-2290-3381",
    term1Fees: { "Form 1": 48_500, "Form 2": 44_000, "Form 3": 45_000, "Form 4": 47_500 },
  },
  {
    slug: "lakeside-boys-kisumu",
    name: "Nyanza Lakeside Boys High School, Kisumu",
    type: "SCHOOL",
    county: "Kisumu",
    officialPaybill: "739120",
    officialAccountNo: "0207-5513-0942",
    term1Fees: { "Form 1": 42_000, "Form 2": 38_500, "Form 3": 39_000, "Form 4": 41_000 },
  },
  {
    slug: "upendo-day-nairobi",
    name: "Upendo Day Secondary School, Nairobi",
    type: "SCHOOL",
    county: "Nairobi",
    officialPaybill: "461873",
    officialAccountNo: "0331-8840-1176",
    term1Fees: { "Form 1": 9_500, "Form 2": 8_000, "Form 3": 8_000, "Form 4": 9_000 },
  },
  {
    slug: "pwani-heritage-mombasa",
    name: "Pwani Heritage Academy, Mombasa",
    type: "SCHOOL",
    county: "Mombasa",
    officialPaybill: "904357",
    officialAccountNo: "0459-2071-6630",
    term1Fees: { "Form 1": 68_000, "Form 2": 65_000, "Form 3": 65_000, "Form 4": 70_000 },
  },
  {
    slug: "tumaini-referral-nakuru",
    name: "Tumaini County Referral Hospital, Nakuru",
    type: "HOSPITAL",
    county: "Nakuru",
    officialPaybill: "318249",
    officialAccountNo: "0562-3398-2014",
    // Hospitals have one schedule per service, not per term.
    term1Fees: { Outpatient: 3_500, Maternity: 15_000, Inpatient: 45_000, Surgery: 120_000 },
  },
];

// Hospital fee schedules use this term value.
export const HOSPITAL_TERM = "ANY";

// Payout receiver: PAYOUT_EMAIL_<SLUG> overrides the default sandbox address,
// e.g. PAYOUT_EMAIL_MLIMA_GIRLS_ELDORET=sb-xxxx@business.example.com
export function payoutEmail(slug: string): string {
  const key = `PAYOUT_EMAIL_${slug.toUpperCase().replace(/-/g, "_")}`;
  return process.env[key] || `${slug}@business.example.com`;
}

export type SeedPayment = {
  reference: string;
  institutionSlug: string;
  beneficiaryName: string;
  beneficiaryRef: string;
  level: string;
  term: string;
  amountKes: number;
  verdict: "APPROVE" | "FLAG" | "BLOCK";
  verdictReasons: string[];
  status: "SETTLED" | "PAYOUT_PENDING" | "FAILED" | "BLOCKED";
  senderName: string;
  familyName?: string;
  createdAt: string;
  settledAt?: string;
};

// Payment history for the dashboard and the duplicate-payment demo.
export const PAYMENTS: SeedPayment[] = [
  {
    // duplicate-invoice.png is a re-issue of this bill.
    reference: "LM-H7K2P",
    institutionSlug: "mlima-girls-eldoret",
    beneficiaryName: "Mercy Jepkoech",
    beneficiaryRef: "3187",
    level: "Form 2",
    term: "2026-T3",
    amountKes: 19_800,
    verdict: "APPROVE",
    verdictReasons: ["Institution and payment details match the verified registry."],
    status: "SETTLED",
    senderName: "Daniel Kiprotich",
    familyName: "Ruth Jepkoech",
    createdAt: "2026-09-02T08:14:00Z",
    settledAt: "2026-09-02T08:21:00Z",
  },
  {
    reference: "LM-3RQ8T",
    institutionSlug: "mlima-girls-eldoret",
    beneficiaryName: "Joy Chepchirchir",
    beneficiaryRef: "4410",
    level: "Form 3",
    term: "2026-T3",
    amountKes: 20_300,
    verdict: "APPROVE",
    verdictReasons: ["Institution and payment details match the verified registry."],
    status: "SETTLED",
    senderName: "Eunice Chebet",
    createdAt: "2026-09-04T17:40:00Z",
    settledAt: "2026-09-04T17:46:00Z",
  },
  {
    reference: "LM-9WD4M",
    institutionSlug: "mlima-girls-eldoret",
    beneficiaryName: "Sharon Wambui",
    beneficiaryRef: "4398",
    level: "Form 3",
    term: "2026-T3",
    amountKes: 20_300,
    verdict: "FLAG",
    verdictReasons: ["The photo was slightly blurred; the sender confirmed the amount before paying."],
    status: "SETTLED",
    senderName: "Grace Njeri",
    createdAt: "2026-09-06T11:02:00Z",
    settledAt: "2026-09-06T11:10:00Z",
  },
  {
    reference: "LM-K5N2V",
    institutionSlug: "mlima-girls-eldoret",
    beneficiaryName: "Faith Atieno",
    beneficiaryRef: "4502",
    level: "Form 3",
    term: "2026-T3",
    amountKes: 20_300,
    verdict: "APPROVE",
    verdictReasons: ["Institution and payment details match the verified registry."],
    status: "FAILED",
    senderName: "Peter Ochieng",
    createdAt: "2026-09-10T06:55:00Z",
  },
  {
    reference: "LM-P8X3C",
    institutionSlug: "mlima-girls-eldoret",
    beneficiaryName: "Linet Kerubo",
    beneficiaryRef: "3920",
    level: "Form 4",
    term: "2026-T3",
    amountKes: 49_900,
    verdict: "BLOCK",
    verdictReasons: [
      "The paybill on this invoice doesn't match Mlima Girls' verified paybill.",
      "Amount is 2.3× the usual Form 4 Term 3 fee.",
    ],
    status: "BLOCKED",
    senderName: "Anne Moraa",
    createdAt: "2026-09-12T19:20:00Z",
  },
  {
    reference: "LM-T6G9H",
    institutionSlug: "mlima-girls-eldoret",
    beneficiaryName: "Cynthia Naliaka",
    beneficiaryRef: "2755",
    level: "Form 1",
    term: "2026-T3",
    amountKes: 21_800,
    verdict: "APPROVE",
    verdictReasons: ["Institution and payment details match the verified registry."],
    status: "PAYOUT_PENDING",
    senderName: "Mary Wekesa",
    createdAt: "2026-10-09T14:31:00Z",
  },
  {
    reference: "LM-B2M7R",
    institutionSlug: "lakeside-boys-kisumu",
    beneficiaryName: "Kevin Odhiambo",
    beneficiaryRef: "6120",
    level: "Form 4",
    term: "2026-T3",
    amountKes: 18_500,
    verdict: "APPROVE",
    verdictReasons: ["Institution and payment details match the verified registry."],
    status: "SETTLED",
    senderName: "Lucy Akinyi",
    createdAt: "2026-09-03T09:12:00Z",
    settledAt: "2026-09-03T09:18:00Z",
  },
  {
    reference: "LM-Z4F8Q",
    institutionSlug: "tumaini-referral-nakuru",
    beneficiaryName: "John Kamau",
    beneficiaryRef: "IP-20931",
    level: "Inpatient",
    term: HOSPITAL_TERM,
    amountKes: 45_000,
    verdict: "APPROVE",
    verdictReasons: ["Institution and payment details match the verified registry."],
    status: "SETTLED",
    senderName: "Samuel Mwangi",
    createdAt: "2026-09-21T22:05:00Z",
    settledAt: "2026-09-21T22:12:00Z",
  },
];
