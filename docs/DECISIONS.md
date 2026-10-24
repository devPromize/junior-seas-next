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

### D-027 · Only managers give discounts by default (2026-10-20)
**Choice:** Discounts are a sensitive permission held by managers (limit ₦20,000) and the
owner. Cashiers and reps start without it, and a manager or owner can grant it to anyone,
with a limit.
**Why:** It's how the shop works today, and discounts are where money quietly leaks.

### D-028 · Every item can carry a wholesale price (2026-10-20)
**Choice:** Items have an optional wholesale price and an optional minimum wholesale quantity.
Empty means no wholesale price, and nothing else changes. Managers and inventory officers can
set it (permission "Set wholesale prices"). Selling at the wholesale price is a separate
permission, held by managers by default. Each sale line records whether it was retail or
wholesale.
**Why:** Today the boss or manager has to be called for every wholesale sale to quote the price
again. With the price stored once, whoever is allowed can sell wholesale consistently.

### D-029 · Staff aren't tied to a floor (2026-10-20)
**Choice:** A staff record has a role, but no fixed floor. The floor someone works on comes from
the till or device they're using that day.
**Why:** People move between floors, and a fixed assignment would go stale immediately.

### D-030 · A payment is a method plus an account (2026-10-20)
**Choice:** A payment is cash, transfer, card or online, plus which account the money went into
(e.g. transfer to OPay, card on Nombank). The owner manages the list of accounts in Settings.
**Why:** The banks and card providers will change over time, and both transfers and card
payments can go into any of them. The cash-up can then be checked per account.

### D-031 · Inactive products confirmed out (2026-10-20)
**Choice:** The 178 inactive products that still showed stock were returned to suppliers or
replaced by newer product records. They're marked resolved and taken off the confirm sheet,
which is now 273 items.

### D-032 · Discounts: applied instantly, recorded, and alerted (2026-10-21)
**Choice:** Replaces D-027. The till never waits for a discount:
- The cashier applies the discount the boss or manager agreed on the floor, on the whole order
  or per item, and taps who authorised it. Reps can't be named, only people allowed to authorise.
- The person named, and the owner, get an instant alert listing the receipt, the items, the
  discount and who applied it. They can tap "I didn't approve this", which flags it to the owner.
- A whole-order discount is spread across the items in proportion to their value, so profit
  per product stays accurate.
- Safety limit: only a discount above the quick-discount limit (₦50,000 by default, set in
  Settings) needs a manager's PIN at the till or a tap on their phone. This mainly catches
  typos, like ₦100,000 typed for ₦10,000. Five wrong PINs lock that PIN for 15 minutes.
**Why:** Customers don't like delays, and in this shop a discount only exists because the boss or
manager said so. The convention for owner-run shops is to trust, record and alert, with a
threshold for unusual amounts, rather than ask for approval before every discount. The old
system kept discounts in a free-text note, with no record of who agreed them.

### D-033 · Departments, not floors; access set per person (2026-10-22)
**Choice:** Replaces D-029. The shop's sections are departments: Mobile Phones, Accessories,
and Spare Parts & Repairs. The POS never names a floor, because which floor a department sits
on can change. When the owner adds someone, they choose which departments that person can
access. People see and sell only from those departments, and the cashier's queue shows orders
containing their departments' items. The owner sees everything. Nobody picks a floor or a
department before selling: they search, and each item is taken from the department that holds
it. One order still gets one receipt, whichever departments its items come from. Someone with
only selling to do opens straight onto the Sell screen.
**Why:** Asking "which floor is this device on today?" was an extra step that added nothing.
Access is about the person, not the device.

### D-034 · A back office with a sidebar, shaped like the jobs people do (2026-10-22)
**Choice:** Every signed-in screen sits inside one layout: a sidebar on the left (a Menu button
on phones), the screen on the right. The sidebar has 11 sections (Dashboard, Sell, Checkout,
Sales, Products, Stock, Customers, Staff, Money, Reports, Settings) in place of the old system's
11 sections and 60 links. Each person sees only the sections their role allows; sections still
being built show as "Soon". People land on the dashboard if they can see it, otherwise on their
first section (Sell, for a rep).
- **Add staff** asks for name, phone, email, a first password, role, departments and (for
  people who approve discounts) a discount limit. The old form asked for over 40 fields.
