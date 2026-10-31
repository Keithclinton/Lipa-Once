import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";

// Server-side refusal fallback: if the model declines, the API re-runs the
// request on a fallback model inside the same call.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

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
