import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  type WebhookEvent,
  WebhookEventSchema,
  captureFromEvent,
  payoutItemFromEvent,
  verifyWebhook,
} from "@/lib/paypal/webhooks";
import { recordPayoutResult, sendPayout } from "@/lib/settlement";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const event = WebhookEventSchema.safeParse(raw);
  if (!event.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  let verified = false;
  try {
    verified = await verifyWebhook(request.headers, raw);
  } catch (err) {
    console.error("[webhook] verification call failed", err);
    return NextResponse.json({ error: "Verification unavailable" }, { status: 503 }); // PayPal retries
  }
  if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  // De-duplicate redeliveries by PayPal event id.
  const seen = await prisma.webhookEvent.findUnique({ where: { id: event.data.id } });
  if (seen) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await handle(event.data);
    await prisma.webhookEvent.create({ data: { id: event.data.id, type: event.data.event_type } });
  } catch (err) {
    console.error(`[webhook] ${event.data.event_type} failed`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // PayPal retries
  }
  return NextResponse.json({ ok: true });
}

async function handle(event: WebhookEvent) {
  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const capture = captureFromEvent(event);
      if (!capture.success || !capture.data.custom_id) return;
      const payment = await prisma.payment.findUnique({ where: { reference: capture.data.custom_id } });
      if (!payment) return;
      // A capture that was PENDING in the browser flow completes here.
      await prisma.payment.updateMany({
        where: { id: payment.id, status: { in: ["VERIFIED", "PAID"] } },
        data: { status: "PAID", paypalCaptureId: capture.data.id },
      });
      await sendPayout(payment.id); // no-op if a payout was already claimed
      return;
    }
    case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED":
    case "PAYMENT.PAYOUTS-ITEM.FAILED":
    case "PAYMENT.PAYOUTS-ITEM.RETURNED":
    case "PAYMENT.PAYOUTS-ITEM.BLOCKED":
    case "PAYMENT.PAYOUTS-ITEM.DENIED":
    case "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": {
      const item = payoutItemFromEvent(event);
      const reference = item.success ? item.data.payout_item?.sender_item_id : undefined;
      if (!item.success || !reference) return;
      const status =
        event.event_type === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" ? "SUCCESS" : (item.data.transaction_status ?? null);
      await recordPayoutResult(reference, status, item.data.payout_item_id);
      return;
    }
    default:
      return;
  }
}
