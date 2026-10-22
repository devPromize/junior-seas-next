-- POS step 9: products and stock.
--
-- Products: list, view (stock per department, phones in stock, history), add and edit. Each
-- field is guarded by its own permission: prices, wholesale prices and costs are separate.
-- Stock: receive a delivery (phones by IMEI or serial), move stock between departments, count
-- stock, and mark a phone faulty or missing. Every change is a stock movement, so stock levels
-- always add up to their history.

-- ---------- tidy the imported names ("&amp;" -> "&") ----------
-- Three categories exist twice (once with "&amp;"): move their products to the clean one.
update pos.items i set category_id = clean.id
from pos.categories dirty
join pos.categories clean on clean.name = replace(dirty.name, '&amp;', '&') and clean.id <> dirty.id
                         and clean.parent_id is not distinct from dirty.parent_id
where i.category_id = dirty.id;
delete from pos.categories dirty
using pos.categories clean
where clean.name = replace(dirty.name, '&amp;', '&') and clean.id <> dirty.id
  and clean.parent_id is not distinct from dirty.parent_id;
update pos.categories set name = replace(replace(replace(name, '&amp;', '&'), '&quot;', '"'), '&#039;', '''')
where name ~ '&(amp|quot|#039);';
update pos.items set name = replace(replace(replace(name, '&amp;', '&'), '&quot;', '"'), '&#039;', '''')
where name ~ '&(amp|quot|#039);';

-- ---------- new movement reasons and phone states ----------
alter table pos.stock_movements drop constraint stock_movements_reason_check;
alter table pos.stock_movements add constraint stock_movements_reason_check check (reason = any (array[
  'opening', 'sale', 'sale_cancelled', 'return', 'purchase', 'transfer_out', 'transfer_in',
  'adjustment', 'count', 'correction', 'repair_part', 'online_order']));
alter table pos.phone_units drop constraint phone_units_status_check;
alter table pos.phone_units add constraint phone_units_status_check check (status = any (array[
  'in_stock', 'held', 'sold', 'returned', 'faulty', 'missing', 'transferred_out']));

update pos.permissions set label = 'Move stock between departments',
  warning = 'They can move stock from one department to another. Every move is logged.' where code = 'stock.transfer';

-- ---------- suppliers, deliveries, moves ----------
create table pos.suppliers (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text,
  created_at timestamptz not null default now()
);
create unique index suppliers_name_key on pos.suppliers (lower(name));

create table pos.deliveries (
  id              uuid primary key default gen_random_uuid(),
  floor_id        smallint not null references pos.floors(id),
  supplier_id     bigint references pos.suppliers(id),
  supplier_ref    text,                                  -- the supplier's invoice number
  note            text,
  total_cost_kobo bigint not null default 0,
  received_by     uuid not null references auth.users(id),
  received_at     timestamptz not null default now()
);

create table pos.delivery_lines (
  id             bigint generated always as identity primary key,
  delivery_id    uuid not null references pos.deliveries(id),
  item_id        bigint not null references pos.items(id),
  qty            int not null check (qty > 0),
  unit_cost_kobo bigint check (unit_cost_kobo >= 0)
);

create table pos.transfers (
  id         uuid primary key default gen_random_uuid(),
  from_floor smallint not null references pos.floors(id),
  to_floor   smallint not null references pos.floors(id),
  note       text,
  moved_by   uuid not null references auth.users(id),
  moved_at   timestamptz not null default now(),
  check (from_floor <> to_floor)
);

alter table pos.suppliers enable row level security;
alter table pos.deliveries enable row level security;
alter table pos.delivery_lines enable row level security;
alter table pos.transfers enable row level security;

-- ---------- helpers ----------

-- Anyone who works with products or stock can look products up.
create function pos.require_product_access() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
begin
  if not (pos.has_permission('products.manage') or pos.has_permission('prices.edit')
          or pos.has_permission('prices.wholesale') or pos.has_permission('stock.receive')
          or pos.has_permission('stock.adjust') or pos.has_permission('stock.transfer')
          or pos.has_permission('costs.view')) then
    raise exception 'You don''t have permission to see products.' using hint = 'not_allowed';
  end if;
  return v_user;
end $$;

create function pos.require_department(p_floor_id smallint) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_floor_id is null or not p_floor_id = any(pos.user_departments(auth.uid())) then
    raise exception 'You don''t have access to %.',
      coalesce((select name from pos.floors where id = p_floor_id), 'that department') using hint = 'no_department_access';
  end if;
end $$;

-- "359123456789012" is an IMEI; "C02XK1ABJG5H" is a serial number.
create function pos.identifier_kind(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case when p_code ~ '^[0-9]{14,17}$' then 'imei' else 'serial' end;
$$;

-- ---------- products ----------

create function public.pos_product_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_product_access();
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'warranty_days', warranty_days) order by name)
                            from pos.categories), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from pos.brands), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.id)
                             from pos.floors f where f.id = any(pos.user_departments(auth.uid()))), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(name order by name) from pos.suppliers), '[]'::jsonb),
    'can', jsonb_build_object(
      'manage', pos.has_permission('products.manage'), 'prices', pos.has_permission('prices.edit'),
      'wholesale', pos.has_permission('prices.wholesale'), 'costs', pos.has_permission('costs.view'),
      'receive', pos.has_permission('stock.receive'), 'move', pos.has_permission('stock.transfer'),
      'adjust', pos.has_permission('stock.adjust'))
  );
