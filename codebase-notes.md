 # Junior Seas Tech — Codebase Notes (New Developer Walkthrough)

A full tour of the project, written for someone seeing the code for the first time. Big-picture first, then a layer-by-layer walk through the real code.

---

# 1. The 30,000-foot view

A **tech-product e-commerce storefront** (migrated from React to Next.js). Customers browse products, filter them, add to cart/wishlist, and pay with Paystack. Built with:

| Concern | Tool |
|---|---|
| Framework / routing | Next.js 15 (App Router), React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Database + Auth | Supabase (Postgres + auth) |
| Server data fetching | React Query (`@tanstack/react-query`) |
| Payments | Paystack |
| Images | ImageKit (CDN) |
| Email | SendGrid |
| Build/dev | Turbopack |

The single most important idea is the **layered data flow** — it's where new contributors get confused.

---

# 2. Folder structure

```
app/          ← routes (pages) + API endpoints. This is Next.js's "router".
  api/        ← backend HTTP endpoints (route.ts files)
  account/    ← logged-in user area (orders, profile, addresses, admin)
  auth/       ← login + signup
  shop/, category/, brand/, products/, search/  ← browsing
  cart/, checkout/, pay/, payment/, order/       ← buying
context/      ← global React state (Cart, Wishlist, React Query provider)
hooks/        ← React Query hooks (useProducts, useCategories, ...)
services/     ← BROWSER-side data callers (axios → /api)
lib/          ← SERVER-side code: Supabase clients, email, payments
  services/   ← SERVER-side Supabase queries ("use server")
ui/           ← all the React components (Header, Footer, ProductCard, Shop, ...)
public/       ← static assets
```

Two things that trip people up:
- `services/` and `lib/services/` **both exist and sound identical**. They're not. `services/` runs in the browser; `lib/services/` runs on the server. More in §5.
- `ui/` holds your components (not the conventional `components/`), with a nested `ui/components/` for smaller pieces.

---

# 3. The entry point — how a page gets rendered

Every request flows through `app/layout.tsx` (the root layout) — the Next.js equivalent of the old React `App.jsx` + all your providers.

```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <ReactQueryProvider>          {/* server-state caching */}
          <WishlistProvider>          {/* wishlist global state */}
            <CartProvider>            {/* cart global state */}
              <ToastContainer ... />  {/* react-toastify notifications */}
              <Layout>{children}</Layout>  {/* Header / Footer / widgets */}
            </CartProvider>
          </WishlistProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
```

**What to notice:**
- The `metadata` export above it (title, favicon, Open Graph tags) is Next.js's built-in SEO system — replaces `react-helmet`.
- The nesting order is the **provider stack**: anything inside can call `useCart()`, `useWishlist()`, or React Query hooks.
- `{children}` is whatever page matched the URL. Next.js fills it in automatically based on the folder.

`<Layout>` wraps every page with the persistent chrome:

```tsx
// ui/Layout.tsx
const Layout = ({ children }) => (
  <>
    <Header />
    {children}
    <BrandCarousel />
    <ScrollToTop />
    <Footer />
    <BackToTopButton />
    <WhatsAppChatWidget />
    <Toaster ... />   {/* note: this is react-hot-toast, a SECOND toast system */}
  </>
);
```

> ⚠️ You have **two toast libraries** running: `react-toastify` (in `layout.tsx`) and `react-hot-toast` (here). Both work, but when adding notifications, match whatever the surrounding file already imports.

---

# 4. How routing works now (vs. React Router)

In the old React app there was a `<Routes>` file. In Next.js App Router, **the folder structure *is* the routing.** A `page.tsx` inside a folder becomes that URL:

```
app/page.tsx                  → /              (homepage)
app/shop/page.tsx             → /shop
app/cart/page.tsx             → /cart
app/category/[slug]/page.tsx  → /category/phones   ([slug] = dynamic param)
app/products/[id]/page.tsx    → /products/42
app/account/orders/page.tsx   → /account/orders
```

The homepage just composes section components:

```tsx
// app/page.tsx
export default function Home() {
  return (
    <>
      <HeroCarousel />
      <Perks />
      <Highlights />
      <FeedCarousel />
      <GoogleReviews />
    </>
  );
}
```

Many route files are thin wrappers — the real logic lives in `ui/`:

