import { z } from "zod/v4";
import { paypalRequest } from "./client";

const VerifySchema = z.object({ verification_status: z.string() }).loose();

export const WebhookEventSchema = z
  .object({
    id: z.string(),
    event_type: z.string(),
    resource: z.record(z.string(), z.unknown()),
  })
  .loose();

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// Asks PayPal whether the event really came from PayPal for our webhook.
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("[paypal] PAYPAL_WEBHOOK_ID is not set; rejecting webhook");
    return false;
  }
  const header = (name: string) => headers.get(name) ?? "";
  const res = await paypalRequest("POST", "/v1/notifications/verify-webhook-signature", VerifySchema, {
    body: {
      auth_algo: header("paypal-auth-algo"),
      cert_url: header("paypal-cert-url"),
      transmission_id: header("paypal-transmission-id"),
      transmission_sig: header("paypal-transmission-sig"),
      transmission_time: header("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return res.verification_status === "SUCCESS";
}

const CaptureResourceSchema = z.object({ id: z.string(), custom_id: z.string().optional() }).loose();
const PayoutItemResourceSchema = z
  .object({
    payout_item_id: z.string(),
    payout_batch_id: z.string().optional(),
    transaction_status: z.string().optional(),
    payout_item: z.object({ sender_item_id: z.string().optional() }).loose().optional(),
  })
  .loose();

export function captureFromEvent(event: WebhookEvent) {
  return CaptureResourceSchema.safeParse(event.resource);
}

export function payoutItemFromEvent(event: WebhookEvent) {
  return PayoutItemResourceSchema.safeParse(event.resource);
}

const InvoiceResourceSchema = z
  .object({
    id: z.string().optional(),
    detail: z.object({ invoice_number: z.string().optional() }).loose().optional(),
    payments: z
      .object({ transactions: z.array(z.object({ payment_id: z.string().optional() }).loose()).optional() })
      .loose()
      .optional(),
  })
  .loose();

// INVOICING.INVOICE.PAID wraps the invoice in resource.invoice.
export function invoiceFromEvent(event: WebhookEvent) {
  const resource = event.resource as { invoice?: unknown };
  return InvoiceResourceSchema.safeParse(resource.invoice ?? event.resource);
}
