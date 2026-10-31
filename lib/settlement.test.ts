import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./paypal/orders", () => ({
  createOrder: vi.fn(async () => "ORDER123"),
  captureOrder: vi.fn(async () => ({ orderStatus: "COMPLETED", captureId: "CAP1", captureStatus: "COMPLETED" })),
}));
vi.mock("./paypal/payouts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./paypal/payouts")>()),
  createPayout: vi.fn(async () => ({ batchId: "BATCH1", batchStatus: "PENDING" })),
  getPayoutStatus: vi.fn(async () => ({ itemId: "ITEM1", status: "SUCCESS", batchStatus: "SUCCESS" })),
}));
vi.mock("./ai/receipt", () => ({
  generateReceipt: vi.fn(async () => ({ en: "Paid. Ref LM-TEST1.", sw: "Imelipwa. Kumbukumbu LM-TEST1." })),
}));

const { prisma } = await import("./db");
const { createOrder, captureOrder } = await import("./paypal/orders");
const { createPayout, getPayoutStatus } = await import("./paypal/payouts");
const { generateReceipt } = await import("./ai/receipt");
const settlement = await import("./settlement");

let paymentId = "";

async function seedPayment(overrides: { verdict?: string; status?: string } = {}) {
  await prisma.payment.deleteMany();
  await prisma.feeSchedule.deleteMany();
  await prisma.institution.deleteMany();
  const inst = await prisma.institution.create({
    data: {
      slug: "test-school",
      name: "Test Girls School, Eldoret",
      type: "SCHOOL",
      county: "Uasin Gishu",
      paypalEmail: "school@business.example.com",
    },
  });
  const p = await prisma.payment.create({
    data: {
      reference: "LM-TEST1",
      institutionId: inst.id,
      beneficiaryName: "Achieng Otieno",
      beneficiaryRef: "4521",
      level: "Form 3",
      term: "2026-T3",
      amountKes: 20_300,
      amountUsd: "161.79",
      fxRate: "129",
      verdict: overrides.verdict ?? "APPROVE",
      verdictReasons: [],
      extraction: {},
      invoiceImagePath: "test.png",
      status: overrides.status ?? "VERIFIED",
    },
  });
  paymentId = p.id;
}

const current = () => prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

beforeEach(async () => {
  vi.clearAllMocks();
  await seedPayment();
});

describe("startCheckout", () => {
  it("creates an order for the server-side amount", async () => {
    await expect(settlement.startCheckout(paymentId, false)).resolves.toBe("ORDER123");
    expect(vi.mocked(createOrder).mock.calls[0][0].quote.totalUsd).toBe("161.79");
    expect((await current()).paypalOrderId).toBe("ORDER123");
  });

  it("refuses blocked bills and unacknowledged warnings", async () => {
    await seedPayment({ verdict: "BLOCK", status: "BLOCKED" });
    await expect(settlement.startCheckout(paymentId, true)).rejects.toThrow(settlement.CheckoutError);
    await seedPayment({ verdict: "FLAG" });
    await expect(settlement.startCheckout(paymentId, false)).rejects.toThrow("reviewed the warnings");
    await expect(settlement.startCheckout(paymentId, true)).resolves.toBe("ORDER123");
    expect(createOrder).toHaveBeenCalledTimes(1);
  });
});

describe("capture and payout", () => {
  it("captures, then pays the bill amount (without the service fee) to the institution", async () => {
    await settlement.startCheckout(paymentId, false);
    const after = await settlement.completeCheckout("ORDER123");
    expect(after.status).toBe("PAYOUT_PENDING");
    expect(after.paypalCaptureId).toBe("CAP1");
    expect(after.payoutBatchId).toBe("BATCH1");
    expect(createPayout).toHaveBeenCalledWith(
      expect.objectContaining({ reference: "LM-TEST1", receiver: "school@business.example.com", amountUsd: "157.36" }),
    );
  });

  it("never pays out twice, even with concurrent callers", async () => {
    await settlement.startCheckout(paymentId, false);
    await settlement.completeCheckout("ORDER123");
    await Promise.all([settlement.sendPayout(paymentId), settlement.sendPayout(paymentId), settlement.completeCheckout("ORDER123")]);
    expect(captureOrder).toHaveBeenCalledTimes(1);
    expect(createPayout).toHaveBeenCalledTimes(1);
  });

  it("hands the payout back for a retry if PayPal fails", async () => {
    vi.mocked(createPayout).mockRejectedValueOnce(new Error("network"));
    await settlement.startCheckout(paymentId, false);
    await settlement.completeCheckout("ORDER123");
    expect((await current()).status).toBe("PAID");

    await settlement.refreshSettlement("LM-TEST1");
    expect((await current()).status).toBe("PAYOUT_PENDING");
    expect(createPayout).toHaveBeenCalledTimes(2); // same sender_batch_id both times
  });
});

describe("settlement", () => {
  beforeEach(async () => {
    await settlement.startCheckout(paymentId, false);
    await settlement.completeCheckout("ORDER123");
  });

  it("settles once and writes the receipt once", async () => {
    await settlement.recordPayoutResult("LM-TEST1", "SUCCESS", "ITEM1");
    await settlement.recordPayoutResult("LM-TEST1", "SUCCESS", "ITEM1");
    const p = await current();
    expect(p.status).toBe("SETTLED");
    expect(p.settledAt).not.toBeNull();
    expect(p.receiptSw).toContain("LM-TEST1");
    expect(generateReceipt).toHaveBeenCalledTimes(1);
  });

  it("marks failed payouts", async () => {
    await settlement.recordPayoutResult("LM-TEST1", "RETURNED", "ITEM1");
    expect((await current()).status).toBe("FAILED");
  });

  it("keeps unclaimed payouts pending", async () => {
    await settlement.recordPayoutResult("LM-TEST1", "UNCLAIMED", "ITEM1");
    const p = await current();
    expect(p.status).toBe("PAYOUT_PENDING");
    expect(p.payoutItemId).toBe("ITEM1");
  });

  it("polls PayPal when webhooks don't arrive", async () => {
    await settlement.refreshSettlement("LM-TEST1");
    expect(getPayoutStatus).toHaveBeenCalledWith("BATCH1");
    expect((await current()).status).toBe("SETTLED");
  });
});
