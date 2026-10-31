import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { PayPalError } from "@/lib/paypal/client";
import { CheckoutError, startCheckout } from "@/lib/settlement";

export const runtime = "nodejs";

const BodySchema = z.object({ paymentId: z.string().min(1).max(40), acknowledgedWarnings: z.boolean().default(false) });

// Creates the PayPal order. The amount comes from the stored payment, never the client.
export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const orderId = await startCheckout(body.data.paymentId, body.data.acknowledgedWarnings);
    return NextResponse.json({ orderId });
  } catch (err) {
    if (err instanceof CheckoutError) return NextResponse.json({ error: err.userMessage }, { status: 409 });
    console.error("[paypal] create order failed", err instanceof PayPalError ? err.issue : err);
    return NextResponse.json({ error: "We couldn't start PayPal checkout. Please try again." }, { status: 502 });
  }
}
