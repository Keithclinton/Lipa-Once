"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Polls while the payout is in flight and refreshes the page when it moves on.
export function StatusPoller({ reference, status, hasReceipt }: { reference: string; status: string; hasReceipt: boolean }) {
  const router = useRouter();
  const active = status === "PAID" || status === "PAYOUT_PENDING" || (status === "SETTLED" && !hasReceipt);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/receipts/${reference}`, { cache: "no-store" });
        const body = (await res.json()) as { status?: string; hasReceipt?: boolean };
        if (!stopped && (body.status !== status || body.hasReceipt !== hasReceipt)) router.refresh();
      } catch {
        // Keep polling; the next tick may succeed.
      }
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, reference, status, hasReceipt, router]);

  return null;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-full border border-forest/30 px-4 py-2 text-sm font-medium text-forest hover:bg-sand"
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
