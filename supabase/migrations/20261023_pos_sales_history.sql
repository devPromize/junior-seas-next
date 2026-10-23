-- POS step 11: Sales and returns (D-037).
--
-- 1. The old system's sales history comes over: 33,347 sales, 42,585 items, their payments, 504
--    returns and the named customers. History only: stock isn't touched (today's stock came over
--    as opening stock, and sold phones are already marked sold).
--    About 2,900 of those "sales" were stock sent to our own 12 Tetlow branch under seven
--    different contact names, never paid. They're flagged as branch transfers so they never count
--    as sales.
-- 2. Entry points: the sales list, one sale with its returns, a return, and the IMEI lookup
--    (warranty: "when was this phone sold, and to whom?").

alter table pos.sales add column sold_by_name text;                     -- old system: the staff member's name
alter table pos.sales add column legacy_transaction_id int unique;
alter table pos.sales add column legacy_payment_status text;            -- old system: Paid / Due / Partial
alter table pos.sales add column is_branch_transfer boolean not null default false;

create function pos.legacy_kobo(p_text text) returns bigint
language sql immutable set search_path = '' as $$
  select round(nullif(regexp_replace(coalesce(p_text, ''), '[^0-9.]', '', 'g'), '')::numeric * 100)::bigint;
$$;
create function pos.legacy_time(p_text text) returns timestamptz
language sql immutable set search_path = '' as $$
  select to_timestamp(p_text, 'DD-MM-YYYY HH12:MI AM')::timestamp at time zone 'Africa/Lagos';
$$;
create function pos.legacy_floor(p_location text) returns smallint
language sql stable set search_path = '' as $$
  select id from pos.floors where code = case replace(p_location, '&amp;', '&')
    when 'MOBILE PHONES' then 'phones' when 'SPARE PARTS & REPAIRS' then 'spare_parts' else 'accessories' end;
$$;

-- The old system's contacts that were really our own 12 Tetlow branch.
create temporary table branch_contacts on commit drop as
select payload->>'contact_id' as contact_id from pos_import.raw_rows
where entity = 'customers'
  and (coalesce(payload->>'name', '') || ' ' || coalesce(payload->>'supplier_business_name', '')) ~* '(no\.? ?12|tetlow|our branch)';
insert into branch_contacts values ('EMMANUEL NO 12');

