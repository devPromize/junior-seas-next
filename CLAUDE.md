# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Junior Seas Tech — a Next.js 15 (App Router) e-commerce storefront for tech products, with Supabase as the backend, Paystack for payments, ImageKit for image hosting, and SendGrid for transactional email. React 19, TypeScript (strict), Tailwind CSS v4, builds/runs on Turbopack.

## Commands

```bash
npm run dev      # dev server (Turbopack) on http://localhost:3000
npm run build    # production build (Turbopack)
npm run start    # serve the production build
```

There is **no test runner and no `lint` script** configured. ESLint deps and `typescript-eslint` are installed but no flat config file exists at the repo root, so `eslint` is not wired up — do not assume `npm run lint` exists.

The `@/*` path alias maps to the repo root (`tsconfig.json`), e.g. `@/lib/...`, `@/ui/...`.

## Architecture

### Request/data flow (the important part)
The product browsing path is layered and the layers are easy to confuse because two files share the name `ProductQueryParams` and the name `fetchProducts`:

1. **Client component** → calls a React Query hook in `hooks/` (e.g. `useProducts`).
2. **Hook** → calls a thin axios wrapper in `services/` (e.g. `services/product-service.ts`), whose `fetchProducts` hits the **internal API** (`axiosInstance` baseURL is `/api`).
3. **API route** in `app/api/.../route.ts` → calls the **server data layer** in `lib/services/` (e.g. `lib/services/productService.ts`).
4. **`lib/services/*`** are `"use server"` modules that talk to Supabase directly and return the real data.

So: `services/*` = browser-side HTTP callers; `lib/services/*` = server-side Supabase queries. Keep them straight when editing.

### Supabase clients — there are four, pick the right one
- `lib/services/server.ts` `createClient()` — **SSR, cookie-bound user session** (`@supabase/ssr` + `next/headers`). Use in server components / server actions that act *as the logged-in user* (respects RLS).
- `lib/services/client.ts` `createClient()` — browser SSR client, user session in the browser.
- `lib/supabaseServer.ts` `supabaseServer` — **service-role client, bypasses RLS**. Server-only, privileged. Used by API routes for orders, webhooks, admin checks. Never import into client code.
- `lib/supabaseClient.ts` `supabase` — plain anon client (no SSR session handling). Legacy/simple cases.

Note env var inconsistency: `lib/supabaseServer.ts` reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` while the SSR clients read `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both sets must be set.

### Products & variants
Products live in the Supabase `products` table with a JSON `variants` column (each variant has `ram`, `rom`, `color`, `price`) and a JSON `images` column. Because variants are JSON, **filtering by ram/rom/color/price and sorting by price are done in JavaScript in `lib/services/productService.ts` after fetching all matching rows** — only `category`/`search`/`name`/`brand`/`created_at` are pushed to the DB query. Pagination happens *after* the in-memory filtering. `fetchSingleProduct` defensively `JSON.parse`s `variants`/`images` in case they were stored as strings. Normalizers (`normalizeRam/Rom/Color`) handle unit/casing variance (e.g. `TB`→GB conversion) — reuse them rather than re-implementing.

### Cart & wishlist
`context/CartContext.tsx` and `context/WishListContext.tsx` are client React Contexts persisted to `localStorage` (cart key `'cart'`). The cart is anonymous/client-first; a server-side `carts` table exists and is **deleted** for the user after a successful payment. `addToCart` dedupes by `_id` and refuses to add an item that already exists. All three providers plus `ReactQueryProvider` wrap the app in `app/layout.tsx` → `ui/Layout.tsx` (which also injects Header/Footer/toasters/widgets).

### Payments (Paystack)
- **Amounts are stored in kobo** (naira × 100); divide by 100 for display/email.
- Order creation: `app/api/orders/create/route.ts` inserts an order with `payment_status: 'pending'` and a generated `order_ref` (`JS-XXXXXX-YEAR`).
- Verification: `app/api/paystack/verify/route.ts` (GET, redirect-based) re-verifies against `api.paystack.co`, has an **idempotency guard** on `payment_status === 'paid'`, marks paid, clears the server cart, sends the success email.
- Webhook: `app/api/paystack/webhook/route.ts` validates the `x-paystack-signature` HMAC-SHA512 against `PAYSTACK_SECRET_KEY` over the **raw request body** before trusting the event — keep using `req.text()` (not `req.json()`) so the signature check stays valid.

### Email (SendGrid)
`lib/sendEmail.ts` is the low-level sender; `lib/SendOrderEmails.ts`, `lib/sendPaymentSuccessEmail.ts`, `lib/sendDeliveryEmail.ts` are the typed wrappers called from API routes. Email sends are wrapped in try/catch so a mail failure never fails the order.

### Admin
Admin authorization = `profiles.is_admin` boolean checked server-side (see `app/api/admin/orders/route.ts`). Gate any admin functionality behind this lookup, not just session presence.

### Toasts
Two toast systems coexist: `react-toastify` (`<ToastContainer>` in `app/layout.tsx`, used by CartContext) and `react-hot-toast` (`<Toaster>` in `ui/Layout.tsx`). Match whichever the surrounding code already uses.

## Conventions & gotchas
- Images: only `ik.imagekit.io` is whitelisted in `next.config.ts` for `next/image`. New remote image hosts must be added there.
- The codebase carries a lot of **commented-out alternative implementations** in route/service files. Treat the uncommented version as live; don't revive commented blocks without reason.
- TypeScript is `strict`, but server data from Supabase is frequently typed `any` and narrowed manually — follow the existing defensive-parsing style rather than trusting shapes.
