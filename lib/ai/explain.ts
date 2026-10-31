import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { Extraction } from "../extraction";
import type { Finding, Verdict } from "../verify";
import { FALLBACK_BETA, MODEL, anthropic, logCall } from "./client";

const ReviewSchema = z.object({
  summary: z.string().describe("One or two sentences for the sender explaining the verdict"),
  concerns: z
    .array(z.string())
    .describe("Additional concerns the rule checks did not already raise; empty if none"),
});

export type Review = z.infer<typeof ReviewSchema>;

const SYSTEM = `You help diaspora Kenyans pay school fees and hospital bills directly to verified institutions.
You are given a bill's extracted details, the result of automated checks, and the verdict.

Write for the sender, who is paying from abroad and wants to know whether it is safe to pay:
- summary: one or two plain, friendly sentences explaining the verdict. Mention the most important reason first. No jargon, no emoji.
- concerns: anything else on the bill that looks unusual and that the checks did not already cover, such as unexpected or "compulsory" charges, a due date in the past, or inconsistent names or numbers. Each concern is one short sentence. Return an empty list if there is nothing to add. Do not repeat the checks' findings.

You cannot change the verdict. Never describe a blocked bill as safe to pay.`;

export function reviewPrompt(extraction: Extraction, findings: Finding[], verdict: Verdict, today: string): string {
  return JSON.stringify({ today, verdict, checks: findings, bill: extraction }, null, 2);
}

// Returns null if the model is unavailable; callers then show the rule findings alone.
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
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ReviewSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: reviewPrompt(extraction, findings, verdict, today) }],
    });
    logCall("review", response.model, startedAt, response.usage);
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return {
      summary: response.parsed_output.summary.trim(),
      concerns: response.parsed_output.concerns.map((c) => c.trim()).filter(Boolean).slice(0, 4),
    };
  } catch (err) {
    console.error("[ai] review failed", err);
    return null;
  }
}