- **Departments** are added, renamed or hidden in Settings and are usable straight away. A
  department still holding stock can't be hidden.
- **Logins** are created by a Supabase edge function (pos-add-staff), so the POS app still never
  holds the server key. The function acts as the person adding staff, so the same permission
  rules apply. Only the owner can add or change an owner, and nobody can deactivate themselves.
**Why:** The owner wants to open the POS and see everything they can do, like the current
system's dashboard and sidebar, but with Bumpa's simplicity: fewer, clearer sections and short
forms.

### D-035 · Products and stock: every change is a movement, every field has its own permission (2026-10-22)
**Choice:**
- Stock only ever changes through a recorded movement: received, sold, moved out/in, counted,
  adjusted. Each product's page shows that history, so any number can be explained.
- Receiving a delivery records the supplier, their invoice number and the cost. The product's
  cost price becomes the latest cost received. Phones are received by scanning each IMEI
  (dual-SIM: both, with "/") or serial number; an IMEI already in the system is refused.
- Moving stock between departments: phones by IMEI, everything else by quantity.
- Stock counts: the shelf count replaces the system's number, and the difference is kept with
  a reason. Phones aren't counted by number: each one is marked missing or faulty (and back in
  stock if it turns up).
- Editing a product: details need "Create and edit products", the selling price needs
  "Change prices", wholesale needs "Set wholesale prices", and cost needs "See cost prices".
  Every change is logged with its old and new value.
- New products get a 13-digit in-store barcode starting with 2 if none is typed.
- "Tracked by IMEI" can't be switched once a product has stock.
**Why:** The old system let stock change without a trail, and the owner couldn't tell why a
number was wrong. Separate price permissions let an inventory officer manage products without
being able to change what customers pay.

### D-036 · Purchases, with their history and the supplier's receipt (2026-10-23)
**Choice:**
- "Receive a delivery" is called **Purchases**, the word staff already use, and lives inside
  Stock (tabs: Purchases · Move stock). Purchase numbers carry on from the old system:
  the next one is PO2026/0347.
- Suppliers are picked from a list (most recently used first) or added on the spot. Names that
  differ only in punctuation, spacing or "LTD" count as the same supplier, so duplicates like
  "GODSWILL COMM LTD" / "GOD'SWILL COMM" can't come back.
- The old system's 344 purchases (2,262 items, April 2025 to October 2026) and its suppliers
  (62, merged to 55) are brought over as history. They don't change stock, which already came
  over as opening stock. Every purchase total matches its items to the kobo.
- As on the old form, a new selling price can be set while recording the purchase (needs
  "Change prices"; logged).
- **Receipts:** attach photos (one per page) or a PDF, before or after saving. Photos are shrunk
  on the phone to about 300 KB and kept as images rather than turned into PDFs: they're smaller,
  open instantly, and are what an AI reader needs. Stored privately; only people who handle
  purchases can open them.
- **Next, with an AI key:** read the receipt photo and fill the purchase in, for a person to
  check every line before saving.
**Why:** Staff know "Purchases" and the PO numbers. Picking suppliers from a list keeps
reports clean. Receipts on file settle disputes with suppliers, and set up AI entry.
**Found in the old data:** 82 of the 344 "purchases" are from the shop's own branches (JUNIOR
SEAS MBARI 59, 12 TETLOW 23): stock moving between our own stores, recorded as buying. And
supplier payments stopped being recorded in early 2026 (₦210M shows as "due").

### D-037 · Sales and returns, with 18 months of history (2026-10-23)
**Choice:**
- The old system's 33,347 sales come over as history, with their items, payments, returns and
  named customers (575), without touching stock. Old receipt numbers are kept, so a customer's
  old receipt can be found by its number.
