import { PrismaClient } from "@prisma/client";
import { quote } from "../lib/pricing";
import { HOSPITAL_TERM, INSTITUTIONS, PAYMENTS, TERMS, payoutEmail, termFee } from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  // Start from a clean slate so the seed can be re-run safely.
  await prisma.payment.deleteMany();
  await prisma.feeSchedule.deleteMany();

  const idBySlug = new Map<string, string>();

  for (const inst of INSTITUTIONS) {
    const data = {
      name: inst.name,
      type: inst.type,
      county: inst.county,
      paypalEmail: payoutEmail(inst.slug),
      officialPaybill: inst.officialPaybill,
      officialAccountNo: inst.officialAccountNo,
      verified: true,
    };
    const row = await prisma.institution.upsert({
      where: { slug: inst.slug },
      create: { slug: inst.slug, ...data },
      update: data,
    });
    idBySlug.set(inst.slug, row.id);

    const schedules = Object.entries(inst.term1Fees).flatMap(([level, term1Kes]) =>
      inst.type === "HOSPITAL"
        ? [{ level, term: HOSPITAL_TERM, amountKes: term1Kes }]
        : TERMS.map((term) => ({ level, term, amountKes: termFee(term1Kes, term) })),
    );
    await prisma.feeSchedule.createMany({
      data: schedules.map((s) => ({ ...s, institutionId: row.id })),
    });
  }

  for (const p of PAYMENTS) {
    const institutionId = idBySlug.get(p.institutionSlug);
    if (!institutionId) throw new Error(`Unknown institution ${p.institutionSlug}`);
    const q = quote(p.amountKes);
    await prisma.payment.create({
      data: {
        reference: p.reference,
        institutionId,
        beneficiaryName: p.beneficiaryName,
        beneficiaryRef: p.beneficiaryRef,
        level: p.level,
        term: p.term,
        amountKes: p.amountKes,
        amountUsd: q.totalUsd,
        fxRate: q.fxRate,
        verdict: p.verdict,
        verdictReasons: p.verdictReasons,
        extraction: { source: "seed" },
        invoiceImagePath: "seed",
        senderName: p.senderName,
        familyName: p.familyName,
        status: p.status,
        createdAt: new Date(p.createdAt),
        settledAt: p.settledAt ? new Date(p.settledAt) : null,
      },
    });
  }

  const [institutions, schedules, payments] = await Promise.all([
    prisma.institution.count(),
    prisma.feeSchedule.count(),
    prisma.payment.count(),
  ]);
  console.log(`Seeded ${institutions} institutions, ${schedules} fee schedules, ${payments} payments.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
