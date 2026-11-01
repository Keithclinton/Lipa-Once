import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { AiError } from "@/lib/ai/client";
import type { InvoiceFile } from "@/lib/ai/extract";
import { createPaymentFromInvoice } from "@/lib/payments";
import { MAX_UPLOAD_BYTES, SAMPLE_INVOICES, isSampleFile, loadSample, sniffType } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 120;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const FieldsSchema = z.object({
  sample: z.enum(SAMPLE_INVOICES).optional(),
  senderName: optional(80),
  senderEmail: z
    .union([z.literal(""), z.email().max(120)])
    .optional()
    .transform((v) => v || undefined),
  familyName: optional(80),
  familyPhone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{0,20}$/, "Phone numbers can only contain digits, spaces and +")
    .optional()
    .transform((v) => v || undefined),
});

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Please attach an invoice.", 400);
  }

  const fields = FieldsSchema.safeParse({
    sample: form.get("sample") || undefined,
    senderName: form.get("senderName") ?? undefined,
    senderEmail: form.get("senderEmail") ?? undefined,
    familyName: form.get("familyName") ?? undefined,
    familyPhone: form.get("familyPhone") ?? undefined,
  });
  if (!fields.success) {
    return error(fields.error.issues[0]?.message ?? "Please check the details you entered.", 400);
  }
  const { sample, ...sender } = fields.data;

  let file: InvoiceFile;
  if (sample) {
    file = await loadSample(sample);
  } else {
    const upload = form.get("invoice");
    if (!(upload instanceof File) || upload.size === 0) return error("Please attach an invoice.", 400);
    if (upload.size > MAX_UPLOAD_BYTES) return error("That file is over 10 MB. Please upload a smaller photo.", 400);
    const data = Buffer.from(await upload.arrayBuffer());
    const mediaType = sniffType(data);
    if (!mediaType) return error("Please upload a JPG, PNG or PDF.", 400);
    file = { data, mediaType };
  }

  try {
    const payment = await createPaymentFromInvoice(file, sender, Boolean(sample) || (await isSampleFile(file.data)));
    return NextResponse.json({ id: payment.id, reference: payment.reference, verdict: payment.verdict });
  } catch (err) {
    if (err instanceof AiError) return error(err.userMessage, 502);
    console.error("[payments] create failed", err);
    return error("Something went wrong while checking your invoice. Please try again.", 500);
  }
}