end $$;

-- One page of the product list. Stock is shown for the departments this person can see.
create function public.pos_products(
  p_search     text default null,
  p_department smallint default null,
  p_category   bigint default null,
  p_status     text default 'active',     -- 'active', 'hidden' or 'all'
  p_stock      text default 'all',        -- 'all', 'in' or 'out'
  p_limit      int default 50,
  p_offset     int default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps  smallint[] := pos.user_departments(pos.require_product_access());
  v_costs boolean := pos.has_permission('costs.view');
  v_words text[] := regexp_split_to_array(lower(trim(coalesce(p_search, ''))), '\s+');
  v_code  text := trim(coalesce(p_search, ''));
begin
  if p_department is not null then
    v_deps := array(select unnest(v_deps) intersect select p_department);
  end if;
  return (
    with stock as (
      select l.item_id, sum(l.quantity) as qty,
             jsonb_object_agg(l.floor_id, l.quantity) as by_department
      from pos.stock_levels l where l.floor_id = any(v_deps) and l.quantity <> 0
      group by l.item_id
    ), matches as (
      select i.*, c.name as category, b.name as brand, coalesce(s.qty, 0) as qty, s.by_department
      from pos.items i
      left join pos.categories c on c.id = i.category_id
      left join pos.brands b on b.id = i.brand_id
      left join stock s on s.item_id = i.id
      where (p_status = 'all' or (p_status = 'active') = i.is_active)
        and (p_category is null or i.category_id = p_category)
        and (p_department is null or s.item_id is not null
             or exists (select 1 from pos.stock_levels l where l.item_id = i.id and l.floor_id = p_department))
        and (p_stock = 'all' or (p_stock = 'in') = (coalesce(s.qty, 0) > 0))
        and (v_code = ''
             or i.sku = v_code
             or exists (select 1 from pos.unit_identifiers ui join pos.phone_units u on u.id = ui.unit_id
                        where ui.code = v_code and u.item_id = i.id)
             or (select bool_and(lower(i.name || ' ' || i.sku || ' ' || coalesce(c.name, '') || ' ' || coalesce(b.name, '')) like '%' || w || '%')
                 from unnest(v_words) w))
    )
    select jsonb_build_object(
      'total', (select count(*) from matches),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'sku', m.sku, 'name', m.name, 'category', m.category, 'brand', m.brand,
                 'price_kobo', m.price_kobo, 'wholesale_price_kobo', m.wholesale_price_kobo,
                 'cost_kobo', case when v_costs then m.cost_kobo end,
                 'tracks_imei', m.tracks_imei, 'is_active', m.is_active, 'show_online', m.show_online,
                 'stock', m.qty, 'by_department', coalesce(m.by_department, '{}'::jsonb)) order by m.name)
               from (select * from matches order by name limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)) m), '[]'::jsonb)
    )
  );
end $$;

