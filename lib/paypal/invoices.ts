import { z } from "zod/v4";
import { paypalRequest } from "./client";

export type InvoiceInput = {
  reference: string; // becomes the PayPal invoice number
  businessName: string;
  recipientEmail: string;
  recipientName: string | null;
  itemName: string;
  itemDescription: string;
  billUsd: string; // paid out to the institution
  serviceFeeUsd: string;
  note: string;
};

const InvoiceSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    detail: z
      .object({
        invoice_number: z.string().optional(),
        metadata: z.object({ recipient_view_url: z.string().optional() }).loose().optional(),
      })
      .loose()
      .optional(),
    payments: z
      .object({ transactions: z.array(z.object({ payment_id: z.string().optional() }).loose()).optional() })
      .loose()
      .optional(),
  })
  .loose();

const LinkSchema = z.object({ href: z.string().optional(), rel: z.string().optional() }).loose();

export type InvoiceStatus = { id: string; status: string; payUrl: string | null; paymentId: string | null };

function toStatus(inv: z.infer<typeof InvoiceSchema>): InvoiceStatus {
  return {
    id: inv.id,
    status: inv.status,
    payUrl: inv.detail?.metadata?.recipient_view_url ?? null,
    paymentId: inv.payments?.transactions?.[0]?.payment_id ?? null,
  };
}

// Creates a draft invoice and emails it to the payer. In the sandbox no real
// email goes out; the returned payUrl opens PayPal's hosted invoice page.
export async function createAndSendInvoice(input: InvoiceInput): Promise<InvoiceStatus> {
  const usd = (value: string) => ({ currency_code: "USD", value });
  const [given, ...rest] = (input.recipientName ?? "").trim().split(/\s+/);
  const draft = await paypalRequest("POST", "/v2/invoicing/invoices", InvoiceSchema, {
    requestId: `invoice-${input.reference}`,
    headers: { Prefer: "return=representation" },
    body: {
      detail: {
        invoice_number: input.reference,
        reference: input.reference,
        currency_code: "USD",
        note: input.note.slice(0, 4000),
        payment_term: { term_type: "NET_10" },
      },
      invoicer: { business_name: input.businessName.slice(0, 300) },
      primary_recipients: [
        {
          billing_info: {
            email_address: input.recipientEmail,
            ...(given ? { name: { given_name: given, surname: rest.join(" ") || undefined } } : {}),
          },
        },
      ],
      items: [
        {
          name: input.itemName.slice(0, 200),
          description: input.itemDescription.slice(0, 1000),
          quantity: "1",
          unit_amount: usd(input.billUsd),
          unit_of_measure: "AMOUNT",
        },
        { name: "Lipa Moja service fee", quantity: "1", unit_amount: usd(input.serviceFeeUsd), unit_of_measure: "AMOUNT" },
      ],
      configuration: { allow_tip: false, tax_calculated_after_discount: false },
    },
  });

  const sent = await paypalRequest("POST", `/v2/invoicing/invoices/${encodeURIComponent(draft.id)}/send`, LinkSchema, {
    requestId: `invoice-send-${input.reference}`,
    body: { send_to_recipient: true, send_to_invoicer: false, subject: `School fees: ${input.itemName}`.slice(0, 4000) },
  });
  const status = await getInvoice(draft.id);
  return { ...status, payUrl: status.payUrl ?? sent.href ?? null };
}

export async function getInvoice(invoiceId: string): Promise<InvoiceStatus> {
  return toStatus(await paypalRequest("GET", `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`, InvoiceSchema));
}

export const PAID_INVOICE_STATUSES = new Set(["PAID", "MARKED_AS_PAID"]);
