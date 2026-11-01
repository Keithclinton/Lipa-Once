"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  paymentId: string;
  verdict: string;
  totalUsd: string;
};

const SDK_URL =
  process.env.NEXT_PUBLIC_PAYPAL_ENV === "live"
    ? "https://www.paypal.com/web-sdk/v6/core"
    : "https://www.sandbox.paypal.com/web-sdk/v6/core";

let sdkPromise: Promise<PayPalV6.Namespace> | null = null;

function loadSdk(): Promise<PayPalV6.Namespace> {
  sdkPromise ??= new Promise((resolve, reject) => {
    if (window.paypal) return resolve(window.paypal);
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK missing")));
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Couldn't load PayPal"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

type Phase = "loading" | "ready" | "unavailable" | "paying" | "capturing";

export function PayPanel({ paymentId, verdict, totalUsd }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<PayPalV6.OneTimePaymentSession | null>(null);
  const acknowledgedRef = useRef(false);
  acknowledgedRef.current = acknowledged;

  const blocked = verdict === "BLOCK";
  const canPay = verdict === "APPROVE" || acknowledged;

  useEffect(() => {
    if (blocked) return;
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) {
      setPhase("unavailable");
      return;
    }
    let cancelled = false;

    async function capture(orderId: string) {
      setPhase("capturing");
      const res = await fetch(`/api/paypal/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST" });
      const body = (await res.json()) as { reference?: string; error?: string };
      if (!res.ok || !body.reference) {
        setError(body.error ?? "We couldn't complete the payment. You haven't been charged.");
        setPhase("ready");
        return;
      }
      // A full navigation: the client router is unreliable inside the PayPal callback.
      window.location.assign(`/r/${body.reference}`);
    }

    (async () => {
      try {
        const paypal = await loadSdk();
        const sdk = await paypal.createInstance({ clientId, components: ["paypal-payments"], pageType: "checkout" });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (cancelled) return;
        if (!methods.isEligible("paypal")) {
          setPhase("unavailable");
          return;
        }
        sessionRef.current = sdk.createPayPalOneTimePaymentSession({
          onApprove: ({ orderId }) => capture(orderId),
          onCancel: () => setPhase("ready"),
          onError: (err) => {
            console.error("PayPal error", err);
            setError("PayPal ran into a problem. You haven't been charged. Please try again.");
            setPhase("ready");
          },
        });
        setPhase("ready");
      } catch (err) {
        console.error(err);
        if (!cancelled) setPhase("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blocked]);

  async function createOrder(): Promise<{ orderId: string }> {
    const res = await fetch("/api/paypal/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, acknowledgedWarnings: acknowledgedRef.current }),
    });
    const body = (await res.json()) as { orderId?: string; error?: string };
    if (!res.ok || !body.orderId) {
      setError(body.error ?? "We couldn't start PayPal checkout. Please try again.");
      setPhase("ready");
      throw new Error(body.error ?? "order failed");
    }
    return { orderId: body.orderId };
  }

  function onPayClick() {
    const session = sessionRef.current;
    if (!session || !canPay || phase !== "ready") return;
    setError(null);
    setPhase("paying");
    // start() must run inside the click handler so the PayPal window isn't blocked.
    session.start({ presentationMode: "auto" }, createOrder()).catch((err: unknown) => {
      console.error(err);
      setPhase("ready");
    });
  }

  if (blocked) {
    return (
      <p className="rounded-2xl bg-block/10 px-4 py-3 text-block">
        Payment is disabled for this invoice. Ask the school for a corrected invoice, or contact their bursar
        directly.
      </p>
    );
  }

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

      {phase === "unavailable" ? (
        <p className="rounded-2xl bg-sand px-4 py-3 text-sm">
          PayPal checkout isn&rsquo;t available right now. Please try again later.
        </p>
      ) : phase === "capturing" ? (
        <p className="rounded-2xl bg-approve/10 px-4 py-3 text-approve" role="status">
          Payment approved. Sending ${totalUsd} to the institution…
        </p>
      ) : (
        <div
          className={canPay && phase === "ready" ? "" : "pointer-events-none opacity-40"}
          aria-disabled={!canPay || phase !== "ready"}
        >
          {phase === "loading" && <p className="text-center text-sm text-muted">Loading PayPal…</p>}
          <paypal-button
            type="pay"
            class="paypal-gold"
            hidden={phase === "loading"}
            onClick={onPayClick}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPayClick();
              }
            }}
            tabIndex={canPay ? 0 : -1}
            role="button"
            aria-label={`Pay $${totalUsd} with PayPal`}
          />
        </div>
      )}

      {verdict === "FLAG" && !acknowledged && phase === "ready" && (
        <p className="text-center text-xs text-muted">Tick the box above to enable payment.</p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-block/10 px-4 py-3 text-sm text-block">
          {error}
        </p>
      )}
    </div>
  );
}