-- ---------- customers (named ones; "Walk-In Customer" and the branch are not customers) ----------
insert into pos.customers (phone, name, email, legacy_contact_id, created_at)
select distinct on (coalesce(pos.normalize_phone(p->>'mobile'), p->>'contact_id'))
       pos.normalize_phone(p->>'mobile'),
       initcap(trim(coalesce(nullif(trim(p->>'name'), ''), p->>'supplier_business_name'))),
       case when lower(trim(p->>'email')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(trim(p->>'email')) end,
       p->>'contact_id',
       coalesce(to_date(nullif(p->>'created_at', ''), 'DD-MM-YYYY')::timestamptz, now())
from (select payload p from pos_import.raw_rows where entity = 'customers') x
where p->>'contact_id' <> 'CO0001'
  and p->>'contact_id' not in (select contact_id from branch_contacts)
  and nullif(trim(coalesce(nullif(trim(p->>'name'), ''), p->>'supplier_business_name')), '') is not null
order by coalesce(pos.normalize_phone(p->>'mobile'), p->>'contact_id'), p->>'contact_id'
on conflict do nothing;

-- ---------- sales ----------
with raw as (
  select payload p,
         row_number() over (partition by payload->>'invoice_no' order by payload->>'id') as dup
  from pos_import.raw_rows where entity = 'sales'
)
insert into pos.sales (receipt_no, legacy_invoice_no, legacy_transaction_id, floor_id, status, source, customer_id,
                       sold_by_name, subtotal_kobo, discount_kobo, total_kobo, placed_at, paid_at,
                       legacy_payment_status, is_branch_transfer)
select r.receipt_no, r.receipt_no, (p->'payment_lines'->0->>'transaction_id')::int,
       pos.legacy_floor(p->>'business_location'), 'paid', 'legacy',
       (select c.id from pos.customers c where c.legacy_contact_id = p->>'contact_id'
        union all
        select c.id from pos.customers c where c.phone = pos.normalize_phone(p->>'mobile')
          and p->>'contact_id' <> 'CO0001' and p->>'contact_id' not in (select contact_id from branch_contacts)
        limit 1),
       nullif(trim(coalesce(nullif(trim(p->>'waiter'), ''), p->>'added_by')), ''),
       r.total + r.discount, r.discount, r.total,
       pos.legacy_time(p->>'transaction_date'), pos.legacy_time(p->>'transaction_date'),
       p->>'payment_status', p->>'contact_id' in (select contact_id from branch_contacts)
from raw,
     lateral (select case when dup = 1 then p->>'invoice_no' else (p->>'invoice_no') || '-' || dup end as receipt_no,
                     coalesce(pos.legacy_kobo(p->>'final_total'), 0) as total,
                     coalesce(pos.legacy_kobo(p->>'discount_amount'), 0) as discount) r
on conflict do nothing;

-- Sales with no payment recorded (mostly the branch transfers) find their transaction id
-- through their items, where the invoice number is unambiguous.
update pos.sales s set legacy_transaction_id = x.tid
from (select payload->>'invoice_no' inv, min((payload->>'transaction_id')::int) tid
      from pos_import.raw_rows where entity = 'sale_lines' group by 1
      having count(distinct payload->>'transaction_id') = 1) x
where s.source = 'legacy' and s.legacy_transaction_id is null and s.legacy_invoice_no = x.inv
  and not exists (select 1 from pos.sales o where o.legacy_transaction_id = x.tid);

-- ---------- items sold ----------
insert into pos.sale_lines (sale_id, item_id, item_name, unit_id, floor_id, qty, unit_price_kobo, line_discount_kobo)
select s.id,
       coalesce(u.item_id, i.id),
       upper(replace(p->>'product_name', '&amp;', '&')),
       case when q.qty = 1 then u.id end,
       s.floor_id, q.qty, q.price,
       greatest(0, (q.price - coalesce(pos.legacy_kobo(p->>'unit_sale_price'), q.price)) * q.qty)
from (select payload p from pos_import.raw_rows where entity = 'sale_lines') x
join pos.sales s on s.legacy_transaction_id = (p->>'transaction_id')::int
cross join lateral (select greatest(1, round(nullif(regexp_replace(p->>'sell_qty', '[^0-9.]', '', 'g'), '')::numeric))::int as qty,
                           coalesce(pos.legacy_kobo(p->>'unit_price'), 0) as price) q
left join pos.unit_identifiers ui on ui.code = p->>'sub_sku'
left join pos.phone_units u on u.id = ui.unit_id
left join pos.items i on i.sku = p->>'sub_sku';

-- ---------- payments ----------
insert into pos.sale_payments (sale_id, method, amount_kobo, reference, created_at)
select s.id,
       case pl->>'method' when 'cash' then 'cash' when 'card' then 'card' else 'transfer' end,
       round((pl->>'amount')::numeric * 100)::bigint,
       pl->>'payment_ref_no',
       coalesce((pl->>'paid_on')::timestamp at time zone 'Africa/Lagos', s.paid_at)
from pos.sales s
join pos_import.raw_rows r on r.entity = 'sales' and s.source = 'legacy'
  and (r.payload->'payment_lines'->0->>'transaction_id')::int = s.legacy_transaction_id
cross join lateral jsonb_array_elements(r.payload->'payment_lines') pl
where coalesce((pl->>'is_return')::int, 0) = 0 and (pl->>'amount')::numeric > 0;

-- ---------- returns (the old system kept the amount, not which items) ----------
insert into pos.returns (sale_id, reason, refund_kobo, legacy_id, created_at)
select s.id, 'Returned on the old system', coalesce(pos.legacy_kobo(p->>'final_total'), 0), p->>'invoice_no',
       pos.legacy_time(p->>'transaction_date')
from (select payload p from pos_import.raw_rows where entity = 'sale_returns') x
join pos.sales s on s.legacy_transaction_id = (p->>'parent_sale_id')::int
on conflict (legacy_id) do nothing;

drop function pos.legacy_kobo(text);
drop function pos.legacy_time(text);
drop function pos.legacy_floor(text);

-- The dashboard leaves out stock sent to our own branch.
create or replace function public.pos_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_staff();
  v_deps  smallint[];
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if not (pos.has_permission('reports.view') or pos.has_permission('sales.view_all')
          or pos.has_permission('sales.view_floor')) then
    raise exception 'You don''t have permission to see the dashboard.' using hint = 'not_allowed';
  end if;
  v_deps := case when pos.has_permission('sales.view_all')
                 then (select array_agg(id) from pos.floors)
                 else pos.user_departments(v_user) end;

  return (
    with lines as (
      select (s.paid_at at time zone 'Africa/Lagos')::date as day, s.id as sale_id, l.floor_id,
             l.qty * l.unit_price_kobo - coalesce(l.line_discount_kobo, 0) as amount
      from pos.sales s join pos.sale_lines l on l.sale_id = s.id and l.removed_at is null
      where s.status = 'paid' and not s.is_branch_transfer
        and s.paid_at >= (v_today - 6)::timestamp at time zone 'Africa/Lagos'
        and l.floor_id = any(v_deps)
    )
    select jsonb_build_object(
      'today', jsonb_build_object(
        'total_kobo', coalesce((select sum(amount) from lines where day = v_today), 0),
        'sales', (select count(distinct sale_id) from lines where day = v_today),
        'discount_kobo', coalesce((select sum(s.discount_kobo) from pos.sales s
                                   where s.status = 'paid' and not s.is_branch_transfer
                                     and (s.paid_at at time zone 'Africa/Lagos')::date = v_today
                                     and exists (select 1 from pos.sale_lines l where l.sale_id = s.id and l.floor_id = any(v_deps))), 0)),
      'by_department', (select jsonb_agg(jsonb_build_object(
                          'id', f.id, 'name', f.name,
                          'total_kobo', coalesce((select sum(amount) from lines where day = v_today and floor_id = f.id), 0))
                          order by f.id)
                        from pos.floors f where f.id = any(v_deps) and f.is_active),
      'last_7_days', (select jsonb_agg(jsonb_build_object(
                        'day', d::date,
                        'total_kobo', coalesce((select sum(amount) from lines where day = d::date), 0)) order by d)
                      from generate_series(v_today - 6, v_today, interval '1 day') d),
      'waiting_orders', (select count(*) from pos.sales s where s.status = 'placed'
                           and exists (select 1 from pos.sale_lines l where l.sale_id = s.id and l.removed_at is null
                                         and l.floor_id = any(v_deps))),
      'unread_alerts', (select count(*) from pos.notifications where recipient_id = v_user and read_at is null)
    )
  );
end $$;

-- ---------- who can see which sales ----------
-- "See sales in every department": all. "See all sales in their departments": sales with an
-- item from one of their departments. "See their own sales": ones they sold or took payment for.
create function pos.can_see_sale(p_user uuid, p_sale pos.sales) returns boolean
language sql stable security definer set search_path = '' as $$
  select pos.user_has_permission(p_user, 'sales.view_all')
      or (pos.user_has_permission(p_user, 'sales.view_floor')
          and exists (select 1 from pos.sale_lines l where l.sale_id = p_sale.id and l.floor_id = any(pos.user_departments(p_user))))
      or (pos.user_has_permission(p_user, 'sales.view_own') and p_user in (p_sale.sold_by, p_sale.checked_out_by))
      or (pos.user_has_permission(p_user, 'sales.refund')
          and exists (select 1 from pos.sale_lines l where l.sale_id = p_sale.id and l.floor_id = any(pos.user_departments(p_user))));
$$;
revoke execute on function pos.can_see_sale(uuid, pos.sales) from public, anon;

-- One page of sales, newest first, plus the count and value of everything that matches.
create function public.pos_sales(
  p_search text default null,
  p_from   date default null,
  p_to     date default null,
  p_status text default 'all',      -- 'all', 'paid', 'cancelled', 'returned', 'unpaid'
  p_limit  int default 50,
  p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_staff();
  v_q     text := trim(coalesce(p_search, ''));
  v_ql    text := lower(trim(coalesce(p_search, '')));
  v_phone text := pos.normalize_phone(p_search);
  -- Worked out once, not per sale (see pos.can_see_sale for the same rules).
  v_all   boolean := pos.has_permission('sales.view_all');
  v_dept  boolean := pos.has_permission('sales.view_floor') or pos.has_permission('sales.refund');
  v_own   boolean := pos.has_permission('sales.view_own');
  v_deps  smallint[] := pos.user_departments(auth.uid());
begin
  if not (v_all or v_dept or v_own) then
    raise exception 'You don''t have permission to see sales.' using hint = 'not_allowed';
  end if;
  return (
    with matches as (
      select s.*, c.name as customer_name, c.phone as customer_phone,
             coalesce(st.display_name, s.sold_by_name) as sold_by_label,
             (select display_name from pos.staff where user_id = s.checked_out_by) as cashier,
             coalesce((select sum(refund_kobo) from pos.returns rt where rt.sale_id = s.id), 0) as refunded
      from pos.sales s
      left join pos.customers c on c.id = s.customer_id
      left join pos.staff st on st.user_id = s.sold_by
      where not s.is_branch_transfer
        and (p_from is null or coalesce(s.paid_at, s.placed_at) >= p_from::timestamp at time zone 'Africa/Lagos')
        and (p_to is null or coalesce(s.paid_at, s.placed_at) < (p_to + 1)::timestamp at time zone 'Africa/Lagos')
        and (p_status = 'all'
             or (p_status = 'paid' and s.status = 'paid')
             or (p_status = 'cancelled' and s.status = 'cancelled')
             or (p_status = 'returned' and exists (select 1 from pos.returns rt where rt.sale_id = s.id))
             or (p_status = 'unpaid' and s.legacy_payment_status in ('Due', 'Partial')))
        and (v_q = ''
             or s.receipt_no = v_q or s.receipt_no = upper(v_q) or s.legacy_invoice_no = v_q
             or (v_phone is not null and c.phone = v_phone)
             or lower(coalesce(c.name, '')) like '%' || v_ql || '%'
             or exists (select 1 from pos.sale_lines l left join pos.unit_identifiers ui on ui.unit_id = l.unit_id
                        where l.sale_id = s.id and (ui.code = v_q or lower(l.item_name) like '%' || v_ql || '%')))
        and (v_all
             or (v_dept and exists (select 1 from pos.sale_lines l where l.sale_id = s.id and l.floor_id = any(v_deps)))
             or (v_own and v_user in (s.sold_by, s.checked_out_by)))
    )
    select jsonb_build_object(
      'total', (select count(*) from matches),
      'value_kobo', (select coalesce(sum(total_kobo - refunded), 0) from matches where status = 'paid'),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'receipt_no', m.receipt_no, 'at', coalesce(m.paid_at, m.placed_at), 'status', m.status,
                 'source', m.source, 'customer', m.customer_name, 'sold_by', m.sold_by_label, 'cashier', m.cashier,
                 'total_kobo', m.total_kobo, 'refunded_kobo', m.refunded,
                 'unpaid', m.legacy_payment_status in ('Due', 'Partial'),
                 'items', (select coalesce(sum(qty), 0) from pos.sale_lines l where l.sale_id = m.id and l.removed_at is null),
                 'methods', (select string_agg(distinct p.method, ', ') from pos.sale_payments p where p.sale_id = m.id))
                 order by coalesce(m.paid_at, m.placed_at) desc)
               from (select * from matches order by coalesce(paid_at, placed_at) desc
                     limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)) m), '[]'::jsonb)
    )
  );