-- Everything about one product: details, stock per department, phones in stock, and history.
create function public.pos_product(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps  smallint[] := pos.user_departments(pos.require_product_access());
  v_costs boolean := pos.has_permission('costs.view');
  v_item  pos.items;
begin
  select * into v_item from pos.items where id = p_id;
  if not found then
    raise exception 'Product not found.' using hint = 'not_found';
  end if;
  return jsonb_build_object(
    'id', v_item.id, 'sku', v_item.sku, 'name', v_item.name,
    'category_id', v_item.category_id, 'brand_id', v_item.brand_id,
    'price_kobo', v_item.price_kobo, 'min_price_kobo', v_item.min_price_kobo,
    'wholesale_price_kobo', v_item.wholesale_price_kobo, 'wholesale_min_qty', v_item.wholesale_min_qty,
    'cost_kobo', case when v_costs then v_item.cost_kobo end,
    'tracks_imei', v_item.tracks_imei, 'warranty_days', v_item.warranty_days,
    'show_online', v_item.show_online, 'is_active', v_item.is_active,
    'stock', coalesce((select jsonb_agg(jsonb_build_object('department_id', f.id, 'department', f.name,
                         'qty', coalesce((select quantity from pos.stock_levels l where l.item_id = p_id and l.floor_id = f.id), 0))
                         order by f.id)
                       from pos.floors f where f.id = any(v_deps)), '[]'::jsonb),
    'phones', coalesce((select jsonb_agg(jsonb_build_object(
                  'unit_id', u.id, 'department_id', u.floor_id, 'status', u.status,
                  'codes', (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = u.id),
                  'cost_kobo', case when v_costs then u.cost_kobo end, 'received_at', u.received_at)
                  order by u.received_at desc nulls last)
                from pos.phone_units u
                where u.item_id = p_id and u.floor_id = any(v_deps) and u.status in ('in_stock', 'held', 'faulty', 'missing')), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h order by (h->>'at') desc) from (
                  select jsonb_build_object('at', m.created_at, 'reason', m.reason, 'qty', m.qty_change,
                           'department', f.name, 'by', s.display_name, 'note', m.note,
                           'code', (select ui.code from pos.unit_identifiers ui where ui.unit_id = m.unit_id and ui.slot = 1)) as h
                  from pos.stock_movements m join pos.floors f on f.id = m.floor_id
                  left join pos.staff s on s.user_id = m.actor_id
                  where m.item_id = p_id and m.floor_id = any(v_deps)
                  order by m.created_at desc limit 40) x), '[]'::jsonb)
  );
end $$;

