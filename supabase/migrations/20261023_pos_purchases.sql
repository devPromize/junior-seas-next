-- POS step 10: Purchases (D-036).
--
-- "Receive a delivery" becomes Purchases, the name staff already use. A purchase has a number
-- that carries on from the old system (PO2026/0347…), a supplier picked from the list (or added
-- on the spot), its items, and optional photos or PDFs of the supplier's receipt.
-- The old system's 344 purchases and 62 suppliers are brought in as history. They don't touch
-- stock: today's stock already came over as opening stock.

-- ---------- suppliers ----------
alter table pos.suppliers add column legacy_contact_ids text[] not null default '{}';
alter table pos.suppliers add column is_active boolean not null default true;

-- ---------- purchases (the deliveries table, now with a number and history fields) ----------
alter table pos.deliveries add column ref_no text unique;
alter table pos.deliveries add column legacy_id int unique;
alter table pos.deliveries add column received_by_name text;          -- for history from the old system
alter table pos.deliveries add column amount_paid_kobo bigint;         -- old system only, for now
alter table pos.deliveries alter column received_by drop not null;
alter table pos.deliveries add constraint deliveries_received_by_check
  check (received_by is not null or legacy_id is not null);

alter table pos.delivery_lines alter column item_id drop not null;
alter table pos.delivery_lines add column item_name text;              -- as written at the time
alter table pos.delivery_lines add column new_price_kobo bigint check (new_price_kobo >= 0);   -- selling price set on arrival
alter table pos.delivery_lines alter column qty type numeric(12,2);    -- the old system had part quantities

-- Photos or PDFs of the supplier's receipt. Uploaded first (so a photo can be taken before
-- the purchase is typed in), then linked to the purchase when it's saved.
create table pos.purchase_documents (
  id           uuid primary key default gen_random_uuid(),
  delivery_id  uuid references pos.deliveries(id),
  path         text not null unique,       -- in the purchase-documents storage bucket
  content_type text not null,
  size_bytes   int,
  uploaded_by  uuid not null references auth.users(id),
  uploaded_at  timestamptz not null default now()
);
alter table pos.purchase_documents enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('purchase-documents', 'purchase-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- Storage checks run as the signed-in user, so they need a door into the permission check.
create function public.pos_can_handle_purchases() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pos.staff where user_id = auth.uid() and is_active)
     and (pos.has_permission('stock.receive') or pos.has_permission('costs.view'));
$$;
revoke execute on function public.pos_can_handle_purchases() from public, anon;
grant execute on function public.pos_can_handle_purchases() to authenticated;

create policy "purchase documents: staff who handle purchases can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'purchase-documents' and public.pos_can_handle_purchases());
create policy "purchase documents: staff who handle purchases can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'purchase-documents' and public.pos_can_handle_purchases());

-- PO2026/0347: carries on from the old system's numbering, restarting each year.
create function pos.next_purchase_no() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year text := to_char(now() at time zone 'Africa/Lagos', 'YYYY');
  v_n    int;
begin
  perform pg_advisory_xact_lock(hashtext('pos.next_purchase_no'));
  select coalesce(max(substring(ref_no from '^PO' || v_year || '/(\d+)$')::int), 0) + 1 into v_n
  from pos.deliveries where ref_no like 'PO' || v_year || '/%';
  return 'PO' || v_year || '/' || lpad(v_n::text, 4, '0');
end $$;
revoke execute on function pos.next_purchase_no() from public, anon;

-- ---------- bring in the old system's suppliers and purchases ----------
-- Suppliers: one per business name. Names that differ only in punctuation, spacing or "LTD"
-- are the same supplier (e.g. "GODSWILL COMM LTD" and "GOD'SWILL COMM").
create function pos.supplier_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(upper(coalesce(p_name, '')), '\m(LTD|LIMITED|NIG|NIGERIA)\M', '', 'g'), '[^A-Z0-9]', '', 'g');
$$;

with raw as (
  select payload p from pos_import.raw_rows where entity = 'suppliers'
), named as (
  select upper(trim(both ', ' from replace(coalesce(nullif(trim(p->>'supplier_business_name'), ''), p->>'name'), '&amp;', '&'))) as name,
         nullif(regexp_replace(coalesce(p->>'mobile', ''), '[^0-9+]', '', 'g'), '') as phone,
         p->>'contact_id' as contact_id
  from raw
), grouped as (
  select pos.supplier_key(name) as key, min(name) as name,
         (array_agg(phone order by phone) filter (where phone is not null and length(phone) between 10 and 14))[1] as phone,
         array_agg(contact_id) as ids
  from named where pos.supplier_key(name) <> '' group by 1
)
insert into pos.suppliers (name, phone, legacy_contact_ids)
select g.name, g.phone, g.ids from grouped g
where not exists (select 1 from pos.suppliers s where pos.supplier_key(s.name) = g.key);

