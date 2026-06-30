// lib/validation.ts
//
// Zod schemas for validating untrusted input at the API boundary. This is
// hygiene/abuse-prevention (length caps, shape, valid email, positive amounts)
// — the core injection/XSS protection already comes from React escaping and
// Supabase's parameterized queries. Schemas are intentionally permissive about
// EXTRA fields so they don't reject legitimate clients; they only enforce the
// fields the routes actually rely on.

import { z } from "zod";

/** Search query: trimmed, capped to a sane length to prevent abuse. */
export const searchQuerySchema = z
  .string()
  .trim()
  .max(100, "Search query is too long");

/** A single cart/order line item — kept loose, just the essentials. */
const orderItemSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    quantity: z.number().int().positive().optional(),
  })
  .passthrough(); // allow the extra variant/meta fields the cart carries

/** Order creation payload (POST /api/orders/create). */
export const createOrderSchema = z
  .object({
    billing: z
      .object({
        email: z.string().email("A valid billing email is required"),
        full_name: z.string().optional(),
        name: z.string().optional(),
      })
      .passthrough(),
    shipping: z.object({}).passthrough(),
    items: z.array(orderItemSchema).min(1, "Order must contain at least one item"),
    // amount is in kobo — must be a positive, sensible integer.
    amount: z.number().int().positive("Amount must be a positive number"),
    currency: z.string().min(1).max(10).optional(),
    user_id: z.string().optional().nullable(),
  })
  .passthrough();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
