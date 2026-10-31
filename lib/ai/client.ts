import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

// Models that support the server-side refusal fallback: if the model declines,
// the API re-runs the request on a fallback model inside the same call.
// Claude Haiku 5.5 has no server-side fallback, so it is left out.
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export function fallbackParams(): { betas?: Anthropic.Beta.AnthropicBeta[]; fallbacks?: "default" } {
  return FALLBACK_MODELS.has(MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// A failure the UI can show as-is. Technical detail goes to the logs.
export class AiError extends Error {
  constructor(
    public readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
    this.name = "AiError";
  }
}

type Usage = { input_tokens: number; output_tokens: number };

export function logCall(task: string, model: string, startedAt: number, usage: Usage): void {
  if (process.env.NODE_ENV === "production") return;
  const ms = Date.now() - startedAt;
  console.log(`[ai] ${task} model=${model} ${ms}ms in=${usage.input_tokens} out=${usage.output_tokens}`);
}
