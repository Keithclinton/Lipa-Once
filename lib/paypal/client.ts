import { z } from "zod/v4";

// Thin REST client for PayPal: OAuth token caching, JSON in/out, and zod
// validation of every response. Never logs tokens or full responses.

const TokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

let cached: { token: string; expiresAt: number } | null = null;

export class PayPalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issue: string | null,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

function config() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new PayPalError("PayPal credentials are not configured", 500, null);
  return { clientId, secret, base: process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com" };
}

export async function accessToken(): Promise<string> {
  // Refresh a minute before expiry.
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const { clientId, secret, base } = config();
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status})`, res.status, null);
  const body = TokenSchema.parse(await res.json());
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

const ErrorBodySchema = z
  .object({ name: z.string().optional(), details: z.array(z.object({ issue: z.string() })).optional() })
  .loose();

export async function paypalRequest<T>(
  method: "GET" | "POST",
  path: string,
  schema: z.ZodType<T>,
  options: { body?: unknown; requestId?: string } = {},
): Promise<T> {
  const { base } = config();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
  };
  // PayPal-Request-Id makes POST retries idempotent on PayPal's side.
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const json: unknown = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = ErrorBodySchema.safeParse(json);
    const issue = err.success ? (err.data.details?.[0]?.issue ?? err.data.name ?? null) : null;
    console.error(`[paypal] ${method} ${path} -> ${res.status} ${issue ?? ""}`);
    throw new PayPalError(`PayPal ${method} ${path} failed (${res.status})`, res.status, issue);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[paypal] unexpected response from ${method} ${path}`, parsed.error.issues.slice(0, 3));
    throw new PayPalError(`Unexpected PayPal response from ${path}`, 502, null);
  }
  return parsed.data;
}
