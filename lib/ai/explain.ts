import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { Extraction } from "../extraction";
import type { Finding, Verdict } from "../verify";
import { MODEL, anthropic, fallbackParams, logCall } from "./client";

const ReviewSchema = z.object({
  summary: z.string().describe("One or two sentences for the sender explaining the verdict"),
  concerns: z
    .array(
      z.object({
        text: z.string().describe("One short sentence"),
        serious: z
          .boolean()
          .describe("True only if a careful relative should stop and check this before paying"),
      }),
    )
    .describe("Concerns the automated checks did not already raise; empty if none"),
});

export type Review = { summary: string; concerns: string[] };

const SYSTEM = `You help diaspora Kenyans pay school fees and hospital bills directly to verified institutions.
You are given a bill's extracted details, the result of automated checks, and the verdict.
Verdicts: APPROVE means it is safe to pay. FLAG means the sender can still pay after checking the warnings, so explain what to check. BLOCK means Lipa Once will not pay this bill.

Write for the sender, who is paying from abroad and wants to know whether it is safe to pay:
- summary: one or two plain, friendly sentences explaining the verdict. Mention the most important reason first. No jargon, no emoji.
- concerns: only things a careful relative would want to check before paying that the checks did not already raise, such as an unusual charge that isn't part of a normal fee structure, a "compulsory" extra, a due date long past, or names and numbers that contradict each other. Do not repeat the checks' findings.

Normal Kenyan school fee items are not concerns: tuition, boarding and meals, development or PTA levies, activity fees, medical cover, exam fees, uniform and remedial charges. Normal hospital items (consultation, ward, theatre, drugs, lab tests) are not concerns either. If nothing stands out, return an empty list; most genuine bills have no concerns.
Mark a concern serious only if the sender should stop and check it before paying.

You cannot change the verdict. Never describe a blocked bill as safe to pay, and never describe an approved bill as risky.`;

export function reviewPrompt(extraction: Extraction, findings: Finding[], verdict: Verdict, today: string): string {
  return JSON.stringify({ today, verdict, checks: findings, bill: extraction }, null, 2);
}

// Returns null if the model is unavailable; callers then show the rule findings alone.
// Only serious concerns are kept: they are shown to the sender and can raise the verdict.
export async function reviewInvoice(
  extraction: Extraction,
  findings: Finding[],
  verdict: Verdict,
): Promise<Review | null> {
  const startedAt = Date.now();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      ...fallbackParams(),
      output_config: { effort: "low", format: betaZodOutputFormat(ReviewSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: reviewPrompt(extraction, findings, verdict, today) }],
    });
    logCall("review", response.model, startedAt, response.usage);
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return {
      summary: response.parsed_output.summary.trim(),
      concerns: response.parsed_output.concerns
        .filter((c) => c.serious)
        .map((c) => c.text.trim())
        .filter(Boolean)
        .slice(0, 3),
    };
  } catch (err) {
    console.error("[ai] review failed", err);
    return null;
  }
}
