# What we found in the old system

Everything we've learned about how the shop's old point-of-sale system was really being used,
gathered in one place. Each finding came from the data or from walking through its screens, and
each one shaped a rule in the new POS. Written to be shared: no vendor names and no takings.

Last updated: 23 October 2026 (18 findings).

---

## Stock

1. **Stock went below zero.** Around 150 products showed negative stock, phones included.
   A phone is one physical object, so "minus one iPhone" means the records and the shelf had
   drifted apart.
   → *New POS:* every phone is its own record, so it's either on the shelf or it isn't. Other
   items stop at zero unless a manager confirms the item is in hand.

2. **IMEIs were recorded but didn't control stock.** Each IMEI was stored as a product
   "variation", and one IMEI could carry a stock count of 2.
   → *New POS:* an IMEI can exist once, ever. Receiving a phone whose IMEI is already in the
   system is refused, with where that phone is now.

3. **"Inactive" products still showed stock.** 178 of them. One question to the owner
   explained it: supplier returns, and old records left behind when phones moved floors. It was
   history, not missing stock.
   → *New POS:* stock only changes through a recorded movement (received, sold, moved, counted),
   so every number can be explained.

4. **Stock sent to our own branch was recorded as sales.** About **1 in 10 "sales"** (3,350
   of 33,347) were really stock sent to our other store, never "paid", spread across **seven
   different contact names for the same branch** ("TO OUR BRANCH", "EMMANUEL NO 12", "CHIBUZOR
   NO 12 TETLOW"…). Sales figures were inflated by every one of them.
   → *New POS:* moving stock is its own action. The old records are flagged and left out of
   sales.

5. **…and stock coming back from our branches was recorded as buying.** About **1 in 4
   "purchases"** (82 of 344) were from our own branches.

## Money

6. **Supplier payments stopped being recorded.** Every purchase this year shows as "due",
   including ones that were paid. Staff didn't know how to mark a purchase as paid.
   → *New POS (planned, under Money):* old ones marked cleared; from now on paying a supplier is
   one tap, and anything unpaid after a month is flagged to managers and the owner.

7. **Discounts lived in a free-text note**, with no record of who agreed them.
   → *New POS:* the cashier picks who authorised it, and that person and the owner get an alert.

8. **263 customer sales were left "due" or "part-paid"**, with nothing following them up.

18. **Expenses were barely recorded.** In 18 months: three entries. One was a test, and one food
    expense was saved as a "refund" by mistake. Daily spending (diesel, food, transport) simply
    wasn't in the system, so the day's cash could never be reconciled.
    → *New POS:* recording an expense is a few taps (type, amount, what for) with an optional
    photo, and cash expenses come off the cashier's cash-up automatically.

## Customers

9. **88% of sales were "Walk-In Customer".** The customer form had over 40 fields, so staff
   skipped it.
   → *New POS:* two fields up front (phone and name), and a "Customer declined" button, so
   skipping is visible per staff member instead of silent.

## Data quality

10. **The same supplier under different names**: "GODSWILL COMM LTD" and "GOD'SWILL COMM".
    → *New POS:* names that differ only by punctuation, spacing or "LTD" are treated as the
    same supplier.

11. **"FROM CHINA" was a supplier** on about a third of purchases: a description, not a
    supplier we can follow up with.

12. **Text was saved with web codes in it**: "SPARE PARTS &amp; REPAIRS" instead of "&".
    Three categories existed twice because of it.

13. **24 invoice numbers were used twice.**

14. **No warranty periods were set** on any product or category, so "is this still under
    warranty?" had no answer.
    → *New POS:* look up any phone by IMEI to see when and to whom it was sold. Warranty periods
    still need setting per category.

## Screens

15. **A "Location" dropdown on every sale** decided which floor's stock was used. Easy to
    leave on the wrong floor.
    → *New POS:* no floor to pick. Each item comes from the department that holds it, and each
    person only sees their departments.

16. **The Add User form asked for over 40 fields** (blood group, marital status, guardian
    name…).
    → *New POS:* 7 fields: who they are, how they sign in, what they do and where.

17. **About 60 menu links in 11 sections.** Some were never used (purchase returns: zero, ever).
    → *New POS:* 11 sections, and each person sees only what their role allows.
