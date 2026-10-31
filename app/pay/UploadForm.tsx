"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

const STEPS = [
  "Uploading your invoice",
  "Reading every line",
  "Checking the school against our verified registry",
  "Comparing the amount with the usual fees",
  "Preparing your quote",
];

const ACCEPT = "image/png,image/jpeg,application/pdf";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(timer);
  }, [busy]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Please choose a photo or PDF of the invoice.");
      return;
    }
    const form = new FormData(event.currentTarget);
    form.set("invoice", file);
    setBusy(true);
    try {
      const res = await fetch("/api/payments", { method: "POST", body: form });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Something went wrong. Please try again.");
      router.push(`/pay/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <div className="rounded-3xl border border-ink/10 bg-white p-8" role="status" aria-live="polite">
        <p className="font-display text-xl font-semibold">Checking your invoice…</p>
        <ol className="mt-6 space-y-3">
          {STEPS.map((label, i) => (
            <li key={label} className={`flex items-center gap-3 ${i > step ? "text-muted/60" : ""}`}>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  i < step ? "bg-forest text-white" : i === step ? "animate-pulse bg-ochre-soft text-ochre" : "bg-sand"
                }`}
                aria-hidden
              >
                {i < step ? "✓" : i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <label
        htmlFor="invoice"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-forest/30 bg-white px-6 py-10 text-center hover:border-forest focus-within:border-forest"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.files[0];
          if (dropped) setFile(dropped);
        }}
      >
        <span className="font-semibold">{file ? file.name : "Upload the invoice or bill"}</span>
        <span className="text-sm text-muted">
          {file ? "Tap to choose a different file" : "Photo or PDF, up to 10 MB. Make sure the total and payment details are visible."}
        </span>
        <input
          id="invoice"
          name="invoice"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Who should get the receipt? (optional)</legend>
        <Field name="senderName" label="Your name" autoComplete="name" />
        <Field name="senderEmail" label="Your email" type="email" autoComplete="email" />
        <Field name="familyName" label="Family member's name" />
        <Field name="familyPhone" label="Family member's phone" type="tel" placeholder="+254 7…" />
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-block/10 px-4 py-3 text-block">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="w-full rounded-full bg-forest px-6 py-3 font-medium text-white hover:bg-forest-dark sm:w-auto"
      >
        Check this invoice
      </button>
    </form>
  );
}

function Field(props: { name: string; label: string; type?: string; autoComplete?: string; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-base focus:border-forest focus:outline-none"
      />
    </label>
  );
}