-- Suppliers named on purchases but missing from the supplier list.
insert into pos.suppliers (name)
select distinct on (pos.supplier_key(n)) n
from (select upper(trim(both ', ' from replace(coalesce(nullif(trim(payload->>'supplier_business_name'), ''), payload->>'name'), '&amp;', '&'))) n
      from pos_import.raw_rows where entity = 'purchases') x
where pos.supplier_key(n) <> ''
  and not exists (select 1 from pos.suppliers s where pos.supplier_key(s.name) = pos.supplier_key(x.n));

-- Purchases. "₦ 2,059,500.00" -> 205950000 kobo.
create function pos.legacy_kobo(p_text text) returns bigint
language sql immutable set search_path = '' as $$
  select round(nullif(regexp_replace(coalesce(p_text, ''), '[^0-9.]', '', 'g'), '')::numeric * 100)::bigint;
$$;

insert into pos.deliveries (floor_id, supplier_id, ref_no, legacy_id, note, total_cost_kobo, received_by,
                            received_by_name, received_at, amount_paid_kobo)
select f.id,
       (select s.id from pos.suppliers s
        where pos.supplier_key(s.name) = pos.supplier_key(coalesce(nullif(trim(p->>'supplier_business_name'), ''), p->>'name'))
        order by s.id limit 1),
       p->>'ref_no', (p->>'id')::int, 'Brought over from the old system',
       pos.legacy_kobo(p->>'final_total'), null, nullif(trim(p->>'added_by'), ''),
       to_timestamp(p->>'transaction_date', 'DD-MM-YYYY HH12:MI AM')::timestamp at time zone 'Africa/Lagos',
       pos.legacy_kobo(p->>'amount_paid')
from (select payload p from pos_import.raw_rows where entity = 'purchases') x
join pos.floors f on f.id = case
  when replace(p->>'location_name', '&amp;', '&') = 'MOBILE PHONES' then (select id from pos.floors where code = 'phones')
  when replace(p->>'location_name', '&amp;', '&') = 'SPARE PARTS & REPAIRS' then (select id from pos.floors where code = 'spare_parts')
  else (select id from pos.floors where code = 'accessories') end
on conflict (legacy_id) do nothing;

insert into pos.delivery_lines (delivery_id, item_id, item_name, qty, unit_cost_kobo)
select d.id,
       coalesce((select i.id from pos.items i where i.sku = p->>'sub_sku'),
                (select i.id from pos.items i where i.name = upper(replace(p->>'product_name', '&amp;', '&')) order by i.id limit 1)),
       upper(replace(p->>'product_name', '&amp;', '&')),
       nullif(regexp_replace(p->>'purchase_qty', '[^0-9.]', '', 'g'), '')::numeric,
       pos.legacy_kobo(p->>'unit_purchase_price')
from (select payload p from pos_import.raw_rows where entity = 'purchase_lines') x
join pos.deliveries d on d.legacy_id = (p->>'transaction_id')::int
where nullif(regexp_replace(p->>'purchase_qty', '[^0-9.]', '', 'g'), '')::numeric > 0;

drop function pos.legacy_kobo(text);

-- ---------- entry points ----------

create function pos.require_purchase_access() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
begin
  if not public.pos_can_handle_purchases() then
    raise exception 'You don''t have permission to see purchases.' using hint = 'not_allowed';
  end if;
  return v_user;
end $$;
revoke execute on function pos.require_purchase_access() from public, anon;

create function public.pos_suppliers() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_purchase_access();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'phone', s.phone,
      'purchases', (select count(*) from pos.deliveries d where d.supplier_id = s.id),
      'last_purchase_at', (select max(received_at) from pos.deliveries d where d.supplier_id = s.id))
      order by (select max(received_at) from pos.deliveries d where d.supplier_id = s.id) desc nulls last, s.name)
    from pos.suppliers s where s.is_active
  ), '[]'::jsonb);
end $$;

