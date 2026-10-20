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
