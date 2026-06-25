import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifyPaystackSignature,
  generateOrderRef,
  koboToNaira,
  nairaToKobo,
} from "@/lib/payments";

// Helper: sign a body exactly the way Paystack does, for the "valid" cases.
const sign = (body: string, secret: string) =>
  crypto.createHmac("sha512", secret).update(body).digest("hex");

describe("verifyPaystackSignature (webhook security)", () => {
  const secret = "sk_test_dummy_secret";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "JS-123-2026" } });

  it("accepts a correctly signed payload", () => {
    const signature = sign(body, secret);
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const signature = sign(body, secret);
    const tampered = body.replace("JS-123-2026", "JS-999-2026");
    expect(verifyPaystackSignature(tampered, signature, secret)).toBe(false);
  });

  it("rejects when signed with the wrong secret (forged signature)", () => {
    const forged = sign(body, "sk_attacker_secret");
    expect(verifyPaystackSignature(body, forged, secret)).toBe(false);
  });

  it("rejects an empty / missing signature header", () => {
    expect(verifyPaystackSignature(body, "", secret)).toBe(false);
  });

  it("is byte-sensitive: re-serialized JSON with different spacing fails", () => {
    const signature = sign(body, secret);
    const reSerialized = JSON.stringify(JSON.parse(body), null, 2); // pretty-printed
    expect(verifyPaystackSignature(reSerialized, signature, secret)).toBe(false);
  });
});

describe("generateOrderRef", () => {
  it("matches the JS-XXXXXX-YEAR format", () => {
    expect(generateOrderRef(new Date("2026-06-22"))).toMatch(/^JS-\d{6}-2026$/);
  });

  it("uses the injected year", () => {
    expect(generateOrderRef(new Date("2030-01-01"))).toMatch(/-2030$/);
  });

  it("uses a 6-digit number in the 100000–999999 range", () => {
    for (let i = 0; i < 200; i++) {
      const middle = Number(generateOrderRef(new Date("2026-01-01")).split("-")[1]);
      expect(middle).toBeGreaterThanOrEqual(100000);
      expect(middle).toBeLessThanOrEqual(999999);
    }
  });

  it("produces (practically) unique refs across calls", () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateOrderRef(new Date("2026-01-01"))));
    // Allow for the rare random collision but expect overwhelmingly unique values.
    expect(refs.size).toBeGreaterThan(490);
  });
});

describe("kobo ↔ naira conversion", () => {
  it("converts kobo to naira (÷100)", () => {
    expect(koboToNaira(150000)).toBe(1500);
    expect(koboToNaira(99)).toBe(0.99);
  });

  it("converts naira to kobo (×100, rounded)", () => {
    expect(nairaToKobo(1500)).toBe(150000);
    expect(nairaToKobo(0.99)).toBe(99);
  });

  it("round-trips without drift on whole naira", () => {
    expect(koboToNaira(nairaToKobo(2499))).toBe(2499);
  });
});