```tsx
// app/shop/page.tsx
const Page = () => <ShopPage />;   // ShopPage is ui/Shop.tsx
```

This is deliberate: **route files stay tiny; the heavy components live in `ui/`.**

---

# 5. The data flow — the heart of the app ⭐

When the Shop page loads products, the request passes through **four layers**. Here is one full round trip.

### Layer 1 — The component asks a hook for data

```tsx
// ui/Shop.tsx  ("use client" — runs in the browser)
const { data, isLoading, isError, refetch } = useProducts(params);
const products = data?.products ?? [];
```

The component doesn't know *how* products are fetched. It calls `useProducts(...)` and gets back `{ data, isLoading, isError }`.

### Layer 2 — The hook (React Query) manages caching

```ts
// hooks/useProducts.ts
export const useProducts = (params: ProductQueryParams) =>
  useQuery({
    queryKey: ['products', params],            // cache key — changes when params change
    queryFn: () => fetchProducts(params),       // the actual fetch
    placeholderData: (prev) => prev,            // keep old data visible while refetching (smooth paging)
    staleTime: 1000 * 60,                        // treat data as fresh for 1 minute
  });
```

React Query replaced manual `useEffect` + `useState` + `fetch`. It caches by `queryKey`, dedupes requests, and gives loading/error states for free. `placeholderData: prev` is why pagination doesn't flicker.

### Layer 3 — The browser-side service makes the HTTP call

```ts
// services/product-service.ts  (BROWSER side)
import axiosInstance from "../lib/axios";

export const fetchProducts = async (params = {}) => {
  const { data } = await axiosInstance.get("/products", { params });
  return data; // { products, total, page, limit, totalPages }
};
```

`axiosInstance` has `baseURL: '/api'`, so `"/products"` actually calls **`/api/products`** — your own backend.

```ts
// lib/axios.ts
const axiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});
```

### Layer 4 — The API route receives it server-side

```ts
// app/api/products/route.ts  (SERVER side)
import { fetchProducts } from '@/lib/services/productService';  // ← note: lib/services, NOT services

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  // ...parse category, search, ram, rom, color, price_min/max, sortBy, sortOrder...

  const { data, count } = await fetchProducts({ page, limit, category, /* ... */ });

  return NextResponse.json({
    products: data,
    total: count ?? 0,
    page, limit,
    totalPages: count ? Math.ceil(count / limit) : 1,
  });
}
```

### Layer 5 — The server data layer talks to Supabase

```ts
// lib/services/productService.ts  ("use server" — talks directly to Postgres)
export const fetchProducts = async (params = {}) => {
  const supabase = await createClient();
  let query = supabase.from("products").select("*");
  if (category) query = query.ilike("category", `%${category}%`);
  if (search)   query = query.ilike("name", `%${search}%`);
  // ...
  const { data: rows } = await query;
  // ...filtering + pagination in JS (see §7)...
  return { data: paginated, count: total };
};
```

### Putting it together

```
ui/Shop.tsx
   └─ useProducts(params)                    [hooks/, React Query cache]
        └─ services/product-service.ts        [browser: axios GET /api/products]
             └─ app/api/products/route.ts      [server: HTTP endpoint]
                  └─ lib/services/productService.ts   [server: Supabase query]
                       └─ Supabase / Postgres
```

> 🔑 The trap: **`services/product-service.ts` and `lib/services/productService.ts` both export `fetchProducts` and both define a `ProductQueryParams` type.** They are completely different functions — one is the browser HTTP caller, the other is the server DB query. Always check which folder you're importing from.

Why the extra hops? Supabase service-role keys and business logic must **never** ship to the browser. The `/api/*` layer is the security boundary: the browser only ever talks to your own API, and only the server touches the database with privileged credentials.

---

# 6. The Shop page in detail (filters, sorting, pagination)

`ui/Shop.tsx` is the most complex client component. The interesting bits:

```tsx
const [page, setPage]   = useState(1);
const [category, setCategory] = useState("");
const [ram, setRam]     = useState("");
const [rom, setRom]     = useState("");
const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
const [sortSelection, setSortSelection] = useState("created_at_desc");
```

**Sort selection → API params** (UI labels mapped to backend fields):

