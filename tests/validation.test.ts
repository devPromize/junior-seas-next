import { describe, it, expect } from "vitest";
import { searchQuerySchema, createOrderSchema } from "@/lib/validation";

describe("searchQuerySchema", () => {
  it("trims whitespace", () => {
    expect(searchQuerySchema.parse("  iphone  ")).toBe("iphone");
  });

  it("accepts a normal query", () => {
    expect(searchQuerySchema.safeParse("iphone 15 pro").success).toBe(true);
  });

  it("accepts an empty string (route treats it as 'no results')", () => {
    expect(searchQuerySchema.safeParse("").success).toBe(true);
  });

  it("rejects an over-long query (abuse guard)", () => {
    expect(searchQuerySchema.safeParse("x".repeat(101)).success).toBe(false);
  });

  it("does not execute or alter injected markup — it's just a capped string", () => {
    const evil = "<script>alert(1)</script>";
    expect(searchQuerySchema.parse(evil)).toBe(evil); // preserved as plain text, never run
  });
});

describe("createOrderSchema", () => {
  const validOrder = {
    billing: { email: "buyer@example.com", full_name: "A Buyer" },
    shipping: { address: "1 Main St" },
    items: [{ name: "iPhone", price: 150000, quantity: 1, variantId: "v1" }],
    amount: 150000, // kobo
    currency: "NGN",
    user_id: "user-1",
  };

  it("accepts a well-formed order", () => {
    expect(createOrderSchema.safeParse(validOrder).success).toBe(true);
  });

  it("keeps extra/unknown fields on nested objects (passthrough)", () => {
    const parsed = createOrderSchema.parse(validOrder);
    expect((parsed.items[0] as any).variantId).toBe("v1");
  });

  it("rejects a missing/invalid billing email", () => {
    expect(
      createOrderSchema.safeParse({ ...validOrder, billing: { email: "not-an-email" } }).success
    ).toBe(false);
  });

  it("rejects an empty items array", () => {
    expect(createOrderSchema.safeParse({ ...validOrder, items: [] }).success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(createOrderSchema.safeParse({ ...validOrder, amount: 0 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...validOrder, amount: -500 }).success).toBe(false);
  });

  it("rejects a non-integer (kobo) amount", () => {
    expect(createOrderSchema.safeParse({ ...validOrder, amount: 150000.5 }).success).toBe(false);
  });

  it("rejects a missing billing object entirely", () => {
    const { billing, ...noBilling } = validOrder;
    expect(createOrderSchema.safeParse(noBilling).success).toBe(false);
  });

  it("allows an optional/absent user_id (guest checkout)", () => {
    const { user_id, ...guest } = validOrder;
    expect(createOrderSchema.safeParse(guest).success).toBe(true);
  });
});
