import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InvoiceFile } from "./ai/extract";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<InvoiceFile["mediaType"], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
};

export const SAMPLE_INVOICES = ["genuine", "doctored", "blurry", "duplicate"] as const;
export type SampleInvoice = (typeof SAMPLE_INVOICES)[number];

export function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? "uploads");
}

export function isAcceptedType(type: string): type is InvoiceFile["mediaType"] {
  return type in EXTENSIONS;
}

// Detect the real type from the file's first bytes; the browser's claim isn't trusted.
export function sniffType(data: Buffer): InvoiceFile["mediaType"] | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

// Returns the stored file's name, relative to the upload directory.
export async function saveUpload(file: InvoiceFile): Promise<string> {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${EXTENSIONS[file.mediaType]}`;
  await writeFile(path.join(dir, name), file.data);
  return name;
}

export async function loadSample(sample: SampleInvoice): Promise<InvoiceFile> {
  const data = await readFile(path.join(process.cwd(), "public", "samples", `${sample}-invoice.png`));
  return { data, mediaType: "image/png" };
}
