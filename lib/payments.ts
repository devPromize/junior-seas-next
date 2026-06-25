// lib/payments.ts
//
// Pure payment helpers — framework-free, no Supabase, no NextResponse.
// Extracted from the Paystack routes so the security-critical signature check
// and the kobo↔naira money math have one tested source of truth.

import crypto from "crypto";

/**
 * Verify a Paystack webhook signature.
 * Recomputes HMAC-SHA512 of the *raw* request body with the secret key and
 * compares it to the `x-paystack-signature` header. Returns true only on match.
 *
 * NOTE: must be given the raw body string exactly as received — re-serializing
 * parsed JSON would change bytes and break the comparison.
 */
export const verifyPaystackSignature = (
  rawBody: string,
  signature: string,
  secret: string
): boolean => {
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
};

/**
 * Generate an order reference like "JS-481923-2026".
 * The date is injectable so tests can assert the year deterministically.
 */
export const generateOrderRef = (date: Date = new Date()): string =>
  `JS-${Math.floor(100000 + Math.random() * 900000)}-${date.getFullYear()}`;

/** Paystack stores amounts in kobo (naira × 100). Convert kobo → naira for display/email. */
export const koboToNaira = (kobo: number): number => kobo / 100;

/** Convert naira → kobo for sending amounts to Paystack. */
export const nairaToKobo = (naira: number): number => Math.round(naira * 100);
