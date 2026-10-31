import { z } from "zod/v4";
import type { Quote } from "../pricing";
import { paypalRequest } from "./client";

export type OrderInput = {
  reference: string;
  description: string;
  quote: Quote;
  returnUrl: string;
  cancelUrl: string;
};

const OrderSchema = z.object({ id: z.string(), status: z.string() }).loose();

// Amounts come from the server-side quote, never from the browser.
export async function createOrder(input: OrderInput): Promise<string> {
  const { quote, reference } = input;
  const usd = (value: string) => ({ currency_code: "USD", value });
  const order = await paypalRequest("POST", "/v2/checkout/orders", OrderSchema, {
    requestId: `order-${reference}-${Date.now()}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: reference,
          custom_id: reference,
          invoice_id: reference,
          description: input.description.slice(0, 127),
          amount: {
            ...usd(quote.totalUsd),
            breakdown: { item_total: usd(quote.totalUsd) },
          },
          items: [
            { name: input.description.slice(0, 127), quantity: "1", unit_amount: usd(quote.feeUsd), category: "DIGITAL_GOODS" },
            { name: "Lipa Moja service fee", quantity: "1", unit_amount: usd(quote.serviceFeeUsd), category: "DIGITAL_GOODS" },
          ],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Lipa Moja",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  return order.id;
}

const CaptureSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    purchase_units: z.array(
      z
        .object({
          payments: z
            .object({ captures: z.array(z.object({ id: z.string(), status: z.string() }).loose()) })
            .loose(),
        })
        .loose(),
    ),
  })
  .loose();

export type CaptureResult = { orderStatus: string; captureId: string; captureStatus: string };

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const result = await paypalRequest("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, CaptureSchema, {
    requestId: `capture-${orderId}`,
    body: {},
  });
  const capture = result.purchase_units[0]?.payments.captures[0];
  if (!capture) throw new Error(`Order ${orderId} captured without a capture record`);
  return { orderStatus: result.status, captureId: capture.id, captureStatus: capture.status };
}
