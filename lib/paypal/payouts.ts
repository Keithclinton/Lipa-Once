import { z } from "zod/v4";
import { paypalRequest } from "./client";

export type PayoutInput = {
  reference: string; // used as both sender_batch_id and sender_item_id
  receiver: string; // institution's verified PayPal email
  amountUsd: string; // the bill only, excluding the service fee
  note: string;
};

const CreateSchema = z
  .object({ batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }).loose() })
  .loose();

// PayPal rejects a reused sender_batch_id, so a reference can only ever be paid out once.
export async function createPayout(input: PayoutInput): Promise<{ batchId: string; batchStatus: string }> {
  const res = await paypalRequest("POST", "/v1/payments/payouts", CreateSchema, {
    requestId: `payout-${input.reference}`,
    body: {
      sender_batch_header: {
        sender_batch_id: input.reference,
        email_subject: `Lipa Once payment ${input.reference}`,
        email_message: input.note,
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.receiver,
          amount: { value: input.amountUsd, currency: "USD" },
          note: input.note.slice(0, 4000),
          sender_item_id: input.reference,
        },
      ],
    },
  });
  return { batchId: res.batch_header.payout_batch_id, batchStatus: res.batch_header.batch_status };
}

const BatchSchema = z
  .object({
    batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }).loose(),
    items: z
      .array(
        z
          .object({
            payout_item_id: z.string(),
            transaction_status: z.string().optional(),
            payout_item: z.object({ sender_item_id: z.string().optional() }).loose().optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();

export type PayoutItemStatus = { itemId: string | null; status: string | null; batchStatus: string };

export async function getPayoutStatus(batchId: string): Promise<PayoutItemStatus> {
  const res = await paypalRequest("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`, BatchSchema);
  const item = res.items?.[0];
  return {
    itemId: item?.payout_item_id ?? null,
    status: item?.transaction_status ?? null,
    batchStatus: res.batch_header.batch_status,
  };
}

// transaction_status values that mean the institution will not receive the money.
export const FAILED_ITEM_STATUSES = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED"]);
