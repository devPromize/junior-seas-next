# Build Log

A running diary of building our own point-of-sale (POS) system for Junior Seas Tech,
a phones and electronics business in Owerri, Nigeria. One entry per working session:
what was built, what broke and why, what we learned, and the decisions we made.

---

## 2026-10-17 → 2026-10-19 · Session 1: Studying the old system and drawing the plan

**What we did**
- Walked through the POS the shop uses today, screen by screen, to see how the business
  actually runs on it: products, sales, customers, suppliers, stock counts and reports.
- Measured the size of the job: about 4,000 products, roughly 18 months of sales history,
  around 680 customers and 21 staff accounts across three sales floors.
- Drew a full blueprint before writing any code: system architecture, floor layout and
  staff roles, wireframes for every main screen, the data model, stock rules,
  permissions and the build order.

**What we found (the problems worth solving)**
- **Stock that goes below zero.** Around 150 products show negative stock, including
  phones. A phone is a single physical object, so "minus one iPhone" means the records
  and reality have drifted apart.
- **Phones are tracked by IMEI, but the IMEI doesn't control stock.** The old system stores
  each IMEI as a product variation and doesn't stop the same unit being counted twice.
- **Shipments to our smaller store are recorded as sales**, which hides where the stock
  really is and inflates sales figures.
- **Customer details are captured inconsistently**, so we can't reliably tell who bought
  what, or when they're due to come back.

**What we learned**
- Studying the old system before designing ours was the most valuable hour of the
  project. Every rule in the new design traces back to a real problem we saw in the data.
- "Floors" in a shop are really separate stock rooms and tills, but it's still one company
  with one customer, so a customer should get one receipt for everything they buy.

**Decisions** (details in [DECISIONS.md](DECISIONS.md))
- The POS becomes the single source of truth. The website shows only products ticked
  "Show online".
- The POS is deployed separately from the website, so a website problem can't stop sales.
- Online-only to start, with no offline selling (see D-004 for why).
- Each phone is its own record with its IMEI, so a phone can't be sold twice or go below zero.
- Warranty lookup by IMEI is in the first release: customers who lose their receipt can
  still claim.

**Worth showing**
- Screenshot: blueprint sheet A-100 (system architecture) and A-200 (till screen wireframe).
- Screenshot: sheet A-400 (stock rules) with a one-line story about "minus stock".

---

## 2026-10-19 · Session 2: The owner's review of the blueprint (Rev B)

**What we did**
- Went through the blueprint sheet by sheet with the business and rebuilt it as Rev B.
- New sheet: warranty lookup by IMEI (A-206).

**What changed, and why** (decisions D-010 to D-018)
- **The sale flow was wrong.** Rev A had one person selling and taking payment. In reality,
  reps sell and send the sale to the floor's one cashier, who handles the money. We redrew
  the screens around that.
- **Deposits needed real-world logic.** Customers often pay a deposit and don't come back on
  time, so a deposit is now for a model with a time-limited hold, not one particular phone.
- **Transfers to the second shop were being recorded as sales.** They're now "transferred
  out": gone from our stock, never counted as revenue.
- **Counting the whole store isn't realistic yet.** We count phones and a short list of
  high-value items instead.
- **Roles had to be flexible.** Small teams share duties, so the owner can build roles and
  grant single permissions, with a warning on risky ones.

**What we learned**
- A blueprint is cheap to change and code isn't. The biggest correction of the project so
  far (how a sale actually moves between rep and cashier) cost an afternoon instead of a rewrite.
- Write down how things are really done before designing how they should be done. The
  "right" textbook flow didn't match the shop floor.

**Worth showing**
- Side by side: Rev A vs Rev B of sheet A-200. Caption: "the screen I designed vs how the
  shop actually works".
- Screenshot: sheet A-201's deposit life cycle. The "customer pays a deposit and disappears"
  problem is very relatable for small business owners.
- Screenshot: the A-401 warning dialog ("Allow Joy to refund sales?").

---

## 2026-10-19 · Session 3: Getting our data back

**What we built**
- A private holding area in the database (`pos_import`) that the website and public API
  can't reach. Only the server key can write to it, through three small database functions.
- An extraction tool (`tools/legacy-import/extract.mjs`). It opens Chrome, the owner logs in
  by hand (the tool never sees the password), and it then reads the same lists the old
  system's screens load, 500 rows at a time with a pause between requests. Read-only.
