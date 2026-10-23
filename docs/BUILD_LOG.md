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

---

## 2026-10-22 · Session 10: The back office takes shape

**What we built**
- **A sidebar and dashboard**, inspired by the old system's layout and by Bumpa's simplicity.
  The old system has 60 menu links; ours has 11 sections, and each person only sees the ones
  their role allows. The dashboard shows today's sales (after discounts), receipts, orders
  waiting to be paid, discounts, sales by department, and the last 7 days.
- **Staff:** a list (role, departments, last sign-in), plus add and edit. The form asks for 7
  things instead of 40+. Choosing a role shows what that person will be able to do and any
  warnings ("This person can take money and complete sales…").
- **Departments in Settings:** add a new department (e.g. Electrical & Electronic Appliances)
  in one step, rename one, or hide one once its stock has moved out.
- **Creating logins safely:** a small server function makes the login, so the POS app itself
  still never holds the master key.

**Tests:** 16 new back-office tests, all passing (62 database tests in total). They include
"a manager can't make anyone an owner", "the owner can't lock themselves out" and "a deactivated
person can't sign in to the POS".

**What we learned**
- Looking at the old system as the owner sees it, rather than at its data, showed the real
  brief: one place to land, and everything you can do in reach.
- The old system's "Location" dropdown on its sales screen is where the floor picker came from.
  Copying a screen copies its problems too.

**Worth showing**
- Side by side: the old system's Add User form (40+ fields) and ours (7).
- The sidebar as an owner sees it and as a sales rep sees it.

---

## 2026-10-22 · Session 11: Checkout and the receipt

**What we built**
- **Checkout:** the cashier's queue of orders waiting to be paid. It updates by itself every
  few seconds, and each cashier only sees orders with items from their departments. Opening an
  order shows the items, IMEIs, the rep's note and any discount promised on the floor.
  - **Discount:** prefilled with what the rep promised; the cashier picks who authorised it.
    Above the quick-discount limit (₦50,000), a manager types their PIN at the till.
  - **Payment:** tap + Cash, + Transfer or + Card. Each one fills in what's left to pay, so a
    split payment is two taps. Transfers and cards ask which account (Nombank, OPay). Complete
    sale only lights up when the payments add up exactly.
  - **Remove an item or cancel the order**, with a one-tap reason.
- **The receipt:** one receipt per order, even when the items come from several departments.
  It has the shop's name, address and phone numbers, the receipt number, customer, who sold it
  and who took payment, every item with its IMEI, any discount, and each payment. It prints on
  80 mm receipt paper, and **Send on WhatsApp** opens the shop's WhatsApp with the receipt
  ready to send to the customer's number.
- **My PIN:** managers set the PIN they use to approve large discounts.

**Tests:** 9 new tests for the whole journey (a rep sells a phone and an accessory, the right
cashier takes cash plus an OPay transfer, the receipt shows both items and both payments, the
wrong cashier can't see or take the order, and an order can't be paid twice). All passing.

**Before go-live**
- Receipt numbers come from a counter that test runs also use up (tests roll back their sales
  but not the counter). Reset it at cutover so real receipts start from JS-0000001.

**Worth showing**
- Screen recording: Sell on one screen, the order appearing in Checkout on another a few
  seconds later, split payment, then the printed receipt.

---

## 2026-10-22 · Session 12: Products and stock

**What we built** (D-035)
- **Products:** a searchable list of all 3,879 products (by name, barcode, category, brand or
  even a phone's IMEI), filtered by department, category and in/out of stock, 50 per page.
  Costs only show to people allowed to see them.
- **Each product's page:** edit details and prices (fields you can't change are locked),
  stock in each department, every phone in stock by IMEI with Missing / Faulty / Back in stock,
  and the product's full stock history (received, sold, moved, counted: who, when, why).
- **Add product:** type a new category or brand straight into the form; leave the barcode
  empty and the system makes one up.
- **Stock → Receive a delivery:** choose the department and supplier, add products, scan each
  phone's IMEI (both IMEIs for dual-SIM), and enter costs. The button shows the total pieces and
  cost before you confirm.
- **Stock → Move stock:** from one department to another, phones by IMEI scan.
- **Shelf counts:** on the product page, type what's on the shelf and why it's different.

**Data clean-up:** 14 product names and 7 categories from the old system had "&amp;" instead
of "&", and 3 categories existed twice because of it. Fixed and merged.

**What changed after review**
- The Inventory officer role was described as "Receives, transfers and corrects stock" but
  couldn't move stock. It can now.

**Tests:** 18 new tests, all passing, including: an IMEI can't be received twice, you can't move
more than you have, a phone marked missing leaves stock and comes back when found (even when
found by its second IMEI), an inventory officer can't change selling prices or see costs, and
every price change is logged from → to.

**Worth showing**
- A phone's product page: 30 IMEIs, each with its department and cost.
- Receiving a delivery with a barcode scanner: scan, scan, scan, "Receive 3 pieces".

---

## 2026-10-23 · Session 13: Purchases (D-036)

**What we built**
- **Purchases**, named and numbered the way staff already know them (next: PO2026/0347):
  pick the supplier from a list or add a new one, choose the department, add products (scan
  each phone's IMEI), cost, and optionally a new selling price, as on the old form.
- **The old system's purchase history**: 344 purchases and 2,262 purchased items since April
  2025, each linked to its supplier and product, searchable by PO number, supplier, invoice
  number or product. Totals match the old system to the kobo.
- **Supplier's receipt on file**: take a photo of each page with the phone (shrunk to ~300 KB
  before upload) or attach a PDF, when recording a purchase or later on any purchase,
  old ones included.