```tsx
const { sortBy, sortOrder } = useMemo(() => {
  if (sortSelection === "price_asc")  return { sortBy: "price", sortOrder: "asc" };
  if (sortSelection === "price_desc") return { sortBy: "price", sortOrder: "desc" };
  return { sortBy: "created_at", sortOrder: "desc" };  // "Newest"
}, [sortSelection]);
```

**Reset to page 1 whenever a filter changes:**

```tsx
useEffect(() => setPage(1), [category, ram, rom, priceRange, sortSelection]);
```

**Price bounds are loaded once on mount** (the slider needs the cheapest/most-expensive product):

```tsx
useEffect(() => {
  const loadPriceBounds = async () => {
    const res = await fetch("/api/products/price-bounds");
    const data = await res.json();
    setPriceBounds({ min: data.minPrice, max: data.maxPrice });
    setPriceRange([data.minPrice, data.maxPrice]);
  };
  loadPriceBounds();
}, []);
```

**A clever optimization** — only send a price filter if the user actually moved the slider off its endpoints:

```tsx
const includePriceFilter = !(
  priceRange[0] === priceBounds.min && priceRange[1] === priceBounds.max
);
if (includePriceFilter) {
  base.price_min = priceRange[0];
  base.price_max = priceRange[1];
}
```

All this state is assembled into a `params` object, passed to `useProducts(params)`, and because `params` is part of the React Query `queryKey`, **changing any filter automatically triggers a refetch.** You never manually call "reload."

The render handles three states cleanly: skeleton placeholders while `isLoading`, a retry button on `isError`, and the product grid + Prev/Next pagination otherwise.

---

# 7. The variants system — your most unusual design decision

Each product row in Supabase has a **JSON `variants` column**: an array of `{ ram, rom, color, price }` objects. One product (a laptop) can have many configurations at different prices.

The consequence: **you can't filter or sort these in SQL**, because they're nested inside JSON. So `lib/services/productService.ts` fetches the matching rows and does the work **in JavaScript**:

```ts
// Filter by variant attributes — keep a product if ANY of its variants match
if (requestedRam || !isNaN(requestedRom) || requestedColor) {
  products = products.filter((p) => {
    const variants = Array.isArray(p?.variants) ? p.variants : [];
    return variants.some((v) => {
      const ramMatches   = requestedRam ? normalizeRam(v?.ram) === requestedRam : true;
      const romMatches   = !isNaN(requestedRom) ? normalizeRom(v?.rom) === requestedRom : true;
      const colorMatches = requestedColor ? normalizeColor(v?.color) === requestedColor : true;
      return ramMatches && romMatches && colorMatches;
    });
  });
}

// Sort by price = sort by the LOWEST variant price
if (sortBy === "price") {
  products.sort((a, b) => {
    const lowest = (p) => Math.min(...p.variants.map((v) => Number(v.price)));
    return sortOrder === "asc" ? lowest(a) - lowest(b) : lowest(b) - lowest(a);
  });
}

// Pagination happens AFTER all filtering
const paginated = products.slice((page - 1) * limit, page * limit);
return { data: paginated, count: products.length };
```

The `normalizeRam/Rom/Color` helpers exist because data entry is messy — `"8 GB"`, `"8gb"`, `"8GB"` should all match, and `"1TB"` needs converting to `1024` GB to compare with `"512GB"`. **Reuse those normalizers** rather than re-inventing the comparison anywhere else.

> Trade-off: because filtering happens in JS *after* fetching, this loads all matching rows into memory each request. Fine at the current catalog size; revisit if the product count ever explodes (the fix would be migrating variants to a proper related table).

`fetchSingleProduct` also defensively re-parses the JSON in case it was ever stored as a string:

```ts
if (typeof product.variants === "string") product.variants = JSON.parse(product.variants);
if (typeof product.images === "string")   product.images   = JSON.parse(product.images);
```

---

# 8. Global state: Cart & Wishlist

Both are React Contexts backed by **`localStorage`** — they work for anonymous (not-logged-in) shoppers, the right default for a store.

```tsx
// context/CartContext.tsx
const STORAGE_KEY = 'cart';

// Load from localStorage on mount
useEffect(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) setCartItems(JSON.parse(stored));
}, []);

// Save back whenever cart changes
useEffect(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
}, [cartItems]);

const totalPrice = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
```