end $$;

-- One sale: the receipt, each item with how many have been returned, and the returns.
create function public.pos_sale(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
  v_sale pos.sales;
begin
  select * into v_sale from pos.sales where id = p_id;
  if not found or not pos.can_see_sale(v_user, v_sale) then
    raise exception 'Sale not found.' using hint = 'not_found';
  end if;
  return jsonb_build_object(
    'id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'status', v_sale.status, 'source', v_sale.source,
    'placed_at', v_sale.placed_at, 'paid_at', v_sale.paid_at,
    'cancelled_at', v_sale.cancelled_at, 'cancel_reason', v_sale.cancel_reason,
    'unpaid_in_old_system', v_sale.legacy_payment_status in ('Due', 'Partial'),
    'sold_by', coalesce((select display_name from pos.staff where user_id = v_sale.sold_by), v_sale.sold_by_name),
    'checked_out_by', (select display_name from pos.staff where user_id = v_sale.checked_out_by),
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from pos.customers c where c.id = v_sale.customer_id),
    'subtotal_kobo', v_sale.subtotal_kobo, 'discount_kobo', v_sale.discount_kobo, 'total_kobo', v_sale.total_kobo,
    'note', v_sale.receipt_note,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                'id', l.id, 'item_id', l.item_id, 'name', l.item_name, 'qty', l.qty, 'unit_price_kobo', l.unit_price_kobo,
                'discount_kobo', l.line_discount_kobo, 'price_tier', l.price_tier,
                'department', (select name from pos.floors where id = l.floor_id),
                'codes', (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = l.unit_id),
                'returned', (select coalesce(sum(rl.qty), 0) from pos.return_lines rl where rl.sale_line_id = l.id))
                order by l.id)
              from pos.sale_lines l where l.sale_id = p_id and l.removed_at is null), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', p.method, 'account', a.name, 'amount_kobo', p.amount_kobo) order by p.id)
                          from pos.sale_payments p left join pos.payment_accounts a on a.id = p.account_id where p.sale_id = p_id), '[]'::jsonb),
    'returns', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', rt.id, 'at', rt.created_at, 'reason', rt.reason, 'refund_kobo', rt.refund_kobo,
                  'refund_method', rt.refund_method, 'account', (select name from pos.payment_accounts where id = rt.refund_account_id),
                  'by', (select display_name from pos.staff where user_id = rt.processed_by),
                  'items', (select jsonb_agg(jsonb_build_object('name', l.item_name, 'qty', rl.qty, 'outcome', rl.outcome))
                            from pos.return_lines rl join pos.sale_lines l on l.id = rl.sale_line_id where rl.return_id = rt.id))
                  order by rt.created_at)
                from pos.returns rt where rt.sale_id = p_id), '[]'::jsonb),
    'refunded_kobo', coalesce((select sum(refund_kobo) from pos.returns where sale_id = p_id), 0),
    'can_return', v_sale.status = 'paid' and not v_sale.is_branch_transfer and pos.has_permission('sales.refund')
                  and exists (select 1 from pos.sale_lines l where l.sale_id = p_id and l.floor_id = any(pos.user_departments(v_user)))
  );
