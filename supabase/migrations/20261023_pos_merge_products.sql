-- POS step 14: merging duplicate products (D-040).
--
-- The old system saved many products more than once (253 names, 1,242 records; one phone
-- model 29 times). Merging keeps one product per model and moves everything else onto it:
-- stock (through recorded movements, so the stock ledger stays complete), phones, past sales and
-- purchases. The copies are retired, not deleted, and their barcodes keep working: scanning
-- an old label finds the kept product.

alter table pos.items add column merged_into bigint references pos.items(id);

create table pos.item_aliases (
  code       text primary key,              -- an old barcode
  item_id    bigint not null references pos.items(id),
  created_at timestamptz not null default now()
);
alter table pos.item_aliases enable row level security;

-- Move one copy into the product being kept.
create function pos.merge_item(p_keep bigint, p_dup bigint, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k pos.items;
  d pos.items;
  r record;
begin
  select * into k from pos.items where id = p_keep for update;
  select * into d from pos.items where id = p_dup for update;
  if k.id is null or d.id is null or k.id = d.id then
    raise exception 'Choose two different products.' using hint = 'bad_merge';
  end if;
  if not k.is_active then
    raise exception 'The product you keep must be on sale.' using hint = 'bad_merge';
  end if;
  if k.tracks_imei <> d.tracks_imei then
    raise exception '% is tracked by IMEI and % isn''t, so they can''t be merged.',
      case when k.tracks_imei then k.name || ' (' || k.sku || ')' else d.name || ' (' || d.sku || ')' end,
      case when k.tracks_imei then d.name || ' (' || d.sku || ')' else k.name || ' (' || k.sku || ')' end using hint = 'imei_mismatch';
  end if;

  -- Stock moves through the ledger: out of the copy, into the product kept, per department.
  for r in select floor_id, quantity from pos.stock_levels where item_id = p_dup and quantity <> 0 loop
    insert into pos.stock_movements (item_id, floor_id, qty_change, reason, ref_type, ref_id, note, actor_id) values
      (p_dup,  r.floor_id, -r.quantity, 'correction', 'merge', p_keep::text, format('Merged into %s (%s)', k.name, k.sku), p_user),
      (p_keep, r.floor_id,  r.quantity, 'correction', 'merge', p_dup::text, format('Merged from copy %s', d.sku), p_user);
  end loop;

  -- Phones, past sales and purchases now belong to the product kept.
  update pos.phone_units set item_id = p_keep where item_id = p_dup;
  update pos.sale_lines set item_id = p_keep where item_id = p_dup;
  update pos.delivery_lines set item_id = p_keep where item_id = p_dup;

  -- Old barcodes keep working.
  insert into pos.item_aliases (code, item_id) values (d.sku, p_keep)
  on conflict (code) do update set item_id = excluded.item_id;
  update pos.item_aliases set item_id = p_keep where item_id = p_dup;
  update pos.items set merged_into = p_keep where merged_into = p_dup;

  -- Keep anything the product kept is missing.
  update pos.items set web_product_id = null where id = p_dup and k.web_product_id is null and d.web_product_id is not null;
  update pos.items set
    category_id = coalesce(category_id, d.category_id), brand_id = coalesce(brand_id, d.brand_id),
    wholesale_price_kobo = coalesce(wholesale_price_kobo, d.wholesale_price_kobo),
    wholesale_min_qty = coalesce(wholesale_min_qty, d.wholesale_min_qty),
    warranty_days = coalesce(warranty_days, d.warranty_days),
    web_product_id = coalesce(web_product_id, d.web_product_id),
    show_online = show_online or d.show_online,
    cost_kobo = case when cost_kobo = 0 then d.cost_kobo else cost_kobo end
  where id = p_keep;
  update pos.items set is_active = false, merged_into = p_keep where id = p_dup;

  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (p_user, 'product_merged', 'item', p_keep::text,
          jsonb_build_object('kept', p_keep, 'kept_sku', k.sku, 'merged', p_dup, 'merged_sku', d.sku, 'name', d.name,
                             'merged_price_kobo', d.price_kobo, 'kept_price_kobo', k.price_kobo));
end $$;

-- Groups of products on sale with the same name, with what's needed to choose which to keep.
-- The suggestion is the copy used most recently (latest sale or purchase), whose price is
-- probably the current one.
create function public.pos_duplicate_groups() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_costs boolean := pos.has_permission('costs.view');
begin
  perform pos.require_permission('products.manage');
  return coalesce((
    with copies as (
      select i.*, lower(i.name) as k,
             coalesce((select sum(quantity) from pos.stock_levels l where l.item_id = i.id), 0) as stock,
             (select count(*) from pos.sale_lines l where l.item_id = i.id) as sold,
             (select max(s.paid_at) from pos.sale_lines l join pos.sales s on s.id = l.sale_id where l.item_id = i.id and s.status = 'paid') as last_sold,
             (select max(d.received_at) from pos.delivery_lines l join pos.deliveries d on d.id = l.delivery_id where l.item_id = i.id) as last_bought
      from pos.items i
      where i.is_active and lower(i.name) in (select lower(name) from pos.items where is_active group by 1 having count(*) > 1)
    ), ranked as (
      select c.*, row_number() over (partition by k order by greatest(c.last_sold, c.last_bought) desc nulls last, c.sold desc, c.id desc) as rn
      from copies c
    )
    select jsonb_agg(g order by (g->>'stock')::int desc, g->>'name')
    from (
      select jsonb_build_object(
        'name', min(r.name), 'stock', sum(r.stock),
        'suggested_keep', min(r.id) filter (where r.rn = 1),
        'same_price', count(distinct r.price_kobo) = 1,
        'mixed_imei', bool_or(r.tracks_imei) <> bool_and(r.tracks_imei),
        'copies', jsonb_agg(jsonb_build_object(
          'id', r.id, 'sku', r.sku, 'price_kobo', r.price_kobo, 'wholesale_price_kobo', r.wholesale_price_kobo,
          'cost_kobo', case when v_costs then r.cost_kobo end, 'tracks_imei', r.tracks_imei,
          'stock', r.stock, 'sold', r.sold, 'last_sold', r.last_sold, 'last_bought', r.last_bought,
          'category', (select name from pos.categories where id = r.category_id),
          'brand', (select name from pos.brands where id = r.brand_id)) order by r.rn)
      ) as g
      from ranked r group by r.k
    ) x
  ), '[]'::jsonb);
end $$;

-- Merge the chosen copies into the product kept, optionally setting its selling price.
create function public.pos_merge_products(p_keep bigint, p_merge bigint[], p_price_kobo bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('products.manage');
  v_dup  bigint;
begin
  if coalesce(cardinality(p_merge), 0) = 0 then
    raise exception 'Choose the copies to merge.' using hint = 'nothing_to_merge';
  end if;
  if p_price_kobo is not null and p_price_kobo is distinct from (select price_kobo from pos.items where id = p_keep) then
    if not pos.has_permission('prices.edit') then
      raise exception 'You don''t have permission to change prices.' using hint = 'not_allowed';
    end if;
    perform public.pos_save_product(p_keep, jsonb_build_object('price_kobo', p_price_kobo));
  end if;
  foreach v_dup in array p_merge loop
    perform pos.merge_item(p_keep, v_dup, v_user);
  end loop;
  return jsonb_build_object('kept', p_keep, 'merged', cardinality(p_merge));
end $$;

-- One tap for the simple ones: every group whose copies all have the same price and are the
-- same kind (all phones, or none), merged into the suggested copy.
create function public.pos_merge_simple_duplicates() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := pos.require_permission('products.manage');
  v_g      jsonb;
  v_keep   bigint;
  v_groups int := 0;
  v_copies int := 0;
begin
  for v_g in select jsonb_array_elements(public.pos_duplicate_groups()) loop
    continue when not (v_g->>'same_price')::boolean or (v_g->>'mixed_imei')::boolean;
    v_keep := (v_g->>'suggested_keep')::bigint;
    perform pos.merge_item(v_keep, (c->>'id')::bigint, v_user)
    from jsonb_array_elements(v_g->'copies') c where (c->>'id')::bigint <> v_keep;
    v_groups := v_groups + 1;
    v_copies := v_copies + jsonb_array_length(v_g->'copies') - 1;
  end loop;
  return jsonb_build_object('groups', v_groups, 'copies', v_copies);
end $$;

revoke execute on function pos.merge_item(bigint, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.pos_duplicate_groups(), public.pos_merge_products(bigint, bigint[], bigint),
  public.pos_merge_simple_duplicates() from public, anon;
grant execute on function public.pos_duplicate_groups(), public.pos_merge_products(bigint, bigint[], bigint),
  public.pos_merge_simple_duplicates() to authenticated;
