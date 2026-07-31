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

// ---------------------------------------------------------------------------
// Admin panel schemas
// ---------------------------------------------------------------------------

/** A product variant as sent from the admin form. Loose on purpose. */
const adminVariantSchema = z
  .object({
    ram: z.string().optional().nullable(),
    rom: z.string().optional().nullable(),
    color: z.string().optional().nullable(),
    price: z.union([z.number(), z.string()]).optional().nullable(),
    image: z.string().optional().nullable(),
    stock: z.union([z.number(), z.string()]).optional().nullable(),
    sku: z.string().optional(),
  })
  .passthrough();

/** Create a product (POST /api/admin/products). */
export const adminProductCreateSchema = z
  .object({
    name: z.string().min(1, "Product name is required"),
    brand: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    in_stock: z.boolean().optional().nullable(),
    images: z.array(z.any()).optional(),
    variants: z.array(adminVariantSchema).optional().default([]),
    // Location the entered stock applies to (defaults to the primary location).
    location_id: z.string().uuid().optional(),
  })
  .passthrough();

/** Update a product (PATCH /api/admin/products/[id]). All fields optional. */
export const adminProductUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    brand: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    in_stock: z.boolean().optional().nullable(),
    images: z.array(z.any()).optional(),
    variants: z.array(adminVariantSchema).optional(),
  })
  .passthrough();

/** Allowed manual payment methods for admin "mark as paid". */
export const PAYMENT_METHODS = [
  'bank_transfer',
  'cash',
  'pos_card',
  'wallet',
  'whatsapp',
  'other',
] as const;

/** Admin "mark as paid" (POST /api/admin/orders/mark-paid). */
export const markPaidSchema = z.object({
  order_ref: z.string().min(1, 'Order reference required'),
  method: z.enum(PAYMENT_METHODS),
  note: z.string().max(500).optional().nullable(),
  send_receipt: z.boolean().optional().default(true),
});

/** Per-location stock update (PATCH /api/admin/stock). */
export const stockUpdateSchema = z.object({
  location_id: z.string().uuid("A valid location is required"),
  updates: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        variant_sku: z.string().min(1),
        quantity: z.number().int().min(0, "Stock cannot be negative"),
      })
    )
    .min(1, "No stock changes provided"),
});