- First full copy of our data:

| List | Rows |
|---|---|
| Products | 4,157 |
| Sales | 33,347 |
| Sale line items | 42,585 |
| Sales returns | 504 |
| Purchases / purchase lines | 344 / 2,262 |
| Customers / suppliers | 680 / 62 |
| Stock per floor (one row per product variation, i.e. per phone IMEI) | 11,878 |
| Stock adjustments / expenses / staff | 152 / 3 / 21 |

Every list matched the old system's own total exactly.

**What broke, and how we fixed it** (three small bugs, good post material)
1. *"Invalid supabaseUrl."* **What happened:** the tool crashed before it even opened Chrome.
   **How we found it:** we checked the shape of the setting without printing it, and it was
   91 characters long when an address should be about 40. **Fix:** someone had typed a note
   after the value on the same line. Next.js ignores notes like that, but our quick settings
   reader didn't. It now keeps only the value.
2. *"Invalid API key."* Same cause on the next line, same fix, applied to every setting.
3. *"403 Forbidden" on suppliers and staff.* **What happened:** stock came through but
   suppliers and staff were refused. **How we found it:** those lists had loaded fine in the
   owner's browser earlier, so the difference had to be the account. **Fix:** the tool had
   been logged in with a sales rep's account. Reps can see stock (they need it to sell), but
   not suppliers or staff. Logging in as the owner fixed it. A nice accidental look at how
   permissions work in the old system.

**What we learned**
- The lists behind a web app's screens are often the cleanest way to get your own data out:
  structured, complete, and showing exactly what the screens show.
- The old system's stock report is blocked even for the owner's account, but its sales
  screen still lists every phone's IMEI and quantity. Small finds like that decide whether a
  migration takes a day or a month.

**Worth showing**
- Screenshot: the terminal summary table where every list's "expected" matches "extracted".
- A short screen recording of the tool running, with the progress counter ticking
  through the sales. Blur customer names.

---

## 2026-10-20 · Session 4: Locking down the database, and a day in a sales rep's shoes

**What we did**
- Tightened database permissions (D-022). Logged-out visitors can now only read the shop
  and log searches. Every unused write permission is gone. Tested the live site afterwards.
- Logged into the old system as a sales rep and walked through their screen, read-only.

**What we found**
- **87.9% of 33,347 sales have no customer attached** ("Walk-In Customer"). Only about
  4,000 sales have a phone number. Adding a customer in the old system opens a form with
  over 40 fields, so reps skip it. This is the single biggest reason we're building our own:
  you can't follow up with customers you never recorded.
- **"Don't take payment" was only a verbal rule.** Reps are told to always send sales to the
  cashier, but the system lets them check out. We confirmed it by doing exactly that.
- **"Place order" is a repurposed "suspend sale" button**, so unfinished orders sit forever.
  One rep still had orders from a month ago waiting.
- **Who served the customer is picked from a restaurant "waiter" dropdown.**
- **Every product search waits about 3 seconds on the server.**

**Decisions:** D-022 (closed-by-default permissions) and D-023 (no register for reps; days
close themselves; leftover orders cancelled at midnight).

**What we learned**
- A rule that lives only in people's heads isn't a control. If the screen offers a button,
  someone will press it. Our POS enforces "reps don't take money" in the database.
- The cheapest way to get customer data is to make capturing it the fastest path. One field
  (phone number) beats forty optional ones.

**Worth showing**
- The "87.9% walk-in" number with a one-line hook: "Nearly nine in ten of our sales came
  from customers we couldn't name."
- Screenshot of the 40-field customer form next to our one-field version (once built).

---

## 2026-10-20 · Session 5: The first real POS tables, and moving our catalogue in

**What we built**
- The `pos` database schema: floors, categories, brands, items, one record per physical
  phone, a global IMEI register (no IMEI can ever be on two phones), and the stock ledger.
- The ledger is **append-only**: the database refuses to edit or delete a stock movement,
  even for our own server, so mistakes are fixed with correcting movements and history can't
  be rewritten. Current stock per floor is kept up to date from the ledger automatically.
- Imported the catalogue and opening stock from the old system:

