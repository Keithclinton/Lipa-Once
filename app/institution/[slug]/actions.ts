"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPasscode, cookieName, sessionToken } from "@/lib/dashboard-auth";

export async function unlockDashboard(slug: string, _prev: string | null, form: FormData): Promise<string | null> {
  const passcode = String(form.get("passcode") ?? "");
  if (!checkPasscode(passcode)) return "That passcode isn't right.";
  (await cookies()).set(cookieName(slug), sessionToken(slug), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/`,
    maxAge: 60 * 60 * 8,
  });
  redirect(`/institution/${slug}`);
}
