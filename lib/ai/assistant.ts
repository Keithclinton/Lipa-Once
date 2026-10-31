// "Ask Lipa Moja": a bursar's assistant. Every tool is scoped to one
// institution. It can read payments, check PayPal payouts and send fee
// invoices; it cannot refund, pay out or touch another school's data.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { prisma } from "../db";
import { termLabel } from "../format";
import { sendFeeInvoice } from "../invoicing";
import { getPayoutStatus } from "../paypal/payouts";
import { refreshSettlement } from "../settlement";
import { reasonList, readVerdictDetails } from "../verdict-details";
import { AiError, MODEL, anthropic, fallbackParams, logCall } from "./client";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ToolActivity = { tool: string; summary: string };
export type AssistantReply = { text: string; activity: ToolActivity[]; changedData: boolean };

const TERM = z.string().regex(/^\d{4}-T[123]$/).describe('School term, e.g. "2026-T3"');
const IN_FLIGHT = ["PAID", "PAYOUT_PENDING"];

// Kenyan school terms: Jan-Apr, May-Aug, Sep-Dec.
export function currentTerm(now = new Date()): string {
  const month = now.getUTCMonth();
  return `${now.getUTCFullYear()}-T${month < 4 ? 1 : month < 8 ? 2 : 3}`;
}