| | Count |
|---|---|
| Items (active products) | 3,879 |
| Phone models / individual phones / IMEIs | 1,281 / 9,290 / 9,289 |
| Phones in stock today | 537 |
| Categories (main / sub) / brands | 47 / 48 / 134 |

- Anything that couldn't move cleanly went onto a review list instead of being dropped:
  178 inactive products still showing stock, 142 items below zero, 84 phones below zero,
  25 phones entered twice, 19 invalid IMEIs, 2 phones counted twice, 1 shared barcode.

**What broke, and how we fixed it**
1. *"invalid input syntax for type numeric: '--'"*. **What happened:** the import stopped on
   the first problem. **How we found it:** the error named the exact value. The old system
   shows "--" as the stock of products with stock tracking switched off. **Fix:** read only the
   number out of text like "375.00 Pieces", and treat anything else as zero.
2. *"column reference 'code' is ambiguous"*. Two tables in the same query both had a column
   called `code`. **Fix:** say which table's `code` we mean.
Both times the whole import rolled back cleanly. Nothing was half-applied, because the
migration runs as a single transaction. That's why we run imports that way.

**What we learned**
- Real business data is messy in small, specific ways: a dash where a number should be,
  two IMEIs glued together for dual-SIM phones, the same phone entered twice. A good import
  doesn't hide this. It writes every oddity down for a human to check.
- The question isn't "how do we stop mistakes" but "how cheap is it to fix one".

**Decisions:** D-024 (corrections, not deletions), D-025 (fix stock at the till), D-026
(inactive products left out).

**Worth showing**
- The review-list counts above. They're a very honest picture of what migrating a real
  business looks like.
- A short clip or screenshot of the database refusing to delete a stock movement
  ("Stock movements cannot be changed or deleted").

---

## 2026-10-20 · Session 6: Staff, customers and sales tables, and a stock confirmation sheet

**What we built**
- The rest of the POS's data foundations: 23 permissions (10 marked sensitive, each with the
  warning the owner sees before granting it), 7 starting roles, staff with per-person
  permission changes, customers (phone first, three separate consents, business fields),
  payment accounts, sales with split payments, returns and an append-only audit log.
- Wholesale prices on every item, optional, plus the permissions to set them and sell at them.
- Laptops and tablets now carry serial numbers, not IMEIs. That's why 6 laptops "failed" the
  IMEI check during the import.
- A printable stock confirmation workbook, one tab per floor, for staff to check while we're
  still on the old system: 273 items.

**What changed after review** (D-027 to D-031)
- Discounts: managers only by default.
- Staff aren't tied to a floor: people move around.
- Payments: method plus account, because the banks will change.
- The 178 "inactive but showing stock" products were stock returned to suppliers, or old
  records replaced when phones moved floors. They're confirmed out.

**What we learned**
- The confirm list taught us something about the data: "inactive with stock" wasn't missing
  stock, it was history (supplier returns, a floor move). One question to the owner settled
  178 rows.
- Asking "will this still be true in six months?" removed two designs: fixed staff floors,
  and payment methods named after specific banks.

**Worth showing**
- Screenshot: one page of the printed stock confirmation sheet (blur nothing; it's product
  names only).
- Screenshot: blueprint sheet A-401 with the "Allow Joy to refund sales?" warning, next to
  the matching warning text in the database.

---

## 2026-10-21 · Session 7: The till actions, and 28 passing tests

**What we built**
- The actions that make it a working POS. Each is one database function that checks
  permission and stock and writes everything at once, so a sale either fully happens or
  doesn't happen at all:
  - **Place order** (rep): prices always come from the database, never from the screen.
    Phones are held for 30 minutes.
  - **Checkout** (cashier): split payments that must add up exactly, card and transfer tied to
    an account, every phone re-checked, other items stop at zero, cost captured for profit.
  - **Cancel order / remove item**: need a reason, and items go straight back on sale.
  - **Return**: back to stock or marked faulty, refund never more than was paid, the same item
    can't be returned twice.
  - **Housekeeping**: expired holds released, and unfinished orders cancelled at midnight
    (Nigerian time).
- Error messages written for the person at the till, e.g. "This phone is already in order
  JS-0000001." or "Not enough … in stock (the system shows 39)."
- An automated test script that pretends to be two reps, a cashier and a manager, runs real
  sales against real stock, then rolls everything back. **28 passed, 0 failed.**

