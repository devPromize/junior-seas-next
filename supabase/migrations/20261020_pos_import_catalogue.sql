-- POS step 2: move the old system's catalogue and stock into the POS tables.
-- Source: extraction run 3 in pos_import.raw_rows (copied 19 Oct 2026).
-- Anything that can't be moved cleanly is written to pos_import.issues for a person to check,
-- never silently dropped.

-- A list of things that need a human look after the import.
create table pos_import.issues (
  id          bigint generated always as identity primary key,
  entity      text not null,             -- 'product', 'phone', 'stock'
  legacy_id   text,                      -- the old system's id
  issue       text not null,             -- short code, e.g. 'duplicate_imei'
  detail      jsonb,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table pos_import.issues enable row level security;

-- Turns "₦ 20,000.00" or "7000.0000" into kobo.
create function pos_import.to_kobo(t text) returns bigint
language sql immutable set search_path = '' as $$
  select coalesce(round(nullif(regexp_replace(coalesce(t, ''), '[^0-9.]', '', 'g'), '')::numeric * 100)::bigint, 0);
$$;

-- Working copies of the source rows, dropped at the end.
-- Inactive products were entered by mistake in the old system, so they're left out.
-- Their sales history stays in raw_rows. Any that still show stock are logged below.
create temp table src_products on commit drop as
select payload p from pos_import.raw_rows
where run_id = 3 and entity = 'products' and coalesce(payload->>'is_inactive', '0') <> '1';

insert into pos_import.issues (entity, legacy_id, issue, detail)
select 'product', r.payload->>'id', 'inactive_product_with_stock',
       jsonb_build_object('name', regexp_replace(trim(r.payload->>'product'), '\s+Inactive$', '', 'i'),
                          'old_stock', r.payload->>'current_stock')
from pos_import.raw_rows r
where r.run_id = 3 and r.entity = 'products' and coalesce(r.payload->>'is_inactive', '0') = '1'
  -- Stock reads like "375.00 Pieces" or "-3.00 Pieces", or "--" when stock isn't tracked.
  and coalesce(substring(r.payload->>'current_stock' from '-?[0-9]+(?:\.[0-9]+)?')::numeric, 0) <> 0;

create temp table src_stock on commit drop as
select (payload->>'product_id')::int   as product_id,
       (payload->>'variation_id')::int as variation_id,
       (payload->>'location_id')::int  as location_id,
       (payload->>'qty_available')::numeric as qty,
       trim(payload->>'sub_sku')       as code,
       (payload->>'type') ilike 'variable' as is_phone
from pos_import.raw_rows where run_id = 3 and entity = 'stock_by_floor';

-- 1. Categories: "CHARGER" with sub-categories like "IPHONE CHARGER".
insert into pos.categories (name)
select distinct trim(split_part(p->>'category', ' -- ', 1))
from src_products
where trim(split_part(coalesce(p->>'category', ''), ' -- ', 1)) <> '';

insert into pos.categories (name, parent_id)
select distinct trim(p->>'sub_category'), c.id
from src_products
join pos.categories c on c.parent_id is null and c.name = trim(split_part(p->>'category', ' -- ', 1))
where coalesce(trim(p->>'sub_category'), '') not in ('', 'null');

-- 2. Brands.
insert into pos.brands (name)
select distinct trim(p->>'brand') from src_products
where coalesce(trim(p->>'brand'), '') not in ('', 'null');

-- 3. Items (active products only).
--    One barcode is used by two products: the second gets "-<old id>" added and is logged.
insert into pos.items (sku, name, category_id, brand_id, unit, cost_kobo, price_kobo,
                       tracks_imei, is_active, legacy_product_id)
select
  case when row_number() over (partition by trim(p->>'sku') order by (p->>'id')::int) = 1
       then trim(p->>'sku') else trim(p->>'sku') || '-' || (p->>'id') end,
  regexp_replace(trim(p->>'product'), '\s+Inactive$', '', 'i'),
  coalesce(sub.id, par.id),
  b.id,
  'piece',
  pos_import.to_kobo(p->>'max_purchase_price'),
  pos_import.to_kobo(p->>'max_price'),
  (p->>'type') ilike 'variable',
  coalesce(p->>'is_inactive', '0') <> '1',
  (p->>'id')::int
from src_products
left join pos.categories par on par.parent_id is null and par.name = trim(split_part(p->>'category', ' -- ', 1))
left join pos.categories sub on sub.parent_id = par.id and sub.name = trim(p->>'sub_category')
left join pos.brands b on b.name = trim(p->>'brand');

insert into pos_import.issues (entity, legacy_id, issue, detail)
select 'product', legacy_product_id::text, 'duplicate_barcode',
       jsonb_build_object('stored_sku', sku, 'name', name)
from pos.items i
where i.sku = (select trim(p->>'sku') from src_products where (p->>'id')::int = i.legacy_product_id)
              || '-' || i.legacy_product_id;

-- 4. Phones. Each old "variation" is one phone. Codes of 28 or 30 digits are two IMEIs
--    joined together (dual SIM), so they're split in half.
create temp table src_phone on commit drop as
select s.*, i.id as item_id, f.id as floor_id,
       case when length(s.code) in (28, 30) and s.code ~ '^[0-9]+$'
            then array[left(s.code, length(s.code) / 2), right(s.code, length(s.code) / 2)]
            else array[s.code] end as imeis
from src_stock s
join pos.items i on i.legacy_product_id = s.product_id
join pos.floors f on s.location_id = any (f.legacy_location_ids)
where s.is_phone;

-- The same IMEI recorded on two variations is one physical phone entered twice.
-- Keep the record with the most stock (then the newest); log the others.
create temp table imei_owner on commit drop as
select distinct on (imei) imei, variation_id
from (select variation_id, qty, unnest(imeis) as imei from src_phone) x
order by imei, qty desc, variation_id desc;

create temp table phone_dupes on commit drop as
select distinct p.variation_id
from src_phone p, unnest(p.imeis) as imei
join imei_owner o using (imei)
where o.variation_id <> p.variation_id;

insert into pos_import.issues (entity, legacy_id, issue, detail)
select 'phone', p.variation_id::text, 'duplicate_imei',
       jsonb_build_object('code', p.code, 'qty', p.qty, 'kept_variation',
         (select o.variation_id from imei_owner o where o.imei = p.imeis[1]))
from src_phone p where p.variation_id in (select variation_id from phone_dupes);

-- Per-phone cost from the purchase records, where we have one.
create temp table phone_cost on commit drop as
select trim(payload->>'sub_sku') as code, max(pos_import.to_kobo(payload->>'unit_purchase_price')) as cost_kobo
from pos_import.raw_rows where run_id = 3 and entity = 'purchase_lines'
group by 1;

insert into pos.phone_units (item_id, floor_id, status, cost_kobo, legacy_variation_id)
select p.item_id, p.floor_id,
       case when p.qty >= 1 then 'in_stock' else 'sold' end,
       coalesce(c.cost_kobo, i.cost_kobo),
       p.variation_id
from src_phone p
join pos.items i on i.id = p.item_id
left join phone_cost c on c.code = p.code
where p.variation_id not in (select variation_id from phone_dupes);

-- IMEIs: only valid ones (14 to 17 digits). Anything else is logged for checking.
insert into pos.phone_unit_imeis (imei, unit_id, slot)
select x.imei, u.id, x.slot
from src_phone p
join pos.phone_units u on u.legacy_variation_id = p.variation_id
cross join lateral unnest(p.imeis) with ordinality as x(imei, slot)
where x.imei ~ '^[0-9]{14,17}$'
on conflict (imei) do nothing;

insert into pos_import.issues (entity, legacy_id, issue, detail)
select 'phone', p.variation_id::text, 'invalid_imei', jsonb_build_object('code', p.code, 'qty', p.qty)
from src_phone p
where p.variation_id not in (select variation_id from phone_dupes)
  and exists (select 1 from unnest(p.imeis) i where i !~ '^[0-9]{14,17}$');

-- Phones the old system counted more than once, or below zero.
insert into pos_import.issues (entity, legacy_id, issue, detail)
select 'phone', variation_id::text,
       case when qty > 1 then 'phone_counted_more_than_once' else 'phone_below_zero' end,
       jsonb_build_object('code', code, 'old_qty', qty)
from src_phone
where (qty > 1 or qty < 0) and variation_id not in (select variation_id from phone_dupes);

-- 5. Opening stock. Phones: one +1 movement per phone in stock.
insert into pos.stock_movements (item_id, floor_id, qty_change, reason, unit_id, note)
select item_id, floor_id, 1, 'opening', id, 'Opening stock from the old system (19 Oct 2026)'
from pos.phone_units where status = 'in_stock';

-- Everything else: one movement per item per floor. Negative quantities start at zero
-- (logged with the old number) so the new system doesn't open with impossible stock.
insert into pos.stock_movements (item_id, floor_id, qty_change, reason, note)
select i.id, f.id, s.qty::int, 'opening', 'Opening stock from the old system (19 Oct 2026)'
from src_stock s
join pos.items i on i.legacy_product_id = s.product_id
join pos.floors f on s.location_id = any (f.legacy_location_ids)
where not s.is_phone and s.qty > 0;

insert into pos_import.issues (entity, legacy_id, issue, detail)
select 'stock', s.product_id::text, 'stock_below_zero',
       jsonb_build_object('name', i.name, 'floor', f.code, 'old_qty', s.qty)
from src_stock s
join pos.items i on i.legacy_product_id = s.product_id
join pos.floors f on s.location_id = any (f.legacy_location_ids)
where not s.is_phone and s.qty < 0;