- 3,350 of those "sales" were stock sent to our own branch. They're flagged as branch transfers
  and left out of the sales list, the dashboard and reports.
- **Who sees which sales:** reps see their own, cashiers and managers see sales with items from
  their departments, and "See sales in every department" sees all.
- **Find a sale** by receipt number, customer name or phone, product, or a phone's IMEI.
  Searching an IMEI also shows the phone's story: when it came in, from which supplier, and
  when, to whom and for how much it was sold.
- **Returns:** pick the items and how many, whether each goes back on the shelf or is faulty,
  and why. The refund is worked out from what the customer actually paid (after discounts), can
  be lowered (exchanges, repairs), and can never be more than what's left unrefunded. Sales from
  the old system can be returned too. Needs "Refund or return a paid sale".
**Why:** Returns are the most sensitive thing at a till. The refund amount comes from the data,
not from someone's memory. History means a customer who bought before the switch is still
looked after.

### D-038 · Money: supplier bills, expenses, cash-up, alerts (2026-10-23)
**Choice:**
- **Supplier bills.** Every purchase is owed until it's paid. All purchases from the old system
  are marked settled, because the shop was paying them and the old system just wasn't told.
  - Recording a payment is one form: amount (the full balance unless changed), date paid, cash or
    transfer, and from which account.
  - It's checked: nobody can pay more than is owed, date a payment in the future, or record a
    transfer without the account.
  - A new purchase asks "Has the supplier been paid?" (Not yet / Paid in full), and a cost is
    now required on every line, because that's how we know what's owed.
  - Anything unpaid after **30 days** alerts the owner and everyone who pays suppliers, weekly,
    until it's paid.
- **Expenses**: type (one tap), amount, what for, cash or transfer, optional receipt photo.
  Numbered EX2026/0001… Recording an expense older than a month needs the owner.
- **Cash-up**: per cashier, since their last cash-up. The system shows float + cash from sales −
  cash refunds − cash expenses − cash paid to suppliers = what should be in the drawer, plus the
  transfers and card payments per account to check against each bank app. A difference needs a
  note and alerts the owner.
- **Alerts** now have a home (sidebar count, Alerts page): discounts, short or over cash-ups and
  overdue supplier bills.
- **Bank & card accounts** are managed in Money (add Moniepoint, stop using an old bank…).
- New permissions: "See money", "Record payments to suppliers", "Record expenses" (Manager by
  default).
- **Scheduled jobs are switched on**: release phones held by abandoned orders (every 5 minutes),
  cancel orders left unpaid from the day before (just after midnight), supplier reminders (8 a.m.).
**Why:** In the old system staff never learned how to mark a supplier paid, so every purchase
this year showed as "due", and expenses were almost never recorded. Both need to be so simple
they actually get done, and checked so they can't be done wrong.

### D-039 · Customers, ready for a CRM (2026-10-23)
**Choice:**
- **Customer list with ready-made groups:** Everyone · Bought a phone · Due for an upgrade (last
  phone over 12 months ago) · Haven't been back (90 days) · Best customers (by spend) · Agreed to
  offers · Businesses. Search by name, phone (any format), email or company.
- **Each customer's page:** what they've spent after returns, visits, first and last visit, the
  phones they own (IMEI, when bought, how long ago), every purchase, staff notes, and one-tap Call
  and WhatsApp.
- **Details and consent:** contact details, where they heard about us, company and industry, and
  three separate consents (receipts and warranty messages; offers; online ads). Consent changes
  are timestamped and logged.
- **Export for CRM:** a CSV with HubSpot's column names (First Name, Last Name, Phone Number,
  Email, Company Name, Lead Source, consents, purchases, spend, phones bought, last phone
  purchase). By default only people who agreed to offers. Needs "Export customer lists", which
  managers don't have by default. Every export is logged: who, which group, how many.
- New permission "See and edit customers" (Manager by default). Cashiers and reps still capture
  customers at a sale but can't browse the whole list.