`addToCart` **dedupes by `_id`** — if the item is already in the cart it won't add a duplicate (it returns `false` so the UI knows):

```tsx
const addToCart = (incoming) => {
  let added = false;
  setCartItems(prev => {
    if (prev.find(i => i._id === id)) return prev;  // already there → no-op
    added = true;
    return [...prev, newItem];
  });
  if (added) toast.success(`Added to cart: ${incoming.name}`);
  return added;
};
```

Any component uses it via the hook, which throws if the provider is missing — a nice guard:

```tsx
export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
```

`WishListContext.tsx` is the same shape (`localStorage` key `'wishlist'`). Detail: it has **commented-out server-sync code** (`syncWishlistToServer`, `mergeWishlist`) — a started-but-paused "save wishlist to your account" feature. Those commented blocks are not running.

---

# 9. Supabase — you have FOUR clients, and the difference matters

The most security-sensitive area. Four ways to talk to Supabase; picking the wrong one is how data leaks happen:

```ts
// 1. lib/supabaseServer.ts — SERVICE ROLE, bypasses all security rules. SERVER ONLY.
export const supabaseServer = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // ← god-mode key, never send to browser
);

// 2. lib/services/server.ts — cookie-bound USER session (respects RLS), for server components
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON_KEY, { cookies: {...} });
}

// 3. lib/services/client.ts — USER session in the browser
export function createClient() {
  return createBrowserClient(URL, ANON_KEY);
}

// 4. lib/supabaseClient.ts — plain anonymous client (legacy/simple reads)
export const supabase = createClient(URL, ANON_KEY);
```

