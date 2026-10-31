import { z } from "zod/v4";

// Stored in Payment.verdictReasons. Seeded history uses a plain string list,
// which readVerdictDetails() also accepts.
export const VerdictDetailsSchema = z.object({
  summary: z.string().nullable(),
  findings: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["PASS", "FLAG", "BLOCK"]),
      message: z.string(),
    }),
  ),
  concerns: z.array(z.string()),
});

export type VerdictDetails = z.infer<typeof VerdictDetailsSchema>;

export function readVerdictDetails(json: unknown, verdict: string): VerdictDetails {
  const parsed = VerdictDetailsSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  const legacy = z.array(z.string()).safeParse(json);
  const severity = verdict === "BLOCK" ? "BLOCK" : verdict === "FLAG" ? "FLAG" : "PASS";
  return {
    summary: null,
    findings: (legacy.success ? legacy.data : []).map((message) => ({ code: "LEGACY", severity, message })),
    concerns: [],
  };
}

// Plain reasons for messages and the dashboard: problems first, then AI concerns.
export function reasonList(details: VerdictDetails): string[] {
  const problems = details.findings.filter((f) => f.severity !== "PASS").map((f) => f.message);
  return [...problems, ...details.concerns];
}
