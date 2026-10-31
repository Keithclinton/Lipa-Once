"use client";

import { useState } from "react";

type Props = {
  paymentId: string;
  verdict: string;
  totalUsd: string;
};

export function PayPanel({ verdict, totalUsd }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (verdict === "BLOCK") {
    return (
      <p className="rounded-2xl bg-block/10 px-4 py-3 text-block">
        Payment is disabled for this invoice. Ask the school for a corrected invoice, or contact their bursar
        directly.
      </p>
    );
  }

  const canPay = verdict === "APPROVE" || acknowledged;

  return (
    <div className="space-y-4">
      {verdict === "FLAG" && (
        <label className="flex items-start gap-3 rounded-2xl bg-ochre-soft/60 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-forest"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>I&rsquo;ve reviewed the warnings and want to pay this invoice.</span>
        </label>
      )}
      <button
        type="button"
        disabled={!canPay}
        className="w-full rounded-full bg-forest px-6 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Pay ${totalUsd} with PayPal
      </button>
    </div>
  );
}
