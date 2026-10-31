import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { type Extraction, ExtractionSchema, normaliseExtraction } from "../extraction";
import { AiError, FALLBACK_BETA, MODEL, anthropic, logCall } from "./client";

export type InvoiceFile = {
  data: Buffer;
  mediaType: "image/png" | "image/jpeg" | "application/pdf";
};

const SYSTEM = `You read Kenyan school fee invoices and hospital bills for a payments service.
Money will be sent to whatever institution and payment details you report, so accuracy matters more than completeness.

Rules:
- Extract only what is printed on the document. Never guess, infer or fill in a value that is not visible.
- If a field is missing or unreadable, use null (or an empty list). Do not invent placeholders.
- Copy paybill numbers, account numbers and admission numbers digit for digit.
- Amounts are Kenyan shillings as whole numbers, without currency symbols or separators.
- Normalise the school term to "YYYY-T1", "YYYY-T2" or "YYYY-T3" (e.g. "Term 3, 2026" -> "2026-T3").
- level is the class (e.g. "Form 3") for schools, or the service (e.g. "Inpatient") for hospitals.
- If the document is not a school fee invoice or hospital bill, set documentType to "OTHER".
- confidence is your overall confidence (0 to 1) that every extracted value is correct. Lower it for blur, glare, stains, cropping or handwriting.
- List every legibility problem you notice in legibilityIssues, e.g. "total partially obscured by a stain".`;

function fileBlock(file: InvoiceFile): Anthropic.Beta.BetaContentBlockParam {
  const data = file.data.toString("base64");
  return file.mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: file.mediaType, data } };
}

async function callOnce(file: InvoiceFile): Promise<Extraction | null> {
  const startedAt = Date.now();
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [fileBlock(file), { type: "text", text: "Extract the details of this bill." }],
      },
    ],
  });
  logCall("extract", response.model, startedAt, response.usage);

  if (response.stop_reason === "refusal") {
    throw new AiError("We couldn't read this document. Please upload a photo of the fee invoice or bill.");
  }
  return response.parsed_output ?? null;
}

// Reads an invoice with the vision model. Retries once if the output fails
// validation; any other failure surfaces as an AiError and never approves.
export async function extractInvoice(file: InvoiceFile): Promise<Extraction> {
  try {
    const first = await callOnce(file);
    const result = first ?? (await callOnce(file));
    if (!result) {
      throw new AiError("We couldn't read the details on this invoice. Please try a clearer photo.");
    }
    return normaliseExtraction(result);
  } catch (err) {
    if (err instanceof AiError) throw err;
    console.error("[ai] extract failed", err);
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AiError("Invoice reading is not configured on this server.", { cause: err });
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AiError("We're busy reading other invoices. Please try again in a minute.", { cause: err });
    }
    throw new AiError("We couldn't read this invoice right now. Please try again.", { cause: err });
  }
}