Rules of thumb:
- **Privileged operations** (creating orders, marking paid, admin queries) → `supabaseServer` (#1), only inside `app/api/*` route files.
- **"Act as the logged-in user"** in a server component → `lib/services/server.ts` (#2).
- **Never** import `supabaseServer` into anything that runs in the browser — it would expose the service-role key.

> Inconsistency to note: `supabaseServer` reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, while the SSR clients read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. So `.env` must define **both** the public and non-public URL. Same with ImageKit (`lib/imagekit.ts` reads non-public key names while `.env.example` lists the `NEXT_PUBLIC_` ones). Worth reconciling someday, but it works as-is.

---

# 10. Auth & the admin gate

Auth is Supabase Auth. Login/signup live at `app/auth/login` and `app/auth/signup`; the logged-in area is everything under `app/account/` (orders, profile, addresses).

Admin access is a single boolean on the `profiles` table, **checked server-side**:

```ts
// app/api/admin/orders/route.ts
const { data: { user } } = await supabaseServer.auth.getUser();
if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

const { data: profile } = await supabaseServer
  .from('profiles').select('is_admin').eq('id', user.id).single();

if (!profile?.is_admin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

// ...only now fetch all orders...
```

The lesson: admin checks always re-verify `is_admin` on the server. Never gate sensitive data on the frontend alone.

---

# 11. The payment flow (Paystack) — the most critical path

Money flows in **three steps**, with real correctness safeguards.

**Step 1 — Create the order** (`app/api/orders/create/route.ts`):

```ts
function generateOrderRef() {
  return `JS-${Math.floor(100000 + Math.random() * 900000)}-${new Date().getFullYear()}`;
}

const { data: order } = await supabaseServer.from('orders').insert({
  user_id, order_ref, billing, shipping, items,
  amount,                       // ← stored in KOBO (naira × 100)
  currency, payment_status: 'pending',
}).select().single();

// Email is fire-and-forget — wrapped in try/catch so a mail failure NEVER fails the order
try { await sendOrderEmails({ ... }); } catch (e) { console.error('Order email failed:', e); }
```

> 💰 **Amounts are stored in kobo** (smallest naira unit). Everywhere you display or email a total, divide by 100. Paystack requires this — never store naira directly.

**Step 2 — Verify the payment** (`app/api/paystack/verify/route.ts`). After paying, Paystack redirects back here, and you **re-verify against Paystack's own API** (never trust the client to say "I paid"):

```ts
const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
});
const paystackData = await paystackRes.json();
if (paystackData.data.status !== 'success') return redirect('/payment/failed');

// Idempotency guard — if already paid, don't process twice
if (order.payment_status === 'paid') return redirect('/payment/success?ref=...');

await supabaseServer.from('orders').update({
  payment_status: 'paid', paystack_ref: reference,
  payment_method: 'paystack', paid_at: new Date().toISOString(),
}).eq('order_ref', reference);

if (order.user_id) await supabaseServer.from('carts').delete().eq('user_id', order.user_id);
await sendPaymentSuccessEmail({ ... total_amount: order.amount / 100 });
```

The **idempotency guard** (`if already paid, skip`) matters — users refresh, click back, double-submit. It prevents double-charging logic and duplicate emails.

**Step 3 — The webhook** (`app/api/paystack/webhook/route.ts`) is the server-to-server backup, in case the user closes the browser before the redirect. It **verifies the signature** before trusting anything:

```ts
const payload = await req.text();   // ← MUST be raw text, not req.json()
const signature = req.headers.get('x-paystack-signature') || '';
const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
  .update(payload).digest('hex');

if (hash !== signature) return NextResponse.json({ message: 'Invalid signature' }, { status: 400 });
// ...only now mark the order paid...
```

> ⚠️ The webhook reads `req.text()` deliberately. The HMAC signature is computed over the **raw bytes** — if you change it to `req.json()`, re-serialization breaks the signature check and all webhooks fail. Leave it as text.

So **two paths** can mark an order paid (the redirect verify and the webhook), both protected by the idempotency guard so they don't conflict.

---

# 12. Email (SendGrid)

`lib/sendEmail.ts` is the low-level primitive; `SendOrderEmails.ts`, `sendPaymentSuccessEmail.ts`, `sendDeliveryEmail.ts` are typed wrappers around it:

```ts
// lib/sendEmail.ts
sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

export async function sendEmail({ to, subject, text, html }) {
  if (!text && !html) throw new Error('sendEmail requires either text or html');
  await sgMail.send({
    to,
    from: { email: process.env.SENDGRID_SENDER_EMAIL, name: process.env.SENDGRID_SENDER_NAME },
    subject, ...(text && { text }), ...(html && { html }),
  });
}
```

The pattern everywhere: email sends are wrapped in try/catch at the call site so **a failed email never breaks an order or a payment**.

---

# 13. The complete API surface

All backend endpoints (`app/api/*/route.ts`):

| Endpoint | Purpose |
|---|---|
| `products`, `products/[id]`, `products/price-bounds` | catalog + single product + price slider bounds |
| `categories`, `search` | category list, product search |
| `hero-carousel`, `feed-carousel`, `highlights` | homepage content blocks |
| `cart` | server-side cart |
| `orders/create`, `orders/[ref]`, `orders/mark-delivered` | order lifecycle |
| `paystack/init`, `paystack/verify`, `paystack/webhook` | payment lifecycle |
| `account/wishlist`, `account/addresses`, `account/profile` | user data |
| `create-profile` | provisions a `profiles` row after signup |
| `admin/orders` | admin-only order list (gated by `is_admin`) |
| `contact` | contact-form email |

---

# 14. Running it

```bash
npm run dev      # http://localhost:3000, Turbopack hot reload
npm run build    # production build
npm run start    # serve the build
```

You'll need a `.env.local` with: Supabase (both public + service-role keys), Paystack secret key, SendGrid key + sender, ImageKit keys, and `NEXT_PUBLIC_BASE_URL` (used to build redirect URLs in the payment flow).

There's **no test suite and no working lint script** — ESLint packages are installed but there's no config wiring it up, so `npm run lint`/`test` aren't available.

---

# 15. Cookie consent & Google Analytics

Added after launch. The whole thing hinges on **one shared piece of state — `consent`** — that both the banner and the analytics loader watch. Consent is one of three values: `null` (no choice yet), `'accepted'`, or `'rejected'`, and it's persisted in `localStorage` under the key `cookie-consent` (same localStorage-first pattern as Cart/Wishlist).

**The four pieces:**

1. **`context/CookieConsentContext.tsx` — the shared brain.** A React Context that reads the saved choice from `localStorage` on mount and exposes `consent`, plus `accept()` / `reject()` (which write to `localStorage` *and* update state so consumers re-render). A `ready` flag marks "localStorage has been read" so the banner doesn't flash before we know the stored choice.

2. **`ui/components/CookieConsent.tsx` — the banner.** Reads the context; shows itself **only when `consent === null`**. Accept/Reject buttons call `accept()`/`reject()`. It's a **non-blocking** fixed bar at the bottom — users can scroll and browse freely while it's up; it does not dim or lock the page.

3. **`ui/components/GoogleAnalytics.tsx` — the tracker.** Reads the context; renders the gtag `<Script>` tags (via `next/script`) **only when `consent === 'accepted'`**. No consent or rejected → returns `null`, so no GA code or cookies load at all. Uses `NEXT_PUBLIC_GA_MEASUREMENT_ID`.

4. **Wiring.** `<CookieConsentProvider>` wraps the app in `app/layout.tsx` (so both deeper components share the state); `<CookieConsent />` and `<GoogleAnalytics />` are mounted in `ui/Layout.tsx`.

**The flow:**
```
First visit:  consent = null  → banner shows (non-blocking — user can browse), GA off
Click Accept: accept() saves 'accepted' → banner hides, GA scripts mount immediately
Click Reject: reject() saves 'rejected' → banner hides, GA stays off
Return visit: localStorage read → banner stays hidden, GA matches the prior choice
```

> The Cookies **Policy** page (`app/cookies/page.tsx`, `/cookies`) is separate and predates this — the banner just links to it.
>
> To re-test the banner in dev: `localStorage.removeItem('cookie-consent')` in the browser console, then refresh.

---

# 16. Vercel deployment gotcha — "live" ≠ "newest commit"

Learned the hard way while shipping the cookie banner. The banner worked locally and the build for it was green on Vercel, yet it wouldn't show on the live domain. Hours of confusion — the cause was **deployment promotion, not code.**

**The key mental model:**
> Your live domain serves whichever deployment is currently **promoted to Production** — *not* automatically your newest commit.

**What happened:** the banner commit (`2e06d9d`) deployed fine. But afterwards an **older** deployment ("enabled paystack", the commit *before* the banner) got **redeployed**, and that redeploy became the current production deployment — silently rolling the live site back to pre-banner code. The build with the banner still existed and worked when opened directly; the domain just wasn't pointing at it.

**How to spot it in the Deployments list:**
- A normal deploy shows a **commit hash + branch** (e.g. `2e06d9d · nextjs-migration-branch`).
- A rollback shows **"Redeploy of `<id>`"** instead — that means it re-ran an *existing* build, not new code. If that's the top (current) production entry, the live site is running whatever that old build contained.

**Two more red herrings that wasted time** (so future-me doesn't chase them again):
- **`localStorage` is per-origin.** `localhost:3000` and the live domain have *separate* storage, so "works locally, not in prod" can be a stored-choice or a stale-build issue, not a code bug. Read the live value with `localStorage.getItem('cookie-consent')` in the console (`null` = should be showing).
- **Two GitHub remotes exist:** `origin` → `devPromize/junior-seas-next` (where pushes go), `david` → `UjiDavid/junior-seas` (older). Confirm Vercel is connected to the repo you actually push to (Settings → Git → Connected Git Repository).

**The fix / how to recover:** open the *correct* deployment in the Deployments tab → **⋯ → Promote to Production**. To avoid it: only ever **Redeploy from the top (newest) deployment**, and check it shows your latest commit message before confirming. Redeploying anything lower = a silent rollback.

---

# 17. Testing (Vitest)

The project started with **no tests** — everything was checked manually. The first round added **Vitest** (unit/integration) covering the highest-risk logic. There is still **no end-to-end (browser) layer** yet — that's deliberately deferred until the admin-panel / customer-profile work lands.

**Commands:**
```bash
npm test            # run once (vitest run)
npm run test:watch  # re-run on change
npm run test:coverage
```
Config: `vitest.config.ts` (node environment; mirrors the `@/*` → repo-root alias). Tests live in `tests/`.

**The guiding pattern — extract, then test.** Most critical logic was trapped inside `"use server"` modules, API route handlers, or React contexts, which can't be unit-tested in isolation. So the pure logic was lifted into **framework-free modules** (no Supabase / `next/headers` / React / toast), the real code was rewired to import them (**behaviour-preserving — no logic changed**), and the tests target those modules. This means tests exercise the *exact* functions the app runs, not copies that could drift.

**The extracted modules:**
- **`lib/productLogic.ts`** — normalizers (`normalizeRam/Rom/Color`, incl. TB→GB), `filterByVariant`, `filterByPrice`, `sortByPrice`, `paginate`, `getPriceLabel`, `isProductOutOfStock`. Used by `lib/services/productService.ts` and `ui/components/ProductCard.tsx`.
- **`lib/payments.ts`** — `verifyPaystackSignature` (HMAC-SHA512), `generateOrderRef` (`JS-XXXXXX-YEAR`, date injectable), `koboToNaira` / `nairaToKobo`. Used by the Paystack webhook/verify and orders/create routes.
- **`lib/cartLogic.ts`** — `buildCartItem`, `addItemToCart` (dedupe by `_id`), `calculateTotal`, `setItemQuantity`. Used by `context/CartContext.tsx` (which now re-exports `CartItem` from here).

**What's covered (65 tests):**
- *Product logic* — the unusual bits: `1TB === 1024GB`, "all variant attributes must match the same variant", price min/max boundaries, sort without mutation, pagination edges, price-label single-vs-range, empty-variants = out of stock.
- *Payments/security* — webhook signature **accepts valid / rejects tampered body, forged secret, empty header, re-serialized JSON**; order_ref format + uniqueness; kobo↔naira round-trip.
- *Cart* — dedupe refuses duplicate `_id` (numeric vs string treated equal), totals, "quantity ≤ 0 removes the item", no mutation.
- *Verify route idempotency* (`tests/verifyRoute.test.ts`, mocks Supabase/`fetch`/email/`NextResponse`) — an **already-paid** order is not re-updated and sends **no duplicate email**; happy path sends exactly one; failed/no-reference cases redirect to `/payment/failed`.

**Not yet covered / known gaps:**
- **End-to-end (Playwright)** browser journeys — deferred.
- WhatsApp/manual payments have no "mark as paid" path yet (planned with the admin panel). Note: such orders stay `payment_status: 'pending'` — they are **not** marked failed, since the Paystack verify route only runs for actual Paystack redirects.

---

# 18. Search — two paths + a Postgres function

There are **two separate search code paths** — easy to edit the wrong one:
- **Shop / filter page** → `/api/products` → `fetchProducts` in `lib/services/productService.ts` (still a plain `name ILIKE '%term%'`).
- **The `/search` page** (header search box, hero/feed/feature-image links all point here) → `/api/search` (`app/api/search/route.ts`). **This is the real product search.**

**Why "iphone" worked but "iphones" didn't:** `ILIKE '%iphones%'` is a literal substring match — "iPhone 15" contains no `iphones` substring, so it returned nothing. Substring matching has no concept of plurals/word-endings.

**The fix:** the search route now calls a Postgres function via `supabase.rpc('search_products', { q })`. The function uses **full-text search with the English stemmer** (`to_tsvector('english', …) @@ websearch_to_tsquery('english', q)`), so word variants match (`iphones` → `iPhone`) and multi-word queries match regardless of order — **OR** a name/brand `ILIKE` substring fallback so every result the old search returned is still returned (strict superset).

> ⚠️ **The `search_products` function lives in Supabase, not in this repo.** Local and production share the same database, so it's already live for both. But a **fresh/duplicate Supabase project would not have it** — re-run the SQL below there. (An optional `gin` index on the same `to_tsvector(...)` expression speeds it up for large catalogs.)

```sql
create or replace function search_products(q text)
returns setof products
language sql
stable
as $$
  select *
  from products
  where
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))
      @@ websearch_to_tsquery('english', q)
    or name  ilike '%' || q || '%'
    or brand ilike '%' || q || '%'
  limit 50;
$$;
```

If `rpc('search_products')` ever 404s after (re)creating it, reload PostgREST's cache: `notify pgrst, 'reload schema';`.

---

## Mental model to keep

1. **Folders = routes.** A `page.tsx` is a URL; a `route.ts` under `api/` is a backend endpoint.
2. **The browser never touches the database.** It calls `/api/*`; only the server uses Supabase with privileged keys. That's why the data flow has those extra layers.
3. **`services/` = browser callers; `lib/services/` = server queries.** Same-sounding names, opposite sides of the wire.
4. **Money is in kobo, payments are verified server-side and made idempotent.** Never trust the client on payment status.
5. **Cart/wishlist are localStorage-first**, so they work for anonymous shoppers.
