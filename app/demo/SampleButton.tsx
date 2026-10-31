"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SampleButton({ sample, label }: { sample: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("sample", sample);
    form.set("senderName", "Wanjiru");
    form.set("familyName", "Mama Achieng");
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

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="w-full rounded-full bg-forest px-4 py-2.5 font-medium text-white hover:bg-forest-dark disabled:opacity-60"
      >
        {busy ? "Checking… (about 20 seconds)" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-block">
          {error}
        </p>
      )}
    </div>
  );
}