export function buildTools(institutionId: string, activity: ToolActivity[], changes: { data: boolean }) {
  const log = (tool: string, summary: string) => activity.push({ tool, summary });

  const searchPayments = betaZodTool({
    name: "search_payments",
    description:
      "Search this school's payments. Returns date, reference, student, admission number, class, term, amount in KES, payout status, AI verdict and reasons. Statuses: VERIFIED (checked, not yet paid), PAID, PAYOUT_PENDING (on its way to the school), SETTLED (received), FAILED (payout failed), BLOCKED (suspicious invoice stopped).",
    inputSchema: z.object({
      term: TERM.optional(),
      level: z.string().optional().describe('Class, e.g. "Form 3"'),
      statuses: z.array(z.enum(["VERIFIED", "PAID", "PAYOUT_PENDING", "SETTLED", "FAILED", "BLOCKED"])).optional(),
      verdict: z.enum(["APPROVE", "FLAG", "BLOCK"]).optional(),
      student: z.string().optional().describe("Part of a student's name or their admission number"),
      sinceDays: z.number().int().min(0).max(366).optional().describe("Only payments created in the last N days; 0 = today"),
    }),
    run: async (input) => {
      const since = input.sinceDays === undefined ? undefined : new Date(Date.now() - input.sinceDays * 86_400_000);
      if (since && input.sinceDays === 0) since.setUTCHours(0, 0, 0, 0);
      const rows = await prisma.payment.findMany({
        where: {
          institutionId,
          term: input.term,
          level: input.level,
          verdict: input.verdict,
          status: input.statuses ? { in: input.statuses } : undefined,
          createdAt: since ? { gte: since } : undefined,
          OR: input.student
            ? [{ beneficiaryName: { contains: input.student } }, { beneficiaryRef: input.student }]
            : undefined,
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      });
      log("search_payments", `Searched payments (${rows.length} found)`);
      return JSON.stringify(
        rows.map((p) => ({
          date: p.createdAt.toISOString().slice(0, 10),
          reference: p.reference,
          student: p.beneficiaryName,
          admNo: p.beneficiaryRef,
          class: p.level,
          term: p.term,
          amountKes: p.amountKes,
          status: p.status,
          verdict: p.verdict,
          reasons: reasonList(readVerdictDetails(p.verdictReasons, p.verdict)),
          paidBy: p.senderName,
        })),
      );
    },
  });

  const unpaidStudents = betaZodTool({
    name: "unpaid_students",
    description:
      "List enrolled students who have no settled payment for a term, with their guardian. Students whose payment is on its way are listed separately.",
    inputSchema: z.object({ term: TERM, level: z.string().optional().describe('Class, e.g. "Form 3"') }),
    run: async ({ term, level }) => {
      const [students, payments] = await Promise.all([
        prisma.student.findMany({ where: { institutionId, level }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
        prisma.payment.findMany({
          where: { institutionId, term, status: { in: ["SETTLED", ...IN_FLIGHT] } },
          select: { beneficiaryRef: true, status: true },
        }),
      ]);
      const settled = new Set(payments.filter((p) => p.status === "SETTLED").map((p) => p.beneficiaryRef));
      const inFlight = new Set(payments.filter((p) => IN_FLIGHT.includes(p.status)).map((p) => p.beneficiaryRef));
      const describe = (s: (typeof students)[number]) => ({ name: s.name, admNo: s.admNo, class: s.level, guardian: s.guardianName });
      const unpaid = students.filter((s) => !settled.has(s.admNo) && !inFlight.has(s.admNo));
      log("unpaid_students", `Compared ${students.length} enrolled students with ${termLabel(term)} payments`);
      return JSON.stringify({
        term,
        enrolled: students.length,
        notPaid: unpaid.map(describe),
        paymentOnItsWay: students.filter((s) => inFlight.has(s.admNo)).map(describe),
      });
    },
  });

  const totals = betaZodTool({
    name: "payment_totals",
    description: "Totals for this school: amount received, and how many payments are in each status, optionally for one term.",
    inputSchema: z.object({ term: TERM.optional() }),
    run: async ({ term }) => {
      const rows = await prisma.payment.groupBy({
        by: ["status"],
        where: { institutionId, term },
        _count: true,
        _sum: { amountKes: true },
      });
      log("payment_totals", "Summed payments by status");
      return JSON.stringify(rows.map((r) => ({ status: r.status, count: r._count, totalKes: r._sum.amountKes ?? 0 })));
    },
  });

  const checkPayout = betaZodTool({
    name: "check_payout",
    description: "Check a payment's payout with PayPal right now, by Lipa Moja reference (e.g. LM-H7K2P).",
    inputSchema: z.object({ reference: z.string().regex(/^LM-[A-Z0-9]{5}$/) }),
    run: async ({ reference }) => {
      const before = await prisma.payment.findFirst({ where: { reference, institutionId } });
      if (!before) return JSON.stringify({ error: `No payment ${reference} for this school.` });
      await refreshSettlement(reference);
      const p = await prisma.payment.findUniqueOrThrow({ where: { reference } });
      let paypal: unknown = null;
      if (p.payoutBatchId) {
        try {
          paypal = await getPayoutStatus(p.payoutBatchId);
        } catch {
          paypal = { error: "PayPal could not be reached" };
        }
      }
      if (p.status !== before.status) changes.data = true;
      log("check_payout", `Asked PayPal about ${reference}`);
      return JSON.stringify({ reference, status: p.status, settledAt: p.settledAt, paypalPayout: paypal });
    },
  });

  const sendInvoice = betaZodTool({
    name: "send_fee_invoice",
    description:
      "Email a PayPal invoice for a student's school fees for one term to their guardian or relative. The amount comes from the school's fee schedule. Only use when the bursar asks to invoice or bill someone and you have the student, the term and an email address.",
    inputSchema: z.object({
      admNo: z.string().describe("The student's admission number"),
      term: TERM,
      recipientEmail: z.email(),
      recipientName: z.string().optional(),
    }),
    run: async (input) => {
      const result = await sendFeeInvoice({ institutionId, ...input, recipientName: input.recipientName ?? null });
      if (result.ok) changes.data = true;
      log("send_fee_invoice", result.ok ? `Sent PayPal invoice ${result.reference}` : "Invoice not sent");
      return JSON.stringify(result);
    },
  });

  return [searchPayments, unpaidStudents, totals, checkPayout, sendInvoice];
}

function systemPrompt(institutionName: string, now: Date): string {
  return `You are "Ask Lipa Moja", the assistant on the bursar dashboard of ${institutionName}.
Lipa Moja lets relatives abroad pay school fees directly to the school through PayPal, after AI checks each invoice.

Today is ${now.toISOString().slice(0, 10)}; the current term is ${currentTerm(now)} (${termLabel(currentTerm(now))}).
When the bursar says "Term 1/2/3" without a year, assume ${now.getUTCFullYear()}.

Use the tools to answer from real data; never guess names, numbers or statuses. You only see this school's data.
You can send PayPal fee invoices when asked. You cannot issue refunds, send payouts or change payments; if asked, say so and suggest contacting Lipa Moja support.
Reply in short plain text for a busy bursar: a one-line answer first, then a short list with "- " bullets if needed. Amounts in KES with thousands separators. No tables, no headings. When you send an invoice, give the reference and the PayPal payment link.`;
}

export async function askAssistant(institutionId: string, history: ChatMessage[]): Promise<AssistantReply> {
  const inst = await prisma.institution.findUniqueOrThrow({ where: { id: institutionId } });
  const activity: ToolActivity[] = [];
  const changes = { data: false };
  const startedAt = Date.now();
  try {
    const final = await anthropic().beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      max_iterations: 8,
      ...fallbackParams(),
      output_config: { effort: "medium" },
      system: systemPrompt(inst.name, new Date()),
      tools: buildTools(institutionId, activity, changes),
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    logCall("assistant", final.model, startedAt, final.usage);
    if (final.stop_reason === "refusal") throw new AiError("I can't help with that request.");
    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { text: text || "I couldn't find an answer to that.", activity, changedData: changes.data };
  } catch (err) {
    if (err instanceof AiError) throw err;
    console.error("[ai] assistant failed", err);
    throw new AiError("The assistant isn't available right now. Please try again.", { cause: err });
  }
}
