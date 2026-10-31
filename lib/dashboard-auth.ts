import { createHash, timingSafeEqual } from "node:crypto";

// A shared passcode per deployment is enough for the demo dashboards.
// With DASHBOARD_PASSCODE unset, dashboards are open.

export const cookieName = (slug: string) => `lm_dash_${slug}`;

export function passcodeRequired(): boolean {
  return Boolean(process.env.DASHBOARD_PASSCODE);
}

export function sessionToken(slug: string): string {
  return createHash("sha256").update(`${process.env.DASHBOARD_PASSCODE ?? ""}:${slug}`).digest("hex");
}

export function isValidSession(slug: string, cookie: string | undefined): boolean {
  if (!passcodeRequired()) return true;
  if (!cookie) return false;
  const expected = Buffer.from(sessionToken(slug));
  const actual = Buffer.from(cookie);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function checkPasscode(input: string): boolean {
  const expected = Buffer.from(process.env.DASHBOARD_PASSCODE ?? "");
  const actual = Buffer.from(input);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