**What we learned from the old data**
- A quarter of the "purchases" (82) were really stock coming from our own other branches. In the
  new POS that's a stock move, so reports stop counting it as buying.
- Supplier payments stopped being recorded at the start of 2026. Worth deciding whether to
  track what we owe suppliers (it fits naturally in Money).

**Tests:** 9 new purchase tests and the 18 stock tests re-run against the new purchase entry
point: 27 passing.

**Coming next for purchases:** AI reading the receipt photo and filling the purchase in, for a
person to check before saving. It needs an AI key.

---

## 2026-10-23 · Session 14: Sales and returns, and 18 months of history (D-037)

**What we built**
- **Sales:** every sale, newest first, for the last 7 days by default (Today / 30 days / All
  time), with the count and value after returns. Find a sale by receipt number, customer name
  or phone, product, or IMEI. Old-system sales keep their old receipt numbers.
- **Phone lookup:** search an IMEI and see the phone's story: what it is, where it is now, when
  it came in and from whom, and when, to whom and for how much it was sold.
- **Each sale's page:** items, IMEIs, discount, how it was paid, returns so far, and Print or
  send the receipt again.
- **Returns:** tick the items, choose "Back in stock" or "Faulty", give a reason (one tap for
  the common ones), and the refund fills itself in from what the customer actually paid.
- **History:** 33,347 old sales, 42,574 items, 30,797 payments, 487 returns and 575 customers
  brought over. Returning customers are now recognised at the till from their old purchases too.

**What broke, and how we fixed it**
- *The sales list was slow.* **What happened:** with 30,000 old sales, the list took about 2
  seconds. **How we found it:** timing it as the owner before building the screen. **Fix:** the
  list was working out refunds and cashier names for every matching sale, not just the 50 on
  screen. Moved that work to the page being shown and added indexes: now 0.02 to 0.2 seconds.
- *Old receipts would have been open to anyone.* **What happened:** the receipt check asked "did
  you sell this?" and old sales have no seller on record; in SQL, "nobody" compared with "you"
  isn't "different", it's unknown, and the check let it through. **How we found it:** reading the
  check again while importing sales with no seller. **Fix:** the check now uses the same "who
  can see which sales" rule as everything else, and treats an empty seller as not you.

**What we learned from the old data** (all in [OLD_SYSTEM_FINDINGS.md](OLD_SYSTEM_FINDINGS.md))
- About 1 in 10 "sales" were stock sent to our own branch, under seven different contact names.
- 263 real customer sales were left unpaid or part-paid with nothing following them up.
- No product had a warranty period set.

**Tests:** 10 new tests for the whole journey (sell a phone and an accessory, find it by
receipt number and IMEI, a cashier can't refund, a manager returns one accessory into stock
and the phone as faulty, can't refund more than paid, an old-system sale returned, a branch
transfer refused). All passing.

**Worth showing**
- The phone lookup: type an IMEI, see the phone's whole story in one box.
- A return: tick, "Faulty", "Return and refund ₦7,000".
- The findings list itself makes a good post: "17 things we learned from 18 months of data".

---

## 2026-10-23 · Session 15: Money (D-038)

**What we built**
- **Money → Today:** what came in and through which account, refunds, expenses, payments to
  suppliers, each cashier's cash-up, and what we owe suppliers. Pick any date.
- **Supplier bills:** every purchase that's still owed, oldest first, with a "Record payment"
  form right on it. Each purchase page shows its payments. New purchases ask "Has the supplier
  been paid?".
- **Expenses:** tap the type (Diesel / fuel, Electricity, Food…), amount, what for, done. Optional
  receipt photo.
- **Cash-up:** the cashier sees what should be in the drawer and types what's actually there.
  Balanced, or short/over with a reason that goes straight to the owner.
- **Alerts:** a count in the sidebar and a page that lists discount alerts, short cash-ups and
  overdue supplier bills, each linking to the sale or purchase.
- **Bank & card accounts:** add or retire the accounts payments go into.

**What broke, and how we fixed it**
- *The till's two scheduled jobs had never run.* **What happened:** in session 7 we wrote "release
  phones held by abandoned orders after 30 minutes" and "cancel unpaid orders at midnight", but
  nothing was scheduling them. **How we found it:** setting up the supplier reminders needed a
  scheduler, and the scheduler wasn't switched on. **Fix:** switched it on and scheduled all three
  jobs.
- *More web codes in old names.* "GOD&#039;SWILL COMM" showed on the supplier bills. Fixed, and
  checked every name in suppliers, products, customers, sales and purchases.

**What we learned from the old data**
- In 18 months only three expenses were recorded, one a test and one saved as a "refund" by
  mistake (finding 18).

**Tests:** 17 new tests (old purchases settled; only the right people pay suppliers; overpaying,
future dates and transfers without an account refused; a bill can't be paid twice; a 40-day-old
bill reminds owner and manager once a week; expenses checked; cash-up expects the right cash, needs
a note when short and alerts the owner; overview; alerts; accounts). All passing.

**Worth showing**
- The cash-up screen: "Should be in the drawer ₦…", type the count, "Balanced."
- A supplier bill with "Record payment" open: amount, date, transfer from OPay, "Paid in full".