end $$;

-- Return items from a paid sale (new or from the old system). The person needs "Refund or
-- return a paid sale" and access to the sale's departments.
create function public.pos_return_sale(
  p_sale_id           uuid,
  p_lines             jsonb,
  p_reason            text,
  p_refund_kobo       bigint default 0,
  p_refund_method     text default null,
  p_refund_account_id smallint default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('sales.refund');
begin
  if not exists (select 1 from pos.sale_lines l where l.sale_id = p_sale_id
                 and l.floor_id = any(pos.user_departments(v_user))) then
    raise exception 'This sale has no items from your departments.' using hint = 'no_department_access';
  end if;
  if exists (select 1 from pos.sales where id = p_sale_id and is_branch_transfer) then
    raise exception 'This was stock sent to our branch, not a sale.' using hint = 'branch_transfer';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) r
             join pos.sale_lines l on l.id = (r->>'sale_line_id')::bigint
             where l.item_id is null and r->>'outcome' = 'back_in_stock') then
    raise exception 'One of these items isn''t in today''s product list, so it can''t go back into stock. Mark it faulty, or add the product first.'
      using hint = 'unknown_item';
  end if;
  return pos.return_sale(p_sale_id, p_lines, p_reason, p_refund_kobo, p_refund_method, p_refund_account_id);