**What changed, and why**
- Discounts were redesigned twice in one session (D-032). The first version needed approval
  before every discount, which would slow the queue. The owner explained how it really works:
  a discount only exists because the boss or manager agreed it on the floor. The final design
  is the common convention for owner-run shops: the cashier applies it instantly and taps who
  authorised it, that person gets an alert listing the items, and only an unusually large
  discount (over ₦50,000) asks for a manager's PIN.

**What broke, and how we fixed it**
- *A missing `$`.* **What happened:** an automated edit dropped a `$` from a database
  function, which would have stopped the whole migration. **How we found it:** reading the
  final file back in full before applying it. **Fix:** restored the markers and checked the
  rest of the file for the same problem. The cause: in JavaScript's `string.replace()`, `$$`
  in the replacement text means a single `$`.

**What we learned**
- Designing for the shop floor beats designing for the textbook. "Approve every discount" is
  the textbook. "Trust, record, alert" is what a busy shop needs.
- Tests that act out real situations ("two reps scan the same phone") catch the bugs that
  matter, and running them in a rolled-back transaction means testing against real data
  is safe.

**Worth showing**
- Screenshot: the test report, 28 PASS lines, ending "28 passed, 0 failed".
- The alert text: "Test Cashier applied ₦10,000 off JS-0000005 (IPHONE XR 64GB, REDMI
  CERAMICS SCREEN GUARD MI 12). Paid ₦236,000. Authorised by Test Manager."

---

## 2026-10-21 · Session 8: The POS app takes shape

**What we built**
- `apps/pos`, a separate Next.js app for the tills. It has its own build and settings, so the
  website and the POS can be deployed, and fail, independently.
- A safe doorway to the database: the POS calls only a small set of `pos_*` functions, each
  of which checks the caller is active staff with the right permission. The POS tables
  themselves can't be reached from outside. 14 more tests, all passing.
- **Customer capture:** phone and name required together, any phone format stored the same
  way (0803…, +234…, 234…), returning customers recognised from their number, and a
  "Customer declined" button instead of a silent blank, so reports can show who captures
  details and who skips it.
- **The Sell screen:**
  - The whole catalogue (3,879 products, 537 phones) loads onto the device once, so search
    and scanning answer instantly with no network wait.
  - A laptop barcode scanner works from anywhere on the screen, and a phone camera is the
    backup.
  - Picking a phone model shows its in-stock IMEIs.
  - Items are taken from whichever floor has them.
  - A wholesale price toggle shows for staff who are allowed it.
  - Place order sends the order to the cashier.

**What we learned**
- The old system's customer form had over 40 fields and 88% of sales ended up "Walk-In".
  The new form asks for two things up front, phone and name, and makes skipping visible
  rather than silent.

**Worth showing**
- Screen recording: scan two items, type a phone number, watch "Returning customer" appear,
  place the order. Use test data, and blur any real customer details.

---

## 2026-10-22 · Session 9: Departments instead of floors, and fewer steps

**What changed, and why** (D-033)
- First real use of the Sell screen. The owner had to answer "Which floor is this device on
  today?" before selling, and searches showed "none here · 12 in the shop". Both made no sense
  for someone with access to everything, and the floor names would go stale when departments
  move.
- Now there are three departments (Mobile Phones, Accessories, Spare Parts & Repairs) and no
  floors anywhere on screen. Each person gets access to departments when they're added; the
  owner has them all.
- The floor picker is gone. Reps open straight onto the Sell screen, search everything they
  have access to, and see one plain stock number ("12 in stock").
- The database enforces access, so a hidden screen can't be worked around: an Accessories rep
  who scans a phone is told "You don't have access to Mobile Phones, where the SAMSUNG A07
  4+128GB is." and the phone stays on sale.

**Tests:** 18 app tests (6 new, for department access) and the 28 till tests: **46 passed,
0 failed.**

**What we learned**
- Ten minutes of using the real thing beat a day of design. Each extra question on screen
  needs a reason the person at the till would agree with.
- Slow clicks on the local test server are mostly the development server building each page
  the first time it's opened. The catalogue itself loads from the database in about 0.1
  seconds (429 kB). We'll measure on the deployed version before optimising.

**Worth showing**
- Before/after screenshots: the "Which floor is this device on today?" home screen, and the
  rep landing straight on Sell.
