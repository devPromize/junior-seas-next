# Decisions

Short notes on the key choices in the Junior Seas POS build, the trade-offs, and what
we chose not to do. Newest at the bottom.

---

### D-001 · Build our own POS instead of waiting on the current provider (2026-10-17)
**Choice:** Build our own POS now and move our data out of the old system.
**Why:** We depend on one external developer for access to our own sales and customer
data, and the system can't be shaped around how we sell. Owning the data is the point:
the rest of the plan (CRM, follow-ups, marketing) needs clean customer records.
**Trade-off:** More work up front, and we take on running and supporting it ourselves.

### D-002 · The POS is the source of truth; the website reads from it (2026-10-19)
**Choice:** Every product lives in the POS. A "Show online" tick decides what appears on
the website, which shows live stock from the same count.
**Why:** One stock count means a phone sold in the shop disappears from the website
straight away, so nothing is sold twice.

### D-003 · Deploy the POS separately from the website (2026-10-19)
**Choice:** Two apps on separate addresses (`juniorseastech.com` and
`pos.juniorseastech.com`), sharing one database and one login system.
**Why:** A broken website release must never stop the tills.
**Trade-off:** Two deployments to manage. The database is the one shared dependency, so
it moves to a paid plan with daily backups.

### D-004 · Online-only first; no offline selling (2026-10-19)
**Choice:** The first release needs an internet connection to complete a sale.
**Why:** Offline selling brings sync conflicts, the risk of the same phone being sold on
two devices, and sales that sit unrecorded on one device. The old system is already
online-only, so this is no step back.
**Cut for now:** An "outage mode" that switches on only when the connection actually
drops. The design leaves room to add it later.

### D-005 · Every phone is its own record (2026-10-19)
**Choice:** A product is a model ("iPhone XR 64GB"). Each physical phone is a unit with
its IMEI(s), cost, supplier and status.
**Why:** Phone stock becomes a count of units actually in stock, so it can never go below
zero, and every phone has a full history from purchase to sale.

### D-006 · Stock is a ledger, not a number (2026-10-19)
**Choice:** Stock is never typed in. Every change is a recorded movement with a reason:
sale, return, delivery, transfer, adjustment, repair part or online order.
**Why:** Any stock figure can be traced back to who changed it, when and why.
Below-zero sales of non-phone items need a manager PIN and get logged.

### D-007 · Warranty lookup by IMEI in the first release (2026-10-19)
**Choice:** Scanning a phone's IMEI shows when it was sold, who sold it, who bought it
and how much warranty is left.
**Why:** Customers often lose receipts. This also gives every phone sale a lasting link to
a customer, which feeds follow-ups later.

### D-008 · Capture customer data for the CRM from day one (2026-10-19)
**Choice:** The phone number comes first at checkout, with optional email, how they heard
about us, marketing consent, and company details for business buyers.
**Why:** The POS is the data source for HubSpot and for targeted marketing later. Data
that isn't captured at the till can't be recovered afterwards.

### D-009 · Kept small or cut from the first release (2026-10-19)
- **Repair tickets:** minimal version only (customer, device, IMEI, fault, status, parts used).
- **Cut:** drafts, commission agents, price groups and accounting reports. Staff don't use
  them today.

### D-010 · Sales reps build sales, one cashier per floor takes the money (2026-10-19)
**Choice:** Reps build the sale on a phone, capture customer details and send it with a
note. Every cashier on that floor sees it in a checkout queue, applies any discount, takes
payment and completes it. Reps have no payment button.
**Why:** That's how the floors already work. Few people handling money means fewer cash
problems. Each sale records who sold it and who checked it out.
**Detail:** A scanned phone is held for 30 minutes so two reps can't sell the same unit.
Customer details save when the rep sends the sale, so a walk-away is still a lead.

