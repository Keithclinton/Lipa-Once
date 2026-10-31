import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshSettlement } from "@/lib/settlement";

export const runtime = "nodejs";

// Polled by the receipt page. Also nudges the payment forward with PayPal,
// so the demo never waits on a webhook that can't reach us.
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!/^LM-[A-Z0-9]{5}$/.test(reference)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await refreshSettlement(reference);
  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: { status: true, receiptEn: true },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: payment.status, hasReceipt: Boolean(payment.receiptEn) });
}
