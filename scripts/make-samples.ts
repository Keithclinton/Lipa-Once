// Renders the demo invoices in public/samples/ from HTML so they are original
// artwork tied to the fictional registry in prisma/seed-data.ts.
// Usage: npm run samples
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { INSTITUTIONS, termFee } from "../prisma/seed-data";

type Invoice = {
  file: string;
  slug: string;
  student: string;
  admNo: string;
  level: string;
  termLabel: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  items: [string, number][];
  // Defaults to the registry's official details; the doctored invoice overrides them.
  paybill?: string;
  bankAccount?: string;
  bankName?: string;
  blurry?: boolean;
};

const mlima = INSTITUTIONS.find((i) => i.slug === "mlima-girls-eldoret")!;
const lakeside = INSTITUTIONS.find((i) => i.slug === "lakeside-boys-kisumu")!;

// Term 3 items for a Mlima Form 3 student, summing to the scheduled fee.
const mlimaForm3T3: [string, number][] = [
  ["Tuition", 9_000],
  ["Boarding & meals", 7_800],
  ["Development & PTA levy", 2_000],
  ["Activity fee", 1_000],
  ["Medical cover", 500],
];

const invoices: Invoice[] = [
  {
    file: "genuine-invoice.png",
    slug: mlima.slug,
    student: "Achieng Otieno",
    admNo: "4521",
    level: "Form 3",
    termLabel: "Term 3, 2026",
    invoiceNo: "MGN/26/T3/4521",
    issueDate: "28 Aug 2026",
    dueDate: "30 Nov 2026",
    items: mlimaForm3T3,
  },
  {
    // Same school, transposed paybill digits, a different bank account and
    // two invented levies: about 2.3x the usual fee.
    file: "doctored-invoice.png",
    slug: mlima.slug,
    student: "Wairimu Kamau",
    admNo: "4533",
    level: "Form 3",
    termLabel: "Term 3, 2026",
    invoiceNo: "MGN/26/T3/4533",
    issueDate: "28 Aug 2026",
    dueDate: "30 Nov 2026",
    items: [
      ...mlimaForm3T3,
      ["Laboratory equipment levy", 14_900],
      ["Educational tour (compulsory)", 11_500],
    ],
    paybill: "582641",
    bankAccount: "0178-6602-9915",
    bankName: "Equatorial Commercial Bank",
  },
  {
    file: "blurry-invoice.png",
    slug: lakeside.slug,
    student: "Brian Otieno",
    admNo: "6245",
    level: "Form 3",
    termLabel: "Term 3, 2026",
    invoiceNo: "NLB/26/T3/6245",
    issueDate: "29 Aug 2026",
    dueDate: "30 Nov 2026",
    items: [
      ["Tuition", 7_800],
      ["Boarding & meals", 6_800],
      ["Development & PTA levy", 1_700],
      ["Activity fee", 900],
      ["Medical cover", 400],
    ],
    blurry: true,
  },
  {
    // A re-issue of the bill already settled in the seed history (LM-H7K2P).
    file: "duplicate-invoice.png",
    slug: mlima.slug,
    student: "Mercy Jepkoech",
    admNo: "3187",
    level: "Form 2",
    termLabel: "Term 3, 2026",
    invoiceNo: "MGN/26/T3/3187",
    issueDate: "28 Aug 2026",
    dueDate: "30 Nov 2026",
    items: [
      ["Tuition", 8_800],
      ["Boarding & meals", 7_600],
      ["Development & PTA levy", 1_900],
      ["Activity fee", 1_000],
      ["Medical cover", 500],
    ],
  },
];

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

