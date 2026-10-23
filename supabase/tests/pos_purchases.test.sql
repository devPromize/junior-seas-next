-- Automated tests for Purchases (supabase/migrations/20261023_pos_purchases.sql).
-- Runs as pretend staff, then rolls everything back.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();
  v_inv  uuid := gen_random_uuid();   -- inventory officer: records purchases, can't see costs or change prices
  v_rep  uuid := gen_random_uuid();
  v_acc  smallint;
  v_item bigint; v_price bigint;
  v_sup  bigint;
  v_res  jsonb; v_res2 jsonb;
  v_doc  uuid;
  v_path text;
  v_year text := to_char(now() at time zone 'Africa/Lagos', 'YYYY');
  v_next int;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'pu-owner@example.test', 'authenticated', 'authenticated'),
    (v_inv,  'pu-inv@example.test', 'authenticated', 'authenticated'),
    (v_rep,  'pu-rep@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'PU Owner', id from (select id from pos.roles where is_owner limit 1) o union all
  select v_inv, 'PU Inventory', id from pos.roles where name = 'Inventory officer' union all
  select v_rep, 'PU Rep', id from pos.roles where name = 'Sales rep';
  select id into v_acc from pos.floors where code = 'accessories';
  insert into pos.staff_departments (user_id, floor_id) values (v_inv, v_acc), (v_rep, v_acc);
  select l.item_id, i.price_kobo into v_item, v_price from pos.stock_levels l join pos.items i on i.id = l.item_id
  where l.floor_id = v_acc and not i.tracks_imei and i.is_active and i.price_kobo > 100000 limit 1;
  v_next := coalesce((select max(substring(ref_no from '^PO' || v_year || '/(\d+)$')::int) from pos.deliveries), 0) + 1;

  -- 1. the old system's purchases came over, each with its supplier, without touching stock
  r := r || case when (select count(*) from pos.deliveries where legacy_id is not null) = 344
                  and not exists (select 1 from pos.deliveries where legacy_id is not null and supplier_id is null)
                  and (select count(*) from pos.delivery_lines l join pos.deliveries d on d.id = l.delivery_id where d.legacy_id is not null) = 2262
                  and not exists (select 1 from pos.stock_movements m join pos.deliveries d on d.id::text = m.ref_id where d.legacy_id is not null)
                 then 'PASS 1  344 old purchases and 2,262 lines brought over, all with a supplier, stock untouched'
                 else 'FAIL 1  history import' end;

  -- 2. a rep can't see purchases
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_purchases();
    r := r || 'FAIL 2  a rep opened purchases';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission to see purchases%' then 'PASS 2  rep can''t see purchases' else 'FAIL 2  ' || sqlerrm end;
  end;

  -- 3. the inventory officer sees the list, but not what was paid
  perform set_config('request.jwt.claims', json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);
  v_res := public.pos_purchases();
  r := r || case when (v_res->>'total')::int > 0 and v_res->'rows'->0->'total_cost_kobo' = 'null'::jsonb
                 then format('PASS 3  inventory officer sees %s Accessories purchases, without costs', v_res->>'total')
                 else 'FAIL 3  ' || left(v_res::text, 200) end;

  -- 4. the same supplier can't be added twice under a slightly different name
  begin
    perform public.pos_save_supplier(null, 'God''swill Comm. Ltd');
    r := r || 'FAIL 4  duplicate supplier added';
  exception when others then
    r := r || case when sqlerrm like 'There''s already a supplier called GODSWILL COMM%' then 'PASS 4  ' || sqlerrm else 'FAIL 4  ' || sqlerrm end;
  end;

  -- 5. a new purchase continues the old numbering
  v_sup := (public.pos_save_supplier(null, 'Test Supplier Purchases')->>'id')::bigint;
  v_res := public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 3, 'unit_cost_kobo', 50000)), v_sup, 'INV-9');
  v_res2 := public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), v_sup);
  r := r || case when v_res->>'ref_no' = format('PO%s/%s', v_year, lpad(v_next::text, 4, '0'))
                  and v_res2->>'ref_no' = format('PO%s/%s', v_year, lpad((v_next + 1)::text, 4, '0'))
                 then format('PASS 5  numbering carries on: %s, then %s', v_res->>'ref_no', v_res2->>'ref_no')
                 else 'FAIL 5  ' || (v_res->>'ref_no') || ' ' || (v_res2->>'ref_no') end;

  -- 6. setting a new selling price on arrival needs "Change prices"
  begin
    perform public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1, 'new_price_kobo', v_price + 50000)));
    r := r || 'FAIL 6a inventory officer changed a price through a purchase';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission to change prices%' then 'PASS 6a ' || sqlerrm else 'FAIL 6a ' || sqlerrm end;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  perform public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1, 'new_price_kobo', v_price + 50000)));
  r := r || case when (select price_kobo from pos.items where id = v_item) = v_price + 50000
                  and exists (select 1 from pos.audit_log where entity_id = v_item::text and detail ? 'purchase')
                 then 'PASS 6b owner sets the new selling price while recording the purchase (logged)' else 'FAIL 6b' end;

  -- 7. a receipt photo uploaded first is attached when the purchase is saved
  insert into storage.objects (bucket_id, name, owner) values ('purchase-documents', 'test/receipt-' || gen_random_uuid() || '.jpg', v_boss)
  returning name into v_path;
  v_doc := (public.pos_add_purchase_document(v_path, 'image/jpeg', 120000)->>'id')::uuid;
  v_res := public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 2)), v_sup, null, null, array[v_doc]);
  r := r || case when jsonb_array_length(public.pos_purchase((v_res->>'delivery_id')::uuid)->'documents') = 1
                 then 'PASS 7  receipt photo attached to ' || (v_res->>'ref_no') else 'FAIL 7  document not linked' end;

  -- 8. an old purchase opens with its items and who recorded it
  v_res := public.pos_purchase((select id from pos.deliveries where ref_no = 'PO2025/0126'));
  r := r || case when v_res->>'received_by' is not null and jsonb_array_length(v_res->'lines') > 0 and (v_res->>'is_legacy')::boolean
                 then format('PASS 8  old purchase %s: %s, %s line(s), recorded by %s', v_res->>'ref_no', v_res->'supplier'->>'name',
                             jsonb_array_length(v_res->'lines'), v_res->>'received_by')
                 else 'FAIL 8  ' || left(coalesce(v_res::text, 'null'), 200) end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
