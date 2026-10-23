-- Automated tests for products and stock (supabase/migrations/20261022_pos_products_stock.sql).
-- Runs as pretend staff, then rolls everything back.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();   -- owner
  v_inv  uuid := gen_random_uuid();   -- inventory officer: Accessories and Mobile Phones
  v_rep  uuid := gen_random_uuid();
  v_acc smallint; v_phones smallint;
  v_res jsonb; v_item bigint; v_phone_item bigint; v_n int;
  v_imei1 text := '35' || lpad((floor(random() * 1e13))::bigint::text, 13, '0');
  v_imei2 text := '35' || lpad((floor(random() * 1e13))::bigint::text, 13, '0');
  v_serial text := 'TESTSN' || floor(random() * 1e6)::int;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'ps-owner@example.test', 'authenticated', 'authenticated'),
    (v_inv,  'ps-inv@example.test', 'authenticated', 'authenticated'),
    (v_rep,  'ps-rep@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'PS Owner', id from (select id from pos.roles where is_owner limit 1) o union all
  select v_inv, 'PS Inventory', id from pos.roles where name = 'Inventory officer' union all
  select v_rep, 'PS Rep', id from pos.roles where name = 'Sales rep';
  select id into v_acc from pos.floors where code = 'accessories';
  select id into v_phones from pos.floors where code = 'phones';
  insert into pos.staff_departments (user_id, floor_id) values (v_inv, v_acc), (v_inv, v_phones), (v_rep, v_acc);

  -- 1. the imported "&amp;" names are fixed
  r := r || case when not exists (select 1 from pos.items where name like '%&amp;%')
                  and not exists (select 1 from pos.categories where name like '%&amp;%')
                 then 'PASS 1  no "&amp;" left in product or category names' else 'FAIL 1  "&amp;" still in names' end;

  -- 2. a rep can't open products
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_products();
    r := r || 'FAIL 2  a rep opened products';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission to see products%' then 'PASS 2  rep can''t open products' else 'FAIL 2  ' || sqlerrm end;
  end;

  -- 3. the inventory officer adds a product, with a new category and brand typed in; a barcode is made up
  perform set_config('request.jwt.claims', json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);
  v_res := public.pos_save_product(null, jsonb_build_object('name', 'test magsafe charger 15w', 'price_kobo', 1500000,
             'category_name', 'Test Chargers', 'brand_name', 'Test Brand', 'wholesale_price_kobo', 1200000));
  v_item := (v_res->>'id')::bigint;
  r := r || case when (select name from pos.items where id = v_item) = 'TEST MAGSAFE CHARGER 15W'
                  and (v_res->>'sku') ~ '^2[0-9]{12}$'
                  and (select c.name from pos.items i join pos.categories c on c.id = i.category_id where i.id = v_item) = 'TEST CHARGERS'
                  and exists (select 1 from pos.audit_log where entity = 'item' and entity_id = v_item::text and action = 'product_added')
                 then 'PASS 3  product added with new category, brand and barcode ' || (v_res->>'sku') else 'FAIL 3  product not added right' end;

  -- 4. but can't change its selling price (no "Change prices")...
  begin
    perform public.pos_save_product(v_item, jsonb_build_object('price_kobo', 1400000));
    r := r || 'FAIL 4  inventory officer changed a price';
  exception when others then
    r := r || case when sqlerrm = 'You don''t have permission to change prices.' then 'PASS 4  ' || sqlerrm else 'FAIL 4  ' || sqlerrm end;
  end;

  -- 5. ...can't see costs...
  r := r || case when public.pos_product(v_item)->'cost_kobo' = 'null'::jsonb
                 then 'PASS 5  cost hidden from someone without "See cost prices"' else 'FAIL 5  cost shown' end;

  -- 6. ...and wholesale must be below retail
  begin
    perform public.pos_save_product(v_item, jsonb_build_object('wholesale_price_kobo', 2000000));
    r := r || 'FAIL 6  wholesale above retail accepted';
  exception when others then
    r := r || case when sqlerrm like 'The wholesale price should be lower%' then 'PASS 6  ' || sqlerrm else 'FAIL 6  ' || sqlerrm end;
  end;

  -- 7. receive a delivery: 12 chargers into Accessories, from a new supplier
  v_res := public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 12, 'unit_cost_kobo', 900000)),
                                      (public.pos_save_supplier(null, 'Test Supplier Ltd')->>'id')::bigint, 'INV-001');
  r := r || case when (select quantity from pos.stock_levels where item_id = v_item and floor_id = v_acc) = 12
                  and (v_res->>'total_cost_kobo')::bigint = 12 * 900000
                  and exists (select 1 from pos.suppliers where name = 'TEST SUPPLIER LTD')
                 then 'PASS 7  12 received into Accessories, ₦108,000 delivery recorded' else 'FAIL 7  ' || v_res::text end;

  -- 8. receive phones: one dual-SIM (two IMEIs) and one laptop-style serial number
  v_res := public.pos_save_product(null, jsonb_build_object('name', 'test phone 128gb', 'price_kobo', 25000000, 'tracks_imei', true));
  v_phone_item := (v_res->>'id')::bigint;
  v_res := public.pos_record_purchase(v_phones, jsonb_build_array(jsonb_build_object('item_id', v_phone_item, 'unit_cost_kobo', 20000000,
             'codes', jsonb_build_array(v_imei1 || '/' || v_imei2, v_serial))));
  r := r || case when (v_res->>'phones')::int = 2
                  and (select count(*) from pos.phone_units where item_id = v_phone_item and status = 'in_stock') = 2
                  and (select kind from pos.unit_identifiers where code = v_imei2) = 'imei'
                  and (select slot from pos.unit_identifiers where code = v_imei2) = 2
                  and (select kind from pos.unit_identifiers where code = v_serial) = 'serial'
                  and (select quantity from pos.stock_levels where item_id = v_phone_item and floor_id = v_phones) = 2
                 then 'PASS 8  2 phones received: dual-SIM IMEIs and a serial number' else 'FAIL 8  phones not received right' end;

  -- 9. the same IMEI can't come in twice
  begin
    perform public.pos_record_purchase(v_phones, jsonb_build_array(jsonb_build_object('item_id', v_phone_item, 'codes', jsonb_build_array(v_imei1))));
    r := r || 'FAIL 9  duplicate IMEI accepted';
  exception when others then
    r := r || case when sqlerrm like '% is already in the system: TEST PHONE 128GB (in stock).' then 'PASS 9  ' || sqlerrm else 'FAIL 9  ' || sqlerrm end;
  end;

  -- 10. move 5 chargers and one phone between departments
  v_res := public.pos_move_stock(v_acc, v_phones, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 5)));
  perform public.pos_move_stock(v_phones, v_acc, jsonb_build_array(jsonb_build_object('code', v_serial)));
  r := r || case when (select quantity from pos.stock_levels where item_id = v_item and floor_id = v_acc) = 7
                  and (select quantity from pos.stock_levels where item_id = v_item and floor_id = v_phones) = 5
                  and (select u.floor_id from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id where ui.code = v_serial) = v_acc
                 then 'PASS 10 moved 5 chargers and 1 phone between departments' else 'FAIL 10 move wrong' end;

  -- 11. can't move more than there is
  begin
    perform public.pos_move_stock(v_acc, v_phones, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 50)));
    r := r || 'FAIL 11 moved more than in stock';
  exception when others then
    r := r || case when sqlerrm like 'Only 7 % in Accessories.' then 'PASS 11 ' || sqlerrm else 'FAIL 11 ' || sqlerrm end;
  end;

  -- 12. a shelf count fixes the number and keeps the reason
  v_res := public.pos_count_stock(v_item, v_acc, 6, 'One damaged in the store room');
  r := r || case when (v_res->>'difference')::int = -1
                  and (select quantity from pos.stock_levels where item_id = v_item and floor_id = v_acc) = 6
                  and exists (select 1 from pos.stock_movements where item_id = v_item and reason = 'count' and note = 'One damaged in the store room')
                 then 'PASS 12 count: 7 → 6, reason kept' else 'FAIL 12 count wrong' end;

  -- 13. a phone marked missing leaves stock; found again, it comes back
  perform public.pos_set_phone_status(v_imei1, 'missing', 'Not on the shelf at stock count');
  v_n := (select quantity from pos.stock_levels where item_id = v_phone_item and floor_id = v_phones);
  perform public.pos_set_phone_status(v_imei2, 'in_stock', 'Found in the drawer');   -- same phone, by its second IMEI
  r := r || case when v_n = 0
                  and (select quantity from pos.stock_levels where item_id = v_phone_item and floor_id = v_phones) = 1
                  and (select u.status from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id where ui.code = v_imei1) = 'in_stock'
                 then 'PASS 13 phone missing (stock 0), then found by its second IMEI (stock 1)' else 'FAIL 13 phone status wrong' end;

  -- 14. history shows every movement for this product
  r := r || case when jsonb_array_length(public.pos_product(v_item)->'history') = 4
                 then 'PASS 14 history: delivery, move out, move in... and the count' else 'FAIL 14 history: ' || (public.pos_product(v_item)->'history')::text end;

  -- 15. the list finds products by words, barcode and IMEI
  r := r || case when (public.pos_products('magsafe test')->>'total')::int = 1
                  and (public.pos_products((select sku from pos.items where id = v_item))->>'total')::int = 1
                  and (public.pos_products(v_imei2)->'rows'->0->>'id')::bigint = v_phone_item
                 then 'PASS 15 search by words, barcode and IMEI' else 'FAIL 15 search' end;

  -- 16. "tracked by IMEI" can't be switched off once there's stock
  begin
    perform public.pos_save_product(v_phone_item, jsonb_build_object('tracks_imei', false));
    r := r || 'FAIL 16 IMEI tracking switched off with stock';
  exception when others then
    r := r || case when sqlerrm like 'This product already has stock%' then 'PASS 16 ' || sqlerrm else 'FAIL 16 ' || sqlerrm end;
  end;

  -- 17. the owner changes the price and sees the cost; the change is logged from → to
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  perform public.pos_save_product(v_item, jsonb_build_object('price_kobo', 1600000));
  r := r || case when (public.pos_product(v_item)->>'cost_kobo')::bigint = 900000
                  and exists (select 1 from pos.audit_log where entity_id = v_item::text and action = 'product_updated'
                              and (detail->'price_kobo'->>'from')::bigint = 1500000 and (detail->'price_kobo'->>'to')::bigint = 1600000)
                 then 'PASS 17 owner changed the price (₦15,000 → ₦16,000, logged) and sees the cost' else 'FAIL 17' end;

  -- 18. an inventory officer can't receive into a department they don't have
  perform set_config('request.jwt.claims', json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_record_purchase((select id from pos.floors where code = 'spare_parts'),
                                     jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)));
    r := r || 'FAIL 18 received into a department without access';
  exception when others then
    r := r || case when sqlerrm = 'You don''t have access to Spare Parts & Repairs.' then 'PASS 18 ' || sqlerrm else 'FAIL 18 ' || sqlerrm end;
  end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