**Why:** The point of capturing customers is to bring them back: upgrade offers to people whose
phone is a year old, a thank-you to best customers, a "we miss you" to lapsed ones. Those lists
have to be one tap away and legally sendable. Phone numbers are personal data, so browsing and
exporting are limited and logged.

### D-040 · Merging duplicate products (2026-10-23)
**Choice:** Products > Duplicates lists every name saved more than once. Merging keeps one copy
and moves everything else onto it:
- **Stock** moves through recorded stock movements ("Merged into…" / "Merged from copy…"), so the
  stock ledger still explains every number.
- **Phones, past sales and past purchases** are re-pointed to the kept product, so its history is
  complete.
- **Old barcodes keep working:** each retired copy's barcode becomes an alias of the kept
  product, at the till and in search, so printed labels don't need replacing.
- **Copies are retired, not deleted**, and every merge is logged (which copy, its old price).
- **Same-price groups merge in one tap** into the copy most recently sold or bought. Groups whose
  copies have different prices need the owner to choose the price. Merging can't be used to
  change a price without "Change prices". A phone (IMEI-tracked) can't be merged with a non-phone.
**Why:** With one model split across up to 29 records, no stock number or sales report for that
model was right. Merging fixes the past. The duplicate-name guard (session 16 follow-up) stops
it happening again.

### D-041 · Account details, payments to confirm, and per-person permissions (2026-10-24)
**Choice:**
- **Accounts carry their details:** bank, 10-digit account number and account name. At checkout
  the cashier sees them for the chosen account, to read out to the customer.
- **Whose account:** the business's, or a person's own (e.g. Boss's Access and Sterling accounts).
  Payments into a personal account, or any account marked "needs confirming", **complete the sale
  immediately**. The owner and everyone who sees Money are alerted, and the payment waits in
  Money → Payments to confirm until someone marks it **Received** or **Not received** (a note is
  required, and the owner is alerted). Until then Money → Today shows it as "not confirmed yet".
- **Accounts have their own permission,** "Manage bank and card accounts". The owner has it and can
  give it to one chosen manager.
- **Per-person permissions:** on any staff member's page, the owner can give or take away a single
  permission for that person only, without changing their role. Every change is logged.
- Accounts are retired ("Stop using"), never deleted, so past payments still report correctly.
**Why:** Customers sometimes pay into Boss's own accounts, which the shop can't check at the till.
The convention in other systems is to set up payment types centrally (Square's custom payment
methods can only be deactivated, never deleted, to protect reports) and to confirm transfers
that can't be seen instantly (Moniepoint holds POS transfers until the merchant accepts them).
Here we confirm after the sale, so the queue never waits.

### D-042 · Accounts that hold the sale until the money is confirmed (2026-10-24)
**Choice:**
- Each account now has one of three checking modes: **no checking**, **confirm after the sale**
  (D-041), or **confirm before the goods go** (new). Personal accounts must use one of the two
  checking modes. The owner (or whoever has "Manage bank and card accounts") picks the mode per account.
- With "before", **Send for confirmation** first runs the whole checkout and then undoes it, so any
  mistake (short payment, stock, discount) shows at the till straight away. The order then waits
  in Checkout: phones stay held with no time limit, nothing leaves stock, no receipt is printed, and
  it isn't cancelled at the end of the day. The owner and managers are alerted.
- **Received** completes the sale in the cashier's name. The payment is recorded as already
  confirmed by that person, so nobody is asked about it twice, and the cashier's screen opens the
  receipt by itself. **Not received** needs a note, alerts the cashier and the owner, and puts the
  order back in the queue to take another payment.
- While waiting, the order can't be cancelled or changed. The cashier can **stop waiting** (e.g. the
  customer decides to pay cash), which is logged and tells the watchers there's nothing to check.
**Why:** The owner wanted a "just in case" option for accounts they want to be sure of before the
goods leave. It's per account rather than shop-wide, so ordinary sales stay fast.
**Limit:** stock for non-phone items isn't reserved while waiting. If the last one sells meanwhile,
"Received" shows the stock error, and the cashier stops waiting, fixes the order and sends it again.
