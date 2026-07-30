import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// The route reads NEXT_PUBLIC_BASE_URL at module-load, so set env BEFORE importing it.
process.env.NEXT_PUBLIC_BASE_URL = "https://shop.test";
process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";

// Shared mock fns (vi.hoisted so the vi.mock factories below can reference them).
const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ single })) }));

  const updateEq = vi.fn(() => Promise.resolve({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
  const del = vi.fn(() => ({ eq: deleteEq }));

  const from = vi.fn(() => ({ select, update, delete: del }));
  const sendPaymentSuccessEmail = vi.fn(() => Promise.resolve());

  return { single, select, update, updateEq, del, deleteEq, from, sendPaymentSuccessEmail };
});

// Replace the real Supabase, the email sender, and NextResponse with controllable fakes.
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: { from: mocks.from } }));
vi.mock("@/lib/sendPaymentSuccessEmail", () => ({
  sendPaymentSuccessEmail: mocks.sendPaymentSuccessEmail,
}));
vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: string) =>
      new Response(null, { status: 307, headers: { location: url } }),
    json: (body: any, init?: ResponseInit) =>
      new Response(JSON.stringify(body), init),
  },
}));

let GET: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ GET } = await import("@/app/api/paystack/verify/route"));
});

const paidOrder = {
  order_ref: "JS-1-2026",
  payment_status: "paid",
  amount: 150000,
  user_id: "user-1",
  billing: { email: "buyer@example.com", full_name: "A Buyer" },
  items: [],
};
const pendingOrder = { ...paidOrder, payment_status: "pending" };

const callVerify = (ref?: string) =>
  GET(
    new Request(
      ref
        ? `https://shop.test/api/paystack/verify?reference=${ref}`
        : `https://shop.test/api/paystack/verify`
    )
  );

beforeEach(() => {
  vi.clearAllMocks();
  // By default, Paystack confirms the transaction succeeded.
  global.fetch = vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ status: true, data: { status: "success" } }),
    })
  ) as any;
});

describe("verify route — idempotency guard", () => {
  it("ALREADY-paid order: does not re-mark paid, still attempts the receipt (deduped downstream), redirects to success", async () => {
    mocks.single.mockResolvedValue({ data: paidOrder, error: null });

    const res = await callVerify("JS-1-2026");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/payment/success");
    expect(mocks.update).not.toHaveBeenCalled(); // DB write stays idempotent
    // The receipt is always attempted; sendPaymentSuccessEmail dedupes via
    // order_emails, so this is safe even when the webhook already sent it.
    expect(mocks.sendPaymentSuccessEmail).toHaveBeenCalledTimes(1);
  });

  it("pending order (first time): marks paid and sends exactly one email", async () => {
    mocks.single.mockResolvedValue({ data: pendingOrder, error: null });

    const res = await callVerify("JS-1-2026");

    expect(res.headers.get("location")).toContain("/payment/success");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.sendPaymentSuccessEmail).toHaveBeenCalledTimes(1);
  });

  it("processed twice (pending, then paid): marks paid only once; receipt dedupe is delegated to sendPaymentSuccessEmail", async () => {
    mocks.single.mockResolvedValueOnce({ data: pendingOrder, error: null });
    await callVerify("JS-1-2026"); // first hit marks paid + attempts receipt
    mocks.single.mockResolvedValueOnce({ data: paidOrder, error: null });
    await callVerify("JS-1-2026"); // second hit: already paid → no re-mark, still attempts receipt

    expect(mocks.update).toHaveBeenCalledTimes(1); // DB marked paid exactly once
    // The single-email guarantee now lives in sendPaymentSuccessEmail's
    // order_emails dedupe (mocked here), so verify's delegated call is counted per hit.
    expect(mocks.sendPaymentSuccessEmail).toHaveBeenCalledTimes(2);
  });
});

describe("verify route — guard rails", () => {
  it("no reference → redirect to /payment/failed, never touches the DB", async () => {
    const res = await callVerify(undefined);
    expect(res.headers.get("location")).toContain("/payment/failed");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("Paystack does not confirm success → redirect to /payment/failed, no email", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ status: true, data: { status: "abandoned" } }),
      })
    ) as any;

    const res = await callVerify("JS-1-2026");
    expect(res.headers.get("location")).toContain("/payment/failed");
    expect(mocks.sendPaymentSuccessEmail).not.toHaveBeenCalled();
  });
});