-- Add (p_id null) or update a supplier.
create function public.pos_save_supplier(p_id bigint, p_name text, p_phone text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('stock.receive');
  v_name text := upper(nullif(trim(p_name), ''));
  v_id   bigint;
begin
  if v_name is null then
    raise exception 'Give the supplier a name.' using hint = 'name_required';
  end if;
  select id into v_id from pos.suppliers
  where pos.supplier_key(name) = pos.supplier_key(v_name) and id is distinct from p_id limit 1;
  if v_id is not null then
    raise exception 'There''s already a supplier called %.', (select name from pos.suppliers where id = v_id)
      using hint = 'duplicate_supplier';
  end if;
  if p_id is null then
    insert into pos.suppliers (name, phone) values (v_name, nullif(trim(p_phone), '')) returning id into v_id;
  else
    update pos.suppliers set name = v_name, phone = nullif(trim(p_phone), '') where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'name', v_name);
end $$;

-- A photo or PDF has been uploaded to storage: record it (not yet linked to a purchase).
create function public.pos_add_purchase_document(p_path text, p_content_type text, p_size_bytes int,
                                                 p_delivery_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_purchase_access();
  v_id   uuid;
begin
  if not exists (select 1 from storage.objects where bucket_id = 'purchase-documents' and name = p_path) then
    raise exception 'That file wasn''t uploaded. Try again.' using hint = 'not_uploaded';
  end if;
  insert into pos.purchase_documents (delivery_id, path, content_type, size_bytes, uploaded_by)
  values (p_delivery_id, p_path, p_content_type, p_size_bytes, v_user) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create function public.pos_purchases(
  p_search   text default null,
  p_supplier bigint default null,
  p_limit    int default 50,
  p_offset   int default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps  smallint[] := pos.user_departments(pos.require_purchase_access());
  v_costs boolean := pos.has_permission('costs.view');
  v_q     text := lower(trim(coalesce(p_search, '')));
begin
  return (
    with matches as (
      select d.*, s.name as supplier, f.name as department,
             coalesce(st.display_name, d.received_by_name) as received_by_label
      from pos.deliveries d
      join pos.floors f on f.id = d.floor_id
      left join pos.suppliers s on s.id = d.supplier_id
      left join pos.staff st on st.user_id = d.received_by
      where d.floor_id = any(v_deps)
        and (p_supplier is null or d.supplier_id = p_supplier)
        and (v_q = '' or lower(coalesce(d.ref_no, '')) like '%' || v_q || '%' or lower(coalesce(s.name, '')) like '%' || v_q || '%'
             or lower(coalesce(d.supplier_ref, '')) like '%' || v_q || '%'
             or exists (select 1 from pos.delivery_lines l where l.delivery_id = d.id and lower(l.item_name) like '%' || v_q || '%'))
    )
    select jsonb_build_object(
      'total', (select count(*) from matches),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'ref_no', m.ref_no, 'received_at', m.received_at, 'supplier', m.supplier,
                 'supplier_ref', m.supplier_ref, 'department', m.department, 'received_by', m.received_by_label,
                 'total_cost_kobo', case when v_costs then m.total_cost_kobo end,
                 'items', (select count(*) from pos.delivery_lines l where l.delivery_id = m.id),
                 'pieces', (select coalesce(sum(qty), 0) from pos.delivery_lines l where l.delivery_id = m.id),
                 'documents', (select count(*) from pos.purchase_documents pd where pd.delivery_id = m.id),
                 'is_legacy', m.legacy_id is not null) order by m.received_at desc)
               from (select * from matches order by received_at desc
                     limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)) m), '[]'::jsonb)
    )
  );
end $$;

create function public.pos_purchase(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps  smallint[] := pos.user_departments(pos.require_purchase_access());
  v_costs boolean := pos.has_permission('costs.view');
  v_d     pos.deliveries;
begin
  select * into v_d from pos.deliveries where id = p_id;
  if not found or not v_d.floor_id = any(v_deps) then
    raise exception 'Purchase not found.' using hint = 'not_found';
  end if;
  return jsonb_build_object(
    'id', v_d.id, 'ref_no', v_d.ref_no, 'received_at', v_d.received_at, 'supplier_ref', v_d.supplier_ref,
    'note', v_d.note, 'is_legacy', v_d.legacy_id is not null,
    'supplier', (select jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) from pos.suppliers s where s.id = v_d.supplier_id),
    'department', (select name from pos.floors where id = v_d.floor_id),
    'received_by', coalesce((select display_name from pos.staff where user_id = v_d.received_by), v_d.received_by_name),
    'total_cost_kobo', case when v_costs then v_d.total_cost_kobo end,
    'amount_paid_kobo', case when v_costs then v_d.amount_paid_kobo end,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                'item_id', l.item_id, 'name', coalesce(i.name, l.item_name), 'qty', l.qty,
                'unit_cost_kobo', case when v_costs then l.unit_cost_kobo end, 'new_price_kobo', l.new_price_kobo,
                'codes', (select jsonb_agg(ui.code order by ui.code) from pos.stock_movements m
                          join pos.unit_identifiers ui on ui.unit_id = m.unit_id and ui.slot = 1
                          where m.ref_type = 'delivery' and m.ref_id = v_d.id::text and m.item_id = l.item_id))
                order by l.id)
              from pos.delivery_lines l left join pos.items i on i.id = l.item_id where l.delivery_id = v_d.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', pd.id, 'path', pd.path, 'content_type', pd.content_type,
                             'uploaded_at', pd.uploaded_at) order by pd.uploaded_at)
                           from pos.purchase_documents pd where pd.delivery_id = v_d.id), '[]'::jsonb)
  );
