import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { askAssistant } from "@/lib/ai/assistant";
import { AiError } from "@/lib/ai/client";
import { cookieName, isValidSession } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(20)
    .refine((m) => m[m.length - 1].role === "user", "The last message must be from the user"),
});

export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { slug, messages } = body.data;

  if (!isValidSession(slug, (await cookies()).get(cookieName(slug))?.value)) {
    return NextResponse.json({ error: "Please unlock the dashboard first." }, { status: 401 });
  }
  const inst = await prisma.institution.findUnique({ where: { slug }, select: { id: true } });
  if (!inst) return NextResponse.json({ error: "Unknown institution." }, { status: 404 });

  try {
    return NextResponse.json(await askAssistant(inst.id, messages));
  } catch (err) {
    const message = err instanceof AiError ? err.userMessage : "The assistant isn't available right now.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
