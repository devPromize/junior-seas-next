-- Automated tests for merging duplicate products (supabase/migrations/20261023_pos_merge_products*.sql).
-- Runs the real one-tap merge on the real catalogue, checks nothing was lost, then rolls back.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();
  v_inv  uuid := gen_random_uuid();
  v_stock_before bigint; v_units_before bigint; v_lines_before bigint;
  v_res jsonb; v_g jsonb; v_keep bigint; v_dups bigint[]; v_old_sku text; v_price bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'mg-owner@example.test', 'authenticated', 'authenticated'), (v_inv, 'mg-inv@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'MG Owner', id from (select id from pos.roles where is_owner limit 1) o union all
  select v_inv, 'MG Inventory', id from pos.roles where name = 'Inventory officer';

  select sum(quantity) into v_stock_before from pos.stock_levels;
  select count(*) into v_units_before from pos.phone_units where status = 'in_stock';
  select count(*) into v_lines_before from pos.sale_lines where item_id is not null;

  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  v_res := public.pos_duplicate_groups();
  r := r || format('INFO  %s duplicate groups before merging', jsonb_array_length(v_res));

  -- 1. one tap merges every group whose copies share a price
  v_res := public.pos_merge_simple_duplicates();
  r := r || (case when (v_res->>'groups')::int >= 120
                  then format('PASS 1  one tap merged %s groups (%s copies retired)', v_res->>'groups', v_res->>'copies')
                  else 'FAIL 1  ' || v_res::text end);

  -- 2. nothing was lost: total stock, phones in stock and sales history all unchanged
  r := r || (case when (select sum(quantity) from pos.stock_levels) = v_stock_before
                   and (select count(*) from pos.phone_units where status = 'in_stock') = v_units_before
                   and (select count(*) from pos.sale_lines where item_id is not null) = v_lines_before
                  then format('PASS 2  total stock (%s), phones in stock (%s) and sale lines (%s) unchanged', v_stock_before, v_units_before, v_lines_before)
                  else 'FAIL 2  something moved' end);

  -- 3. retired copies hold no stock or phones, and their barcodes find the kept product
  r := r || (case when not exists (select 1 from pos.items i join pos.stock_levels l on l.item_id = i.id where i.merged_into is not null and l.quantity <> 0)
                   and not exists (select 1 from pos.items i join pos.phone_units u on u.item_id = i.id where i.merged_into is not null)
                  then 'PASS 3a retired copies hold no stock and no phones' else 'FAIL 3a stock left on retired copies' end);
  select a.code, a.item_id into v_old_sku, v_keep from pos.item_aliases a limit 1;
  r := r || (case when (public.pos_products(v_old_sku)->'rows'->0->>'id')::bigint = v_keep
                   and exists (select 1 from jsonb_array_elements(public.pos_catalogue()->'aliases') a where a->>0 = v_old_sku)
                  then 'PASS 3b old barcode ' || v_old_sku || ' finds the kept product, in search and at the till'
                  else 'FAIL 3b alias lookup' end);

  -- 4. a group with different prices is merged one at a time, with the price chosen
  select g into v_g from jsonb_array_elements(public.pos_duplicate_groups()) g
  where not (g->>'same_price')::boolean and not (g->>'mixed_imei')::boolean limit 1;
  v_keep := (v_g->>'suggested_keep')::bigint;
  v_dups := array(select (c->>'id')::bigint from jsonb_array_elements(v_g->'copies') c where (c->>'id')::bigint <> v_keep);
  v_price := (select max((c->>'price_kobo')::bigint) from jsonb_array_elements(v_g->'copies') c);
  perform public.pos_merge_products(v_keep, v_dups, v_price);
  r := r || (case when (select price_kobo from pos.items where id = v_keep) = v_price
                   and not exists (select 1 from pos.items where id = any(v_dups) and is_active)
                   and exists (select 1 from pos.audit_log where action = 'product_merged' and entity_id = v_keep::text)
                  then format('PASS 4  %s: %s copies merged at the chosen price %s (logged)', v_g->>'name', cardinality(v_dups), pos.naira(v_price))
                  else 'FAIL 4' end);

  -- 5. a phone can't be merged with a non-phone
  select g into v_g from jsonb_array_elements(public.pos_duplicate_groups()) g where (g->>'mixed_imei')::boolean limit 1;
  if v_g is not null then
    begin
      perform public.pos_merge_products(
        (select (c->>'id')::bigint from jsonb_array_elements(v_g->'copies') c where (c->>'tracks_imei')::boolean limit 1),
        array(select (c->>'id')::bigint from jsonb_array_elements(v_g->'copies') c where not (c->>'tracks_imei')::boolean));
      r := r || 'FAIL 5  merged a phone with a non-phone'::text;
    exception when others then
      r := r || (case when sqlerrm like '%tracked by IMEI and % isn''t%' then 'PASS 5  ' || sqlerrm else 'FAIL 5  ' || sqlerrm end);
    end;
  end if;

  -- 6. an inventory officer can merge but can't change the price while doing it
  perform set_config('request.jwt.claims', json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);
  select g into v_g from jsonb_array_elements(public.pos_duplicate_groups()) g
  where not (g->>'same_price')::boolean and not (g->>'mixed_imei')::boolean limit 1;
  begin
    perform public.pos_merge_products((v_g->>'suggested_keep')::bigint,
      array(select (c->>'id')::bigint from jsonb_array_elements(v_g->'copies') c where (c->>'id')::bigint <> (v_g->>'suggested_keep')::bigint),
      1);
    r := r || 'FAIL 6  inventory officer changed a price while merging'::text;
  exception when others then
    r := r || (case when sqlerrm like 'You don''t have permission to change prices%' then 'PASS 6  merging can''t be used to change prices without permission' else 'FAIL 6  ' || sqlerrm end);
  end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