end $$;

-- Everything about one phone, by IMEI or serial: what it is, where it is now, when it came in,
-- and if sold, when, to whom and whether it's still under warranty. Any staff member can look
-- up a phone (customers come back to any till).
create function public.pos_lookup_imei(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_staff();
  v_unit  pos.phone_units;
  v_item  pos.items;
  v_sale  pos.sales;
  v_line  pos.sale_lines;
  v_days  int;
begin
  select u.* into v_unit from pos.unit_identifiers ui join pos.phone_units u on u.id = ui.unit_id where ui.code = trim(p_code);
  if not found then
    return null;
  end if;
  select * into v_item from pos.items where id = v_unit.item_id;
  select l.* into v_line from pos.sale_lines l join pos.sales s on s.id = l.sale_id
  where l.unit_id = v_unit.id and l.removed_at is null and s.status = 'paid'
  order by s.paid_at desc limit 1;
  if v_line.id is not null then
    select * into v_sale from pos.sales where id = v_line.sale_id;
  end if;
  v_days := coalesce(v_item.warranty_days, (select warranty_days from pos.categories where id = v_item.category_id));

  return jsonb_build_object(
    'item_id', v_item.id, 'name', v_item.name,
    'codes', (select jsonb_agg(code order by slot) from pos.unit_identifiers where unit_id = v_unit.id),
    'status', v_unit.status, 'department', (select name from pos.floors where id = v_unit.floor_id),
    'received_at', v_unit.received_at,
    'purchase', (select jsonb_build_object('id', d.id, 'ref_no', d.ref_no, 'supplier', s.name)
                 from pos.stock_movements m join pos.deliveries d on d.id::text = m.ref_id
                 left join pos.suppliers s on s.id = d.supplier_id
                 where m.unit_id = v_unit.id and m.ref_type = 'delivery' limit 1),
    'sale', case when v_sale.id is null then null else jsonb_build_object(
              'id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'paid_at', v_sale.paid_at,
              'price_kobo', v_line.unit_price_kobo - v_line.line_discount_kobo,
              'sold_by', coalesce((select display_name from pos.staff where user_id = v_sale.sold_by), v_sale.sold_by_name),
              'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from pos.customers c where c.id = v_sale.customer_id),
              'can_open', pos.can_see_sale(v_user, v_sale)) end,
    'warranty_days', v_days,
    'warranty_until', case when v_sale.id is not null and v_days > 0
                           then ((v_sale.paid_at at time zone 'Africa/Lagos')::date + v_days) end
  );
end $$;

revoke execute on function
  public.pos_sales(text, date, date, text, int, int), public.pos_sale(uuid),
  public.pos_return_sale(uuid, jsonb, text, bigint, text, smallint), public.pos_lookup_imei(text)
from public, anon;
grant execute on function
  public.pos_sales(text, date, date, text, int, int), public.pos_sale(uuid),
  public.pos_return_sale(uuid, jsonb, text, bigint, text, smallint), public.pos_lookup_imei(text)
to authenticated;

-- Receipts: old-system sales have no seller on record, and "no seller" must not mean "anyone".
create or replace function public.pos_receipt(p_sale_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
  v_sale pos.sales;
begin
  select * into v_sale from pos.sales where id = p_sale_id;
  if not found then
    raise exception 'Receipt not found.' using hint = 'not_found';
  end if;
  if v_sale.sold_by is distinct from v_user and not pos.can_see_sale(v_user, v_sale) and not exists (
       select 1 from pos.sale_lines l where l.sale_id = p_sale_id and l.floor_id = any(pos.user_departments(v_user))
         and pos.user_has_permission(v_user, 'sales.checkout')) then
    raise exception 'You don''t have access to this receipt.' using hint = 'not_allowed';
  end if;

  return jsonb_build_object(
    'business', (select value from pos.settings where key = 'business'),
    'sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'status', v_sale.status,
    'placed_at', v_sale.placed_at, 'paid_at', v_sale.paid_at,
    'sold_by', coalesce((select display_name from pos.staff where user_id = v_sale.sold_by), v_sale.sold_by_name),
    'checked_out_by', (select display_name from pos.staff where user_id = v_sale.checked_out_by),
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from pos.customers c where c.id = v_sale.customer_id),
    'lines', (select jsonb_agg(jsonb_build_object(
                'name', l.item_name, 'qty', l.qty, 'unit_price_kobo', l.unit_price_kobo,
                'discount_kobo', coalesce(l.line_discount_kobo, 0), 'price_tier', l.price_tier,
                'codes', (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = l.unit_id),
                'warranty_days', i.warranty_days) order by l.id)
              from pos.sale_lines l left join pos.items i on i.id = l.item_id
              where l.sale_id = p_sale_id and l.removed_at is null),
    'subtotal_kobo', v_sale.subtotal_kobo, 'discount_kobo', v_sale.discount_kobo, 'total_kobo', v_sale.total_kobo,
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                  'method', p.method, 'account', a.name, 'amount_kobo', p.amount_kobo) order by p.id)
                from pos.sale_payments p left join pos.payment_accounts a on a.id = p.account_id
                where p.sale_id = p_sale_id), '[]'::jsonb),
    'note', v_sale.receipt_note
  );
end $$;