### D-011 · Laptop and scanner first, phone camera as backup (2026-10-19)
**Choice:** Reps work on laptops with USB or Bluetooth scanners. Any staff phone can also
scan, using its camera to read product barcodes and the IMEI barcode on the box.
**Why:** Laptops and scanners are what the floors already use, so they stay the main setup.
The phone camera means a sale never waits because a laptop is busy or broken.

### D-012 · A deposit is for a model, not one particular phone (2026-10-19)
**Choice:** A deposit is credit on the customer's account. A unit can be held for a set
number of days. When the hold ends the phone goes back on sale and the money stays as
credit. On their return the cashier picks any in-stock unit.
**Why:** Customers often pay a deposit and don't come back when they said. The shop already
sells the held phone and gets the customer another one later, and this matches that.
Recording deposits as credit keeps sales figures true.

### D-013 · Payment methods are a configurable list (2026-10-19)
**Choice:** Cash, Transfer, Card (Nombank), Card (OPay), with website orders marked
Online (Paystack). The owner can add methods in Settings.
**Why:** The cash count has to match each card provider's settlement.

### D-014 · A plain receipt with an optional notes block (2026-10-19)
**Choice:** The receipt shows "Served by" (the rep's name). It has no floor and no printed
warranty or return terms by default. A notes block appears only when the cashier writes in
it. The closing message is customisable, including dated seasonal greetings. The QR code
says "Scan to view or verify".
**Why:** Terms differ by product. Warranty periods are still stored internally per category,
so warranty lookup works without them being printed.

### D-015 · WhatsApp from the shop's number, never personal accounts (2026-10-19)
**Choice:** At launch, the shop's WhatsApp Business number is linked on the cashier PCs, and
"Send on WhatsApp" opens a filled-in chat from that number. Later, automatic sending through
Meta's WhatsApp Business Platform.
**Why:** Nobody's personal WhatsApp is involved. The automatic version is also what the
follow-up campaigns will run on.
**Trade-off:** The automatic version needs Meta verification and costs a small fee per message.

### D-016 · Stock sent to Store B is "transferred out", not sold (2026-10-19)
**Choice:** Stock sent to our second shop leaves our stock immediately and is recorded as
"transferred out", with what was sent, who sent it and when. It never counts as a sale.
Only managers, or people given the "Transfer stock" permission, can do it.
**Why:** Store B has no system yet, and its takings go straight to the owner's account. We only
need a clear record that the stock left, without inflating our sales. When Store B gets the
system, these transfers become its opening stock.
**Cut:** a value report reconciling Store B's takings. It isn't needed, because the money
goes straight to the owner.

### D-017 · No scheduled stock counting for now (2026-10-19)
**Choice:** No weekly or rolling counts in the first release. Staff record an adjustment with a
reason whenever they notice a mismatch.
**Why:** The store is too large, with too much stock in storerooms, to count regularly with
current staff, and we won't build what won't be used. The till rules (IMEI-only phone sales,
stop at zero, receive before shelving) prevent most drift at the source.
**Later:** scheduled counts, when there are more hands.

### D-018 · Configurable roles and permissions (2026-10-19)
**Choice:** Each permission is a separate switch. Roles are named sets of switches the owner
can create. One person can get an extra permission, optionally until a set date. Sensitive
permissions show a risk warning before they're granted. Every change is logged, and the last
owner can't be removed.
**Why:** Staff duties overlap when the shop is short-handed. Sales reps keep the most limited
access by default.

### D-019 · Printing is optional for every sale (2026-10-19)
**Choice:** At checkout the cashier picks Print, WhatsApp only, or No receipt. Cashier PCs can
skip the browser's print preview, and that setting can be switched off.
**Why:** Many customers refuse a paper receipt or don't wait for one, so printing every time
wastes paper. The digital receipt also keeps a record either way.

### D-020 · Phones are held when the order is placed, not when scanned (2026-10-19)
**Choice:** A rep's sale isn't visible to the cashier until the rep presses "Place order", as
in the shop today. Placing the order holds its phones for 30 minutes (adjustable). Nothing is
held while the sale is still being built. If two reps scan the same phone, the first to place
the order gets it.
**Why:** It stops the same phone being sold twice without blocking reps who are still
browsing with a customer.

### D-021 · Two kinds of return (2026-10-19)
**Choice:**
1. **Cancelled before payment:** the cashier cancels an unpaid order, or removes one wrong
   item, with a reason. The items go straight back into stock. It isn't a refund.
2. **Sales return after payment:** for an item brought back with a receipt (or found by
   IMEI lookup). It needs a reason and the Refund permission. Stock goes back in, or the
   item is marked faulty, and the refund is recorded by payment method. It's logged.
**Why:** Mistakes at the till and real customer returns are different events. Keeping them
apart means refunds only appear where money actually went back to a customer.

### D-022 · Closed by default: database permissions tightened (2026-10-20)
**Choice:** Logged-out visitors can now only read the shop and log searches. Every other write
permission they had by default was removed. Signed-in users lost the unused "empty table" and
trigger permissions. The signup function can no longer be called directly.
**Why:** Row-level security already blocked these actions, but one careless rule in future
would have been enough to open them. Now two separate locks have to fail. Supabase is
moving the same way: from 30 Oct 2026, new tables start with no API access until granted.
**Rule from now on:** every migration that creates a table grants exactly the access it needs.
POS tables live in their own schema that the public API can't reach.
**Checked:** website, shop, product and category APIs all still return normally, and a
logged-out delete attempt is refused.

### D-023 · Days close themselves; no register for reps (2026-10-20)
**Choice:** Reps just log in and sell. They never open or close a register. The business day
is the calendar date in Nigerian time, so every sale is stamped and reports group by day
automatically. Only cashiers open a till (with the float) and close it with a cash count.
**Open orders can't linger:** when a cashier closes the till, any orders still waiting in
that floor's queue must be checked out or cancelled. Anything still open at midnight is
cancelled automatically, its items go back into stock, and it's listed on the owner's
dashboard the next morning.
**Why:** In the old system, reps open a "register" every morning though they never handle
money. "Place order" really uses its suspend-sale feature, so placed orders sit there
indefinitely: one rep still had orders from 19 Sep and 30 Sep waiting a month later.

### D-024 · Mistakes are corrected, never deleted (2026-10-20)
**Choice:** Every common mistake gets its own one-step correction, and every correction is
logged with who made it and why:
- A product created by mistake and never used can be deleted.
- A wrong or duplicate product with history is **archived** (hidden from the till, history
  kept) or **merged** into the correct product.
- A phone saved under the wrong model is **moved to the correct product**, keeping its IMEI.
- A wrong delivery quantity is **corrected**: free on the same day, manager approval after that.
**Prevention:** warnings for similar names or the same barcode, IMEIs already in the system
rejected, and IMEI check digits validated.
**Why:** Staff are still learning, so mistakes will happen. Fixing them has to be quick, and
the history has to stay trustworthy.

### D-025 · Stock gets corrected at the till, not in counting sessions (2026-10-20)
**Choice:** When the till disagrees with reality, staff fix it on the spot:
- "I have it in hand": the item shows 0, or a phone shows sold. A manager approves with a PIN,
  the item goes back into stock and the sale continues.
- "Not on shelf": the system shows stock but the shelf is empty. It goes on the inventory
  person's list to check.
- "Add this phone": an IMEI the system has never seen, with manager approval.
For launch, the import's review list becomes a per-floor "please confirm" sheet. Staff check
those items while we're still on the old system.
**Why:** Regular counting isn't feasible with current staff. This fixes the items that
actually sell first, using moments that are already happening.

### D-026 · Inactive products from the old system aren't imported (2026-10-20)
**Choice:** The 278 products marked inactive were entered by mistake, so they don't come
across. Their sales history stays in our raw copy. 178 of them still show stock in the old
system, so they're on the review list in case some are real items deactivated by mistake.
Anything the old system shows below zero starts at zero, with the old number kept on the list.
