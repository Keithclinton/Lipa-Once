import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { uploadDir } from "@/lib/uploads";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" };

// Serves the uploaded invoice for a payment, for the review page preview.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await prisma.payment.findUnique({ where: { id }, select: { invoiceImagePath: true } });
  const name = payment?.invoiceImagePath ?? "";
  const ext = name.split(".").pop() ?? "";
  // Stored names are "<uuid>.<ext>"; anything else (e.g. seeded rows) has no file.
  if (!/^[0-9a-f-]{36}\.(png|jpg|pdf)$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(uploadDir(), name));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[ext], "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