end $$;

-- ---------- recording a purchase ----------
-- Replaces pos_receive_stock. Supplier is picked by id (add new ones with pos_save_supplier).
-- p_lines: [{ "item_id": 12, "qty": 10, "unit_cost_kobo": 150000, "new_price_kobo": 250000 },
--           { "item_id": 40, "unit_cost_kobo": 18000000, "codes": ["356..", "356../357.."] }]
drop function public.pos_receive_stock(smallint, jsonb, text, text, text);

create function public.pos_record_purchase(
  p_floor_id     smallint,
  p_lines        jsonb,
  p_supplier_id  bigint default null,
  p_supplier_ref text default null,
  p_note         text default null,
  p_document_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('stock.receive');
  v_delivery uuid;
  v_ref      text;
  v_line     jsonb;
  v_item     pos.items;
  v_qty      int;
  v_cost     bigint;
  v_price    bigint;
  v_entry    text;
  v_codes    text[];
  v_code     text;
  v_slot     int;
  v_unit     uuid;
  v_units    int := 0;
  v_pieces   int := 0;
  v_total    bigint := 0;
  v_seen     text[] := '{}';
  v_where    text;
begin
  perform pos.require_department(p_floor_id);
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one product to the purchase.' using hint = 'empty_delivery';
  end if;
  if p_supplier_id is not null and not exists (select 1 from pos.suppliers where id = p_supplier_id) then
    raise exception 'Unknown supplier.' using hint = 'bad_supplier';
  end if;

  v_ref := pos.next_purchase_no();
  insert into pos.deliveries (floor_id, supplier_id, supplier_ref, note, received_by, ref_no)
  values (p_floor_id, p_supplier_id, nullif(trim(p_supplier_ref), ''), nullif(trim(p_note), ''), v_user, v_ref)
  returning id into v_delivery;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from pos.items where id = (v_line->>'item_id')::bigint;
    if not found then
      raise exception 'One of the products in this purchase doesn''t exist.' using hint = 'bad_item';
    end if;
    v_cost := nullif((v_line->>'unit_cost_kobo')::bigint, 0);
    if v_cost is not null and v_cost < 0 then
      raise exception 'Cost can''t be negative.' using hint = 'bad_cost';
    end if;
    v_price := (v_line->>'new_price_kobo')::bigint;
    if v_price is not null and v_price <> v_item.price_kobo then
      if not pos.has_permission('prices.edit') then
        raise exception 'You don''t have permission to change prices (%).', v_item.name using hint = 'not_allowed';
      end if;
      if v_price < 0 then
        raise exception 'Price can''t be negative.' using hint = 'bad_price';
      end if;
    else
      v_price := null;
    end if;

    if v_item.tracks_imei then
      if jsonb_typeof(v_line->'codes') is distinct from 'array' or jsonb_array_length(v_line->'codes') = 0 then
        raise exception 'Scan the IMEI or serial number of each % received.', v_item.name using hint = 'imei_required';
      end if;
      v_qty := 0;
      for v_entry in select jsonb_array_elements_text(v_line->'codes') loop
        v_codes := array(select trim(c) from regexp_split_to_table(v_entry, '[/,\s]+') c where trim(c) <> '');
        if cardinality(v_codes) = 0 then continue; end if;
        if cardinality(v_codes) > 2 then
          raise exception 'A phone has at most two IMEIs (got "%").', v_entry using hint = 'bad_imei';
        end if;
        insert into pos.phone_units (item_id, floor_id, status, cost_kobo, received_at)
        values (v_item.id, p_floor_id, 'in_stock', v_cost, now()) returning id into v_unit;
        v_slot := 0;
        foreach v_code in array v_codes loop
          v_slot := v_slot + 1;
          if v_code = any(v_seen) then
            raise exception '% is in this purchase twice.', v_code using hint = 'duplicate_imei';
          end if;
          v_where := null;
          select format('%s (%s)', i.name, replace(u.status, '_', ' ')) into v_where
          from pos.unit_identifiers ui join pos.phone_units u on u.id = ui.unit_id join pos.items i on i.id = u.item_id
          where ui.code = v_code;
          if v_where is not null then
            raise exception '% is already in the system: %.', v_code, v_where using hint = 'duplicate_imei';
          end if;
          if pos.identifier_kind(v_code) = 'serial' and v_code !~ '^[A-Za-z0-9-]{5,30}$' then
            raise exception '"%" doesn''t look like an IMEI (14 to 17 digits) or a serial number.', v_code using hint = 'bad_imei';
          end if;
          insert into pos.unit_identifiers (code, unit_id, slot, kind) values (v_code, v_unit, v_slot, pos.identifier_kind(v_code));
          v_seen := v_seen || v_code;
        end loop;
        insert into pos.stock_movements (item_id, floor_id, qty_change, reason, unit_id, ref_type, ref_id, actor_id)
        values (v_item.id, p_floor_id, 1, 'purchase', v_unit, 'delivery', v_delivery::text, v_user);
        v_qty := v_qty + 1;
      end loop;
      v_units := v_units + v_qty;
    else
      v_qty := (v_line->>'qty')::int;
      if v_qty is null or v_qty < 1 then
        raise exception 'Enter how many % were received.', v_item.name using hint = 'bad_qty';
      end if;
      insert into pos.stock_movements (item_id, floor_id, qty_change, reason, ref_type, ref_id, actor_id)
      values (v_item.id, p_floor_id, v_qty, 'purchase', 'delivery', v_delivery::text, v_user);
    end if;

    insert into pos.delivery_lines (delivery_id, item_id, item_name, qty, unit_cost_kobo, new_price_kobo)
    values (v_delivery, v_item.id, v_item.name, v_qty, v_cost, v_price);
    if v_cost is not null then
      update pos.items set cost_kobo = v_cost where id = v_item.id;   -- the latest cost
    end if;
    if v_price is not null then
      update pos.items set price_kobo = v_price where id = v_item.id;
      insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
      values (v_user, 'product_updated', 'item', v_item.id::text,
              jsonb_build_object('price_kobo', jsonb_build_object('from', v_item.price_kobo, 'to', v_price), 'purchase', v_ref));
    end if;
    v_pieces := v_pieces + v_qty;
    v_total := v_total + v_qty * coalesce(v_cost, 0);
  end loop;

  update pos.deliveries set total_cost_kobo = v_total where id = v_delivery;
  update pos.purchase_documents set delivery_id = v_delivery
  where id = any(coalesce(p_document_ids, '{}')) and delivery_id is null and uploaded_by = v_user;

  return jsonb_build_object('delivery_id', v_delivery, 'ref_no', v_ref, 'pieces', v_pieces, 'phones', v_units,
                            'total_cost_kobo', v_total);
end $$;

-- pos_product_options now lists suppliers with their ids.
create or replace function public.pos_product_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_product_access();
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'warranty_days', warranty_days) order by name)
                            from pos.categories), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from pos.brands), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.id)
                             from pos.floors f where f.id = any(pos.user_departments(auth.uid()))), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name)
                             order by (select max(received_at) from pos.deliveries d where d.supplier_id = s.id) desc nulls last, s.name)
                           from pos.suppliers s where s.is_active), '[]'::jsonb),
    'can', jsonb_build_object(
      'manage', pos.has_permission('products.manage'), 'prices', pos.has_permission('prices.edit'),
      'wholesale', pos.has_permission('prices.wholesale'), 'costs', pos.has_permission('costs.view'),
      'receive', pos.has_permission('stock.receive'), 'move', pos.has_permission('stock.transfer'),
      'adjust', pos.has_permission('stock.adjust'))
  );
end $$;

revoke execute on function
  public.pos_suppliers(), public.pos_save_supplier(bigint, text, text),
  public.pos_add_purchase_document(text, text, int, uuid),
  public.pos_purchases(text, bigint, int, int), public.pos_purchase(uuid),
  public.pos_record_purchase(smallint, jsonb, bigint, text, text, uuid[])
from public, anon;
grant execute on function
  public.pos_suppliers(), public.pos_save_supplier(bigint, text, text),
  public.pos_add_purchase_document(text, text, int, uuid),
  public.pos_purchases(text, bigint, int, int), public.pos_purchase(uuid),
  public.pos_record_purchase(smallint, jsonb, bigint, text, text, uuid[])
to authenticated;
