-- Merged products: the till, product search and product history all know about them.

-- The till finds products by old barcodes too.
create or replace function public.pos_catalogue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps smallint[] := pos.user_departments(pos.require_staff());
begin
  return jsonb_build_object(
    'loaded_at', now(),
    'items', (select coalesce(jsonb_agg(jsonb_build_array(
                i.id, i.sku, i.name, i.price_kobo, i.wholesale_price_kobo, i.tracks_imei,
                coalesce(c.name, ''), coalesce(b.name, ''))), '[]'::jsonb)
              from pos.items i
              left join pos.categories c on c.id = i.category_id
              left join pos.brands b on b.id = i.brand_id
              where i.is_active
                and (exists (select 1 from pos.stock_levels l where l.item_id = i.id and l.floor_id = any(v_deps))
                     or exists (select 1 from pos.phone_units u where u.item_id = i.id and u.floor_id = any(v_deps))
                     or (not exists (select 1 from pos.stock_levels l where l.item_id = i.id)
                         and not exists (select 1 from pos.phone_units u where u.item_id = i.id)))),
    'aliases', (select coalesce(jsonb_agg(jsonb_build_array(a.code, a.item_id)), '[]'::jsonb)
                from pos.item_aliases a join pos.items i on i.id = a.item_id where i.is_active),
    'stock', (select coalesce(jsonb_agg(jsonb_build_array(l.item_id, l.floor_id, l.quantity)), '[]'::jsonb)
              from pos.stock_levels l join pos.items i on i.id = l.item_id
              where i.is_active and l.quantity <> 0 and l.floor_id = any(v_deps)),
    'units', (select coalesce(jsonb_agg(jsonb_build_array(u.id, u.item_id, u.floor_id, u.status,
                (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = u.id))), '[]'::jsonb)
              from pos.phone_units u
              where u.status in ('in_stock', 'held') and u.floor_id = any(v_deps))
  );
end $$;

-- Product search finds a product by an old barcode too.
create or replace function public.pos_products(
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
             or exists (select 1 from pos.item_aliases a where a.code = v_code and a.item_id = i.id)
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

-- A product's history includes the copies merged into it.
create or replace function public.pos_product(p_id bigint) returns jsonb
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
                  where (m.item_id = p_id
                         or (m.item_id in (select id from pos.items where merged_into = p_id) and m.ref_type is distinct from 'merge'))
                    and m.floor_id = any(v_deps)
                  order by m.created_at desc limit 40) x), '[]'::jsonb)
  );
end $$;