-- Add (p_id null) or edit a product. Only the fields present in p_fields change, and each
-- change needs its own permission: products.manage for details, prices.edit for the selling
-- price, prices.wholesale for wholesale, costs.view to see or set the cost.
create function public.pos_save_product(p_id bigint, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user    uuid := pos.require_product_access();
  v_old     pos.items;
  v_new     pos.items;
  v_changed jsonb := '{}'::jsonb;
  v_key     text;
  v_cat     bigint;
  v_brand   bigint;
  v_sku     text;
  v_has_stock boolean;
begin
  if p_id is null then
    if not pos.has_permission('products.manage') then
      raise exception 'You don''t have permission to add products.' using hint = 'not_allowed';
    end if;
    v_old := null;
    v_new := row(null, null, '', null, null, 'piece', 0, null, null, false, false, null, null, true, null, now(), now(), null, null)::pos.items;
  else
    select * into v_old from pos.items where id = p_id for update;
    if not found then
      raise exception 'Product not found.' using hint = 'not_found';
    end if;
    v_new := v_old;
  end if;

  -- Category and brand can be chosen by id, or typed as a new name.
  if p_fields ? 'category_name' and nullif(trim(p_fields->>'category_name'), '') is not null then
    select id into v_cat from pos.categories where lower(name) = lower(trim(p_fields->>'category_name')) and parent_id is null;
    if v_cat is null then
      insert into pos.categories (name) values (upper(trim(p_fields->>'category_name'))) returning id into v_cat;
    end if;
    p_fields := p_fields || jsonb_build_object('category_id', v_cat);
  end if;
  if p_fields ? 'brand_name' and nullif(trim(p_fields->>'brand_name'), '') is not null then
    select id into v_brand from pos.brands where lower(name) = lower(trim(p_fields->>'brand_name'));
    if v_brand is null then
      insert into pos.brands (name) values (upper(trim(p_fields->>'brand_name'))) returning id into v_brand;
    end if;
    p_fields := p_fields || jsonb_build_object('brand_id', v_brand);
  end if;

  if p_fields ? 'name' then v_new.name := upper(trim(p_fields->>'name')); end if;
  if p_fields ? 'sku' then v_new.sku := nullif(trim(p_fields->>'sku'), ''); end if;
  if p_fields ? 'category_id' then v_new.category_id := (p_fields->>'category_id')::bigint; end if;
  if p_fields ? 'brand_id' then v_new.brand_id := (p_fields->>'brand_id')::bigint; end if;
  if p_fields ? 'price_kobo' then v_new.price_kobo := (p_fields->>'price_kobo')::bigint; end if;
  if p_fields ? 'min_price_kobo' then v_new.min_price_kobo := (p_fields->>'min_price_kobo')::bigint; end if;
  if p_fields ? 'wholesale_price_kobo' then v_new.wholesale_price_kobo := (p_fields->>'wholesale_price_kobo')::bigint; end if;
  if p_fields ? 'wholesale_min_qty' then v_new.wholesale_min_qty := (p_fields->>'wholesale_min_qty')::int; end if;
  if p_fields ? 'cost_kobo' then v_new.cost_kobo := coalesce((p_fields->>'cost_kobo')::bigint, 0); end if;
  if p_fields ? 'tracks_imei' then v_new.tracks_imei := (p_fields->>'tracks_imei')::boolean; end if;
  if p_fields ? 'warranty_days' then v_new.warranty_days := (p_fields->>'warranty_days')::int; end if;
  if p_fields ? 'show_online' then v_new.show_online := (p_fields->>'show_online')::boolean; end if;
  if p_fields ? 'is_active' then v_new.is_active := (p_fields->>'is_active')::boolean; end if;

  if nullif(v_new.name, '') is null then
    raise exception 'Give the product a name.' using hint = 'name_required';
  end if;
  if v_new.price_kobo is null or v_new.price_kobo < 0 then
    raise exception 'Set a selling price.' using hint = 'price_required';
  end if;
  if v_new.sku is null then
    loop   -- an internal barcode: 13 digits starting with 2 (reserved for in-store codes)
      v_sku := '2' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');
      exit when not exists (select 1 from pos.items where sku = v_sku);
    end loop;
    v_new.sku := v_sku;
  end if;
  if exists (select 1 from pos.items where sku = v_new.sku and id is distinct from p_id) then
    raise exception 'Another product already uses the barcode %.', v_new.sku using hint = 'duplicate_sku';
  end if;
  if v_new.wholesale_price_kobo is not null and v_new.wholesale_price_kobo > v_new.price_kobo then
    raise exception 'The wholesale price should be lower than the normal price.' using hint = 'bad_wholesale';
  end if;

  -- What changed, and is this person allowed to change it?
  for v_key in select key from jsonb_each(to_jsonb(v_new)) loop
    continue when v_key in ('updated_at', 'created_at', 'id');
    if v_old.id is null or to_jsonb(v_new)->v_key is distinct from to_jsonb(v_old)->v_key then
      v_changed := v_changed || jsonb_build_object(v_key, jsonb_build_object(
        'from', case when v_key = 'cost_kobo' and not pos.has_permission('costs.view') then null else to_jsonb(v_old)->v_key end,
        'to', to_jsonb(v_new)->v_key));
    end if;
  end loop;
  if v_old.id is not null then
    if (v_changed ?| array['name', 'sku', 'category_id', 'brand_id', 'tracks_imei', 'warranty_days', 'show_online', 'is_active'])
       and not pos.has_permission('products.manage') then
      raise exception 'You don''t have permission to edit product details.' using hint = 'not_allowed';
    end if;
    if (v_changed ?| array['price_kobo', 'min_price_kobo']) and not pos.has_permission('prices.edit') then
      raise exception 'You don''t have permission to change prices.' using hint = 'not_allowed';
    end if;
  end if;
  if (v_changed ?| array['wholesale_price_kobo', 'wholesale_min_qty'])
     and (v_new.wholesale_price_kobo is not null or v_old.id is not null)
     and not pos.has_permission('prices.wholesale') then
    raise exception 'You don''t have permission to set wholesale prices.' using hint = 'not_allowed';
  end if;
  if v_changed ? 'cost_kobo' and (v_new.cost_kobo <> 0 or v_old.id is not null) and not pos.has_permission('costs.view') then
    raise exception 'You don''t have permission to set cost prices.' using hint = 'not_allowed';
  end if;
  if v_old.id is not null and v_changed ? 'tracks_imei' then
    select exists (select 1 from pos.stock_levels where item_id = p_id and quantity <> 0)
        or exists (select 1 from pos.phone_units where item_id = p_id) into v_has_stock;
    if v_has_stock then
      raise exception 'This product already has stock, so "tracked by IMEI" can''t be changed.' using hint = 'has_stock';
    end if;
  end if;

  if v_old.id is null then
    insert into pos.items (sku, name, category_id, brand_id, unit, cost_kobo, price_kobo, min_price_kobo, tracks_imei,
                           show_online, warranty_days, is_active, wholesale_price_kobo, wholesale_min_qty)
    values (v_new.sku, v_new.name, v_new.category_id, v_new.brand_id, v_new.unit, v_new.cost_kobo, v_new.price_kobo,
            v_new.min_price_kobo, v_new.tracks_imei, v_new.show_online, v_new.warranty_days, v_new.is_active,
            v_new.wholesale_price_kobo, v_new.wholesale_min_qty)
    returning * into v_new;
  elsif v_changed <> '{}'::jsonb then
    update pos.items set sku = v_new.sku, name = v_new.name, category_id = v_new.category_id, brand_id = v_new.brand_id,
      cost_kobo = v_new.cost_kobo, price_kobo = v_new.price_kobo, min_price_kobo = v_new.min_price_kobo,
      tracks_imei = v_new.tracks_imei, show_online = v_new.show_online, warranty_days = v_new.warranty_days,
      is_active = v_new.is_active, wholesale_price_kobo = v_new.wholesale_price_kobo, wholesale_min_qty = v_new.wholesale_min_qty
    where id = p_id;
  end if;

  if v_changed <> '{}'::jsonb then
    insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
    values (v_user, case when v_old.id is null then 'product_added' else 'product_updated' end, 'item', v_new.id::text, v_changed);
  end if;
  return jsonb_build_object('id', v_new.id, 'sku', v_new.sku);
end $$;

-- ---------- receive a delivery ----------
-- p_lines: [{ "item_id": 12, "qty": 10, "unit_cost_kobo": 150000 },
--           { "item_id": 40, "unit_cost_kobo": 18000000, "codes": ["356..", "356../357.."] }]
-- For phones, each entry in "codes" is one phone: one IMEI or serial, or two IMEIs joined by "/".
create function public.pos_receive_stock(
  p_floor_id     smallint,
  p_lines        jsonb,
  p_supplier     text default null,
  p_supplier_ref text default null,
  p_note         text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('stock.receive');
  v_delivery uuid;
  v_supplier bigint;
  v_line     jsonb;
  v_item     pos.items;
  v_qty      int;
  v_cost     bigint;
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
    raise exception 'Add at least one product to the delivery.' using hint = 'empty_delivery';
  end if;

  if nullif(trim(p_supplier), '') is not null then
    select id into v_supplier from pos.suppliers where lower(name) = lower(trim(p_supplier));
    if v_supplier is null then
      insert into pos.suppliers (name) values (trim(p_supplier)) returning id into v_supplier;
    end if;
  end if;

  insert into pos.deliveries (floor_id, supplier_id, supplier_ref, note, received_by)
  values (p_floor_id, v_supplier, nullif(trim(p_supplier_ref), ''), nullif(trim(p_note), ''), v_user)
  returning id into v_delivery;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from pos.items where id = (v_line->>'item_id')::bigint;
    if not found then
      raise exception 'One of the products in this delivery doesn''t exist.' using hint = 'bad_item';
    end if;
    v_cost := nullif((v_line->>'unit_cost_kobo')::bigint, 0);
    if v_cost is not null and v_cost < 0 then
      raise exception 'Cost can''t be negative.' using hint = 'bad_cost';
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
            raise exception '% is in this delivery twice.', v_code using hint = 'duplicate_imei';
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

    insert into pos.delivery_lines (delivery_id, item_id, qty, unit_cost_kobo) values (v_delivery, v_item.id, v_qty, v_cost);
    if v_cost is not null then
      update pos.items set cost_kobo = v_cost where id = v_item.id;   -- the latest cost
    end if;
    v_pieces := v_pieces + v_qty;
    v_total := v_total + v_qty * coalesce(v_cost, 0);
  end loop;

  update pos.deliveries set total_cost_kobo = v_total where id = v_delivery;
  return jsonb_build_object('delivery_id', v_delivery, 'pieces', v_pieces, 'phones', v_units, 'total_cost_kobo', v_total);
end $$;

-- ---------- move stock between departments ----------
-- p_lines: [{ "item_id": 12, "qty": 3 } | { "code": "<IMEI or serial>" }]
create function public.pos_move_stock(p_from smallint, p_to smallint, p_lines jsonb, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('stock.transfer');
  v_transfer uuid;
  v_line     jsonb;
  v_item     pos.items;
  v_unit     pos.phone_units;
  v_qty      int;
  v_have     int;
  v_pieces   int := 0;
begin
  perform pos.require_department(p_from);
  perform pos.require_department(p_to);
  if p_from = p_to then
    raise exception 'Choose two different departments.' using hint = 'same_department';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one product to move.' using hint = 'empty_move';
  end if;

  insert into pos.transfers (from_floor, to_floor, note, moved_by)
  values (p_from, p_to, nullif(trim(p_note), ''), v_user) returning id into v_transfer;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'code' then
      select u.* into v_unit from pos.unit_identifiers ui join pos.phone_units u on u.id = ui.unit_id
      where ui.code = trim(v_line->>'code') for update of u;
      if not found then
        raise exception 'No phone with IMEI or serial % is in the system.', trim(v_line->>'code') using hint = 'unknown_imei';
      end if;
      select * into v_item from pos.items where id = v_unit.item_id;
      if v_unit.status <> 'in_stock' or v_unit.floor_id <> p_from then
        raise exception '% (%) isn''t in stock in %.', v_item.name, trim(v_line->>'code'),
          (select name from pos.floors where id = p_from) using hint = 'not_in_department';
      end if;
      update pos.phone_units set floor_id = p_to where id = v_unit.id;
      insert into pos.stock_movements (item_id, floor_id, qty_change, reason, unit_id, ref_type, ref_id, actor_id) values
        (v_item.id, p_from, -1, 'transfer_out', v_unit.id, 'transfer', v_transfer::text, v_user),
        (v_item.id, p_to,    1, 'transfer_in',  v_unit.id, 'transfer', v_transfer::text, v_user);
      v_pieces := v_pieces + 1;
    else
      select * into v_item from pos.items where id = (v_line->>'item_id')::bigint;
      if not found then
        raise exception 'One of those products doesn''t exist.' using hint = 'bad_item';
      end if;
      if v_item.tracks_imei then
        raise exception 'Scan the IMEI of each % you''re moving.', v_item.name using hint = 'imei_required';
      end if;
      v_qty := (v_line->>'qty')::int;
      if v_qty is null or v_qty < 1 then
        raise exception 'Enter how many % to move.', v_item.name using hint = 'bad_qty';
      end if;
      select quantity into v_have from pos.stock_levels where item_id = v_item.id and floor_id = p_from for update;
      if coalesce(v_have, 0) < v_qty then
        raise exception 'Only % % in %.', coalesce(v_have, 0), v_item.name,
          (select name from pos.floors where id = p_from) using hint = 'insufficient_stock';
      end if;
      insert into pos.stock_movements (item_id, floor_id, qty_change, reason, ref_type, ref_id, actor_id) values
        (v_item.id, p_from, -v_qty, 'transfer_out', 'transfer', v_transfer::text, v_user),
        (v_item.id, p_to,    v_qty, 'transfer_in',  'transfer', v_transfer::text, v_user);
      v_pieces := v_pieces + v_qty;
    end if;
  end loop;

  return jsonb_build_object('transfer_id', v_transfer, 'pieces', v_pieces);
end $$;

-- ---------- count stock ----------
-- The shelf count replaces the system's number; the difference is recorded with the reason.
create function public.pos_count_stock(p_item_id bigint, p_floor_id smallint, p_counted int, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('stock.adjust');
  v_item pos.items;
  v_have int;
begin
  perform pos.require_department(p_floor_id);
  select * into v_item from pos.items where id = p_item_id;
  if not found then
    raise exception 'Product not found.' using hint = 'not_found';
  end if;
  if v_item.tracks_imei then
    raise exception 'Phones are counted one by one: mark each missing or faulty phone instead.' using hint = 'imei_item';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Enter the number counted (0 or more).' using hint = 'bad_qty';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Say why the count is different.' using hint = 'reason_required';
  end if;
  select quantity into v_have from pos.stock_levels where item_id = p_item_id and floor_id = p_floor_id for update;
  v_have := coalesce(v_have, 0);
  if p_counted <> v_have then
    insert into pos.stock_movements (item_id, floor_id, qty_change, reason, note, actor_id)
    values (p_item_id, p_floor_id, p_counted - v_have, 'count', trim(p_reason), v_user);
  end if;
  return jsonb_build_object('was', v_have, 'now', p_counted, 'difference', p_counted - v_have);
end $$;

-- ---------- a phone is faulty, missing, or back in stock ----------
create function public.pos_set_phone_status(p_code text, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('stock.adjust');
  v_unit pos.phone_units;
  v_name text;
  v_change int;
begin
  if p_status not in ('in_stock', 'faulty', 'missing') then
    raise exception 'Unknown status.' using hint = 'bad_status';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Say why.' using hint = 'reason_required';
  end if;
  select u.* into v_unit from pos.unit_identifiers ui join pos.phone_units u on u.id = ui.unit_id
  where ui.code = trim(p_code) for update of u;
  if not found then
    raise exception 'No phone with IMEI or serial % is in the system.', trim(p_code) using hint = 'unknown_imei';
  end if;
  perform pos.require_department(v_unit.floor_id);
  select name into v_name from pos.items where id = v_unit.item_id;
  if v_unit.status in ('held', 'sold') then
    raise exception 'This % is %. Use Checkout or Returns instead.', v_name,
      case v_unit.status when 'held' then 'in an unpaid order' else 'sold' end using hint = 'wrong_status';
  end if;
  if v_unit.status = p_status then
    return jsonb_build_object('status', p_status);
  end if;

  v_change := case when p_status = 'in_stock' then 1 when v_unit.status = 'in_stock' then -1 else 0 end;
  update pos.phone_units set status = p_status where id = v_unit.id;
  if v_change <> 0 then
    insert into pos.stock_movements (item_id, floor_id, qty_change, reason, unit_id, note, actor_id)
    values (v_unit.item_id, v_unit.floor_id, v_change, 'adjustment', v_unit.id,
            format('%s: %s', replace(p_status, '_', ' '), trim(p_reason)), v_user);
  end if;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'phone_status', 'phone_unit', v_unit.id::text,
          jsonb_build_object('code', trim(p_code), 'from', v_unit.status, 'to', p_status, 'reason', trim(p_reason)));
  return jsonb_build_object('status', p_status);
end $$;

revoke execute on function
  pos.require_product_access(), pos.require_department(smallint), pos.identifier_kind(text)
from public, anon;
revoke execute on function
  public.pos_product_options(), public.pos_products(text, smallint, bigint, text, text, int, int),
  public.pos_product(bigint), public.pos_save_product(bigint, jsonb),
  public.pos_receive_stock(smallint, jsonb, text, text, text), public.pos_move_stock(smallint, smallint, jsonb, text),
  public.pos_count_stock(bigint, smallint, int, text), public.pos_set_phone_status(text, text, text)
from public, anon;
grant execute on function
  public.pos_product_options(), public.pos_products(text, smallint, bigint, text, text, int, int),
  public.pos_product(bigint), public.pos_save_product(bigint, jsonb),
  public.pos_receive_stock(smallint, jsonb, text, text, text), public.pos_move_stock(smallint, smallint, jsonb, text),
  public.pos_count_stock(bigint, smallint, int, text), public.pos_set_phone_status(text, text, text)
to authenticated;
