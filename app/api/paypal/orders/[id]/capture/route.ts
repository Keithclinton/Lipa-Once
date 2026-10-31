import { NextResponse } from "next/server";
import { PayPalError } from "@/lib/paypal/client";
import { CheckoutError, completeCheckout } from "@/lib/settlement";

export const runtime = "nodejs";

// Captures an approved order, then starts the payout to the institution.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Z0-9]{5,40}$/.test(id)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  try {
    const payment = await completeCheckout(id);
    return NextResponse.json({ reference: payment.reference, status: payment.status });
  } catch (err) {
    if (err instanceof CheckoutError) return NextResponse.json({ error: err.userMessage }, { status: 409 });
    console.error("[paypal] capture failed", err instanceof PayPalError ? err.issue : err);
    const declined = err instanceof PayPalError && err.issue === "INSTRUMENT_DECLINED";
    return NextResponse.json(
      {
        error: declined
          ? "PayPal declined that payment method. Please try another one."
          : "We couldn't complete the payment. You haven't been charged.",
        retry: declined,
      },
      { status: 502 },
    );
  }
}