function initials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter((w) => /^[A-Z]/.test(w) && !["School", "High", "National", "Secondary"].includes(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

function render(inv: Invoice): string {
  const inst = INSTITUTIONS.find((i) => i.slug === inv.slug)!;
  const [schoolName, town] = inst.name.split(", ");
  const total = inv.items.reduce((sum, [, amount]) => sum + amount, 0);
  const rows = inv.items
    .map(([desc, amount]) => `<tr><td>${desc}</td><td class="amt">${kes(amount)}</td></tr>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #d9d4cb; font-family: Georgia, "Times New Roman", serif; }
    .page { width: 760px; margin: 30px; padding: 44px 52px; background: #fffdf8; color: #1f2933;
            box-shadow: 0 2px 10px rgba(0,0,0,.25); position: relative;
            ${inv.blurry ? "filter: blur(1.6px) contrast(.8) brightness(1.04); transform: rotate(-1.4deg);" : ""} }
    header { display: flex; gap: 20px; align-items: center; border-bottom: 3px double #1f4d3a; padding-bottom: 16px; }
    .crest { width: 74px; height: 74px; border-radius: 50%; border: 3px solid #1f4d3a; color: #1f4d3a;
             display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; }
    h1 { margin: 0; font-size: 26px; letter-spacing: .5px; color: #1f4d3a; }
    .sub { font-size: 13px; color: #52606d; margin-top: 4px; }
    h2 { text-align: center; font-size: 17px; letter-spacing: 3px; margin: 22px 0 14px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 14px; }
    .meta b { display: inline-block; min-width: 120px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
    th, td { border: 1px solid #9aa5b1; padding: 7px 10px; text-align: left; }
    th { background: #eef2ee; }
    .amt { text-align: right; font-variant-numeric: tabular-nums; }
    .total td { font-weight: bold; background: #eef2ee; font-size: 15px; }
    .pay { margin-top: 20px; padding: 12px 16px; border: 1px dashed #1f4d3a; font-size: 14px; line-height: 1.6; }
    .foot { margin-top: 26px; display: flex; justify-content: space-between; font-size: 12px; color: #52606d; }
    .stamp { border: 2px solid #7b2d26; color: #7b2d26; padding: 6px 12px; transform: rotate(-6deg);
             font-weight: bold; letter-spacing: 1px; opacity: .75; }
    .smudge { position: absolute; right: 40px; top: 478px; width: 220px; height: 64px; border-radius: 50%;
              background: radial-gradient(ellipse, rgba(120,90,50,.7), rgba(120,90,50,0) 70%); }
  </style></head><body>
  <div class="page">
    <header>
      <div class="crest">${initials(schoolName)}</div>
      <div>
        <h1>${schoolName.toUpperCase()}</h1>
        <div class="sub">P.O. Box ${1000 + inv.admNo.length * 137}, ${town} · ${inst.county} County</div>
        <div class="sub">Motto: Knowledge with Integrity</div>
      </div>
    </header>
    <h2>FEE INVOICE</h2>
    <div class="meta">
      <div><b>Invoice No:</b> ${inv.invoiceNo}</div>
      <div><b>Issue date:</b> ${inv.issueDate}</div>
      <div><b>Student:</b> ${inv.student}</div>
      <div><b>Due date:</b> ${inv.dueDate}</div>
      <div><b>Adm No:</b> ${inv.admNo}</div>
      <div><b>Class:</b> ${inv.level}</div>
      <div><b>Term:</b> ${inv.termLabel}</div>
    </div>
    <table>
      <tr><th>Description</th><th class="amt">Amount</th></tr>
      ${rows}
      <tr class="total"><td>TOTAL DUE</td><td class="amt">${kes(total)}</td></tr>
    </table>
    <div class="pay">
      <b>How to pay</b><br>
      M-Pesa Paybill: <b>${inv.paybill ?? inst.officialPaybill}</b> · Account: <b>${inv.admNo}</b><br>
      Bank: ${inv.bankName ?? "Rift Cooperative Bank"} · A/C No: <b>${inv.bankAccount ?? inst.officialAccountNo}</b><br>
      Quote the student's admission number on every payment.
    </div>
    <div class="foot">
      <div>Bursar's office · Fees once paid are not refundable</div>
      <div class="stamp">BURSAR · ${town.toUpperCase()}</div>
    </div>
    ${inv.blurry ? '<div class="smudge"></div>' : ""}
  </div></body></html>`;
}

async function main() {
  mkdirSync("public/samples", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 860, height: 1100 }, deviceScaleFactor: 1.5 });
  for (const inv of invoices) {
    await page.setContent(render(inv));
    await page.locator(".page").screenshot({ path: `public/samples/${inv.file}` });
    const total = inv.items.reduce((sum, [, amount]) => sum + amount, 0);
    console.log(`${inv.file}: ${kes(total)}`);
  }
  await browser.close();
}

// Keep the generator honest: the clean invoices must match the fee schedule.
for (const inv of invoices.filter((i) => i.file !== "doctored-invoice.png")) {
  const inst = INSTITUTIONS.find((i) => i.slug === inv.slug)!;
  const total = inv.items.reduce((sum, [, amount]) => sum + amount, 0);
  const expected = termFee(inst.term1Fees[inv.level], "2026-T3");
  if (total !== expected) throw new Error(`${inv.file}: total ${total} != schedule ${expected}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
