-- Reports fix (D-043): spreading old sale-level discounts across items (20261024_pos_reports.sql)
-- divided by a decimal total, so each item's share was rounded separately and 75 sales ended up
-- 1–4 kobo away from what the customer paid. Redo the spread in whole kobo: every item gets its
-- share rounded down and the last item takes what's left, so each sale adds up exactly.
-- Found by the reports test ("every old discounted sale's items add up to what was paid").

with gaps as (
  select s.id, s.discount_kobo d, sum(l.qty * l.unit_price_kobo)::bigint g
  from pos.sales s join pos.sale_lines l on l.sale_id = s.id and l.removed_at is null
  where s.source = 'legacy' and s.status = 'paid' and s.discount_kobo > 0
  group by s.id, s.discount_kobo, s.total_kobo
  having sum(l.qty * l.unit_price_kobo) - s.discount_kobo = s.total_kobo
), shares as (
  select l.id, l.sale_id, g.d,
         (g.d * l.qty * l.unit_price_kobo) / g.g as share,   -- bigint / bigint: whole kobo, rounded down
         row_number() over (partition by l.sale_id order by l.id desc) as from_last
  from gaps g join pos.sale_lines l on l.sale_id = g.id and l.removed_at is null
), fixed as (
  select id, case when from_last = 1 then d - (sum(share) over (partition by sale_id) - share) else share end as discount
  from shares
)
update pos.sale_lines l set line_discount_kobo = f.discount
from fixed f where f.id = l.id and l.line_discount_kobo is distinct from f.discount;
