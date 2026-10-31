import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { formatKes, shortName } from "../format";
import { MODEL, anthropic, fallbackParams, logCall } from "./client";

export type ReceiptFacts = {
  senderName: string | null;
  familyName: string | null;
  beneficiaryName: string;
  beneficiaryRef: string | null;
  level: string | null;
  term: string | null; // "2026-T3"
  amountKes: number;
  institutionName: string;
  institutionType: string; // "SCHOOL" | "HOSPITAL"
  reference: string;
};

const ReceiptSchema = z.object({
  en: z.string().describe("English message, at most 60 words"),
  sw: z.string().describe("Swahili message with the same facts, at most 60 words"),
});

export type Receipt = z.infer<typeof ReceiptSchema>;

const MAX_WORDS = 60;

const SYSTEM = `You write short WhatsApp-style payment confirmations that a Kenyan living abroad forwards to family at home.
Write one message in English and one in Swahili, each at most ${MAX_WORDS} words.
Include who paid, for whom (with the admission or patient number), what it was for, the exact amount in KES, the institution, that it was paid directly to the institution, and the reference.
Use only the facts given; never add numbers or details. Friendly and factual, natural everyday Swahili (not overly formal), at most one emoji, no hashtags.`;

const words = (s: string) => s.trim().split(/\s+/).length;

function termWords(term: string | null, lang: "en" | "sw"): string {
  const m = term ? /^(\d{4})-T([123])$/.exec(term) : null;
  if (!m) return "";
  return lang === "en" ? `Term ${m[2]} ${m[1]}` : `muhula wa ${m[2]} ${m[1]}`;
}

// Used when the model is unavailable, so a settled payment always gets a receipt.
export function templateReceipt(f: ReceiptFacts): Receipt {
  const payer = f.senderName ?? "Your relative";
  const who = f.beneficiaryRef ? `${f.beneficiaryName} (${f.beneficiaryRef})` : f.beneficiaryName;
  const school = shortName(f.institutionName);
  const forEn = [f.level, termWords(f.term, "en")].filter(Boolean).join(", ");
  const forSw = [f.level?.replace("Form", "Kidato"), termWords(f.term, "sw")].filter(Boolean).join(", ");
  const kind = f.institutionType === "HOSPITAL" ? ["hospital bill", "bili ya hospitali"] : ["school fees", "karo"];
  return {
    en: `${payer} has paid ${formatKes(f.amountKes)} ${kind[0]} for ${who}${forEn ? `, ${forEn}` : ""}, directly to ${school}. Ref ${f.reference}.`,
    sw: `${payer} amelipa ${kind[1]} ya ${formatKes(f.amountKes)} kwa ajili ya ${who}${forSw ? `, ${forSw}` : ""}, moja kwa moja kwa ${school}. Kumbukumbu ${f.reference}.`,
  };
}

function isValid(r: Receipt, f: ReceiptFacts): boolean {
  // The reference and amount must survive verbatim; length must fit WhatsApp-style.
  const amount = f.amountKes.toLocaleString("en-KE");
  return [r.en, r.sw].every((m) => words(m) <= MAX_WORDS && m.includes(f.reference) && m.includes(amount));
}

export async function generateReceipt(facts: ReceiptFacts): Promise<Receipt> {
  const startedAt = Date.now();
  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      ...fallbackParams(),
      output_config: { effort: "low", format: betaZodOutputFormat(ReceiptSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ ...facts, amountKes: formatKes(facts.amountKes), term: termWords(facts.term, "en") }),
        },
      ],
    });
    logCall("receipt", response.model, startedAt, response.usage);
    const receipt = response.parsed_output;
    if (receipt && response.stop_reason !== "refusal" && isValid(receipt, facts)) {
      return { en: receipt.en.trim(), sw: receipt.sw.trim() };
    }
    console.warn("[ai] receipt failed validation; using template");
  } catch (err) {
    console.error("[ai] receipt failed; using template", err);
  }
  return templateReceipt(facts);
}
