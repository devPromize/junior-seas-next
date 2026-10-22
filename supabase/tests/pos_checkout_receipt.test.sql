-- Automated tests for checkout and receipts (supabase/migrations/20261022_pos_checkout_receipt.sql).
-- The whole journey through the app's entry points: a rep places an order with a phone and an
-- accessory, the cashier pays it with cash and transfer, then the receipt. Rolled back at the end.

do $test$
declare
  r       text[] := '{}';
  v_rep   uuid := gen_random_uuid();   -- Mobile Phones and Accessories
  v_rep2  uuid := gen_random_uuid();   -- Accessories only, didn't make the sale
  v_cash  uuid := gen_random_uuid();   -- cashier for Mobile Phones and Accessories
  v_cash2 uuid := gen_random_uuid();   -- cashier for Spare Parts & Repairs only
  v_acc smallint; v_phones smallint; v_parts smallint;
  v_phone text; v_item bigint; v_opay smallint;
  v_res jsonb; v_sale uuid; v_total bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (v_rep,   'co-rep@example.test', 'authenticated', 'authenticated'),
    (v_rep2,  'co-rep2@example.test', 'authenticated', 'authenticated'),
    (v_cash,  'co-cash@example.test', 'authenticated', 'authenticated'),
    (v_cash2, 'co-cash2@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_rep, 'CO Rep', id from pos.roles where name = 'Sales rep' union all
  select v_rep2, 'CO Rep 2', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'CO Cashier', id from pos.roles where name = 'Cashier' union all
  select v_cash2, 'CO Parts Cashier', id from pos.roles where name = 'Cashier';
  select id into v_acc from pos.floors where code = 'accessories';
  select id into v_phones from pos.floors where code = 'phones';
  select id into v_parts from pos.floors where code = 'spare_parts';
  insert into pos.staff_departments (user_id, floor_id) values
    (v_rep, v_acc), (v_rep, v_phones), (v_rep2, v_acc), (v_cash, v_acc), (v_cash, v_phones), (v_cash2, v_parts);
  select id into v_opay from pos.payment_accounts where name = 'OPay';
  select ui.code into v_phone from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id and ui.slot = 1
  where u.status = 'in_stock' and u.floor_id = v_phones limit 1;
  select l.item_id into v_item from pos.stock_levels l join pos.items i on i.id = l.item_id
  where l.floor_id = v_acc and not i.tracks_imei and i.is_active and l.quantity > 3 and i.price_kobo > 0 limit 1;

  -- 1. one order with items from two departments
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_res := public.pos_place_order(jsonb_build_array(jsonb_build_object('code', v_phone),
                                                    jsonb_build_object('item_id', v_item, 'qty', 1)), null, true);
  v_sale := (v_res->>'sale_id')::uuid;
  v_total := (v_res->>'total_kobo')::bigint;
  r := r || case when (select count(distinct floor_id) from pos.sale_lines where sale_id = v_sale) = 2
                 then 'PASS 1  one order, items from Mobile Phones and Accessories' else 'FAIL 1  order lines wrong' end;

  -- 2. a cashier for other departments doesn't see it and can't take payment for it
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash2, 'role', 'authenticated')::text, true);
  r := r || case when not exists (select 1 from jsonb_array_elements(public.pos_order_queue()) o where (o->>'sale_id')::uuid = v_sale)
                 then 'PASS 2a Spare Parts cashier doesn''t see the order' else 'FAIL 2a order shown to the wrong cashier' end;
  begin
    perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', v_total)));
    r := r || 'FAIL 2b wrong cashier took payment';
  exception when others then
    r := r || case when sqlerrm = 'This order has no items from your departments.' then 'PASS 2b ' || sqlerrm else 'FAIL 2b ' || sqlerrm end;
  end;

  -- 3. the right cashier sees it and takes cash plus an OPay transfer
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  r := r || case when exists (select 1 from jsonb_array_elements(public.pos_order_queue()) o where (o->>'sale_id')::uuid = v_sale)
                 then 'PASS 3a cashier sees the order in their queue' else 'FAIL 3a order missing from queue' end;
  perform public.pos_checkout(v_sale, jsonb_build_array(
    jsonb_build_object('method', 'cash', 'amount_kobo', 1000000),
    jsonb_build_object('method', 'transfer', 'account_id', v_opay, 'amount_kobo', v_total - 1000000)));
  r := r || case when (select status from pos.sales where id = v_sale) = 'paid'
                 then 'PASS 3b paid with cash + OPay transfer' else 'FAIL 3b not paid' end;

  -- 4. the receipt: one receipt for both departments, with business details, IMEI and payments
  v_res := public.pos_receipt(v_sale);
  r := r || case when v_res->'business'->>'name' = 'Junior Seas Tech'
                  and jsonb_array_length(v_res->'lines') = 2
                  and exists (select 1 from jsonb_array_elements(v_res->'lines') l where l->'codes' ? v_phone)
                  and jsonb_array_length(v_res->'payments') = 2
                  and (v_res->>'total_kobo')::bigint = v_total
                  and v_res->>'checked_out_by' = 'CO Cashier' and v_res->>'sold_by' = 'CO Rep'
                 then format('PASS 4  receipt %s: 2 items, IMEI shown, 2 payments, total %s',
                             v_res->>'receipt_no', pos.naira(v_total))
                 else 'FAIL 4  receipt wrong: ' || v_res::text end;

  -- 5. the rep who sold it can open the receipt; a rep without its departments who didn't sell it can't
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  r := r || case when public.pos_receipt(v_sale)->>'receipt_no' is not null
                 then 'PASS 5a the rep can reopen their receipt' else 'FAIL 5a' end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash2, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_receipt(v_sale);
    r := r || 'FAIL 5b someone outside its departments opened the receipt';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have access to this receipt%' then 'PASS 5b ' || sqlerrm else 'FAIL 5b ' || sqlerrm end;
  end;

  -- 6. a paid order leaves the queue and can't be paid twice
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', v_total)));
    r := r || 'FAIL 6  paid twice';
  exception when others then
    r := r || case when sqlerrm like 'Order % is already paid.' and not exists (
                      select 1 from jsonb_array_elements(public.pos_order_queue()) o where (o->>'sale_id')::uuid = v_sale)
                   then 'PASS 6  ' || sqlerrm else 'FAIL 6  ' || sqlerrm end;
  end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
