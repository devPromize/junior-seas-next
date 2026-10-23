-- Automated tests for Sales and returns (supabase/migrations/20261023_pos_sales_history.sql).
-- A real journey: a phone and an accessory are sold, then the customer brings the accessory back.
-- Runs as pretend staff, then rolls everything back.

do $test$
declare
  r      text[] := '{}';
  v_rep  uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid();
  v_mgr  uuid := gen_random_uuid();   -- manager: can refund
  v_acc smallint; v_phones smallint;
  v_phone text; v_item bigint; v_stock int; v_opay smallint;
  v_res jsonb; v_sale uuid; v_total bigint; v_acc_line bigint; v_phone_line bigint; v_line_value bigint;
  v_old uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (v_rep, 'sr-rep@example.test', 'authenticated', 'authenticated'),
    (v_cash, 'sr-cash@example.test', 'authenticated', 'authenticated'),
    (v_mgr, 'sr-mgr@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_rep, 'SR Rep', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'SR Cashier', id from pos.roles where name = 'Cashier' union all
  select v_mgr, 'SR Manager', id from pos.roles where name = 'Manager';
  select id into v_acc from pos.floors where code = 'accessories';
  select id into v_phones from pos.floors where code = 'phones';
  insert into pos.staff_departments (user_id, floor_id)
  select s, f from unnest(array[v_rep, v_cash, v_mgr]) s cross join unnest(array[v_acc, v_phones]) f;
  select id into v_opay from pos.payment_accounts where name = 'OPay';
  select ui.code into v_phone from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id and ui.slot = 1
  where u.status = 'in_stock' and u.floor_id = v_phones limit 1;
  select l.item_id, l.quantity into v_item, v_stock from pos.stock_levels l join pos.items i on i.id = l.item_id
  where l.floor_id = v_acc and not i.tracks_imei and i.is_active and l.quantity > 3 and i.price_kobo > 0 limit 1;

  -- 1. the old system's sales came over; stock sent to our branch is kept apart
  r := r || case when (select count(*) from pos.sales where source = 'legacy') = 33347
                  and (select count(*) from pos.sales where is_branch_transfer) > 3000
                  and (select count(*) from pos.sale_lines where unit_id is not null) > 8900
                 then format('PASS 1  %s old sales, %s of them stock sent to our branch (not counted as sales)',
                             (select count(*) from pos.sales where source = 'legacy'), (select count(*) from pos.sales where is_branch_transfer))
                 else 'FAIL 1  history import' end;

  -- 2. a sale happens: rep places it, cashier takes payment
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_res := public.pos_place_order(jsonb_build_array(jsonb_build_object('code', v_phone), jsonb_build_object('item_id', v_item, 'qty', 2)), null, true);
  v_sale := (v_res->>'sale_id')::uuid; v_total := (v_res->>'total_kobo')::bigint;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'transfer', 'account_id', v_opay, 'amount_kobo', v_total)));

  -- 3. the rep sees their own sale in the list; the cashier finds it by receipt number and by IMEI
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_res := public.pos_sales();
  r := r || case when (v_res->>'total')::int = 1 and (v_res->'rows'->0->>'id')::uuid = v_sale
                 then 'PASS 3a a rep sees only their own sale' else 'FAIL 3a rep sees ' || (v_res->>'total') end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  r := r || case when (public.pos_sales((select receipt_no from pos.sales where id = v_sale))->'rows'->0->>'id')::uuid = v_sale
                  and (public.pos_sales(v_phone)->'rows'->0->>'id')::uuid = v_sale
                 then 'PASS 3b found by receipt number and by IMEI' else 'FAIL 3b search' end;

  -- 4. the IMEI lookup shows the phone as sold, on which receipt
  v_res := public.pos_lookup_imei(v_phone);
  r := r || case when v_res->>'status' = 'sold' and (v_res->'sale'->>'id')::uuid = v_sale
                 then 'PASS 4  IMEI lookup: sold on ' || (v_res->'sale'->>'receipt_no') else 'FAIL 4  ' || coalesce(v_res::text, 'null') end;

  -- 5. a cashier can't refund
  select id into v_acc_line from pos.sale_lines where sale_id = v_sale and unit_id is null;
  select id into v_phone_line from pos.sale_lines where sale_id = v_sale and unit_id is not null;
  begin
    perform public.pos_return_sale(v_sale, jsonb_build_array(jsonb_build_object('sale_line_id', v_acc_line, 'qty', 1, 'outcome', 'back_in_stock')), 'Changed mind');
    r := r || 'FAIL 5  cashier refunded';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 5  cashier can''t refund' else 'FAIL 5  ' || sqlerrm end;
  end;

  -- 6. the manager takes one accessory back into stock and refunds it
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  select unit_price_kobo - line_discount_kobo / qty into v_line_value from pos.sale_lines where id = v_acc_line;
  perform public.pos_return_sale(v_sale, jsonb_build_array(jsonb_build_object('sale_line_id', v_acc_line, 'qty', 1, 'outcome', 'back_in_stock')),
                                 'Customer changed their mind', v_line_value, 'cash');
  v_res := public.pos_sale(v_sale);
  r := r || case when (select quantity from pos.stock_levels where item_id = v_item and floor_id = v_acc) = v_stock - 1
                  and (v_res->>'refunded_kobo')::bigint = v_line_value
                  and (select (l->>'returned')::int from jsonb_array_elements(v_res->'lines') l where (l->>'id')::bigint = v_acc_line) = 1
                 then format('PASS 6  1 of 2 accessories back in stock (%s → %s), %s refunded', v_stock - 2, v_stock - 1, pos.naira(v_line_value))
                 else 'FAIL 6  ' || left(v_res::text, 300) end;

  -- 7. the phone comes back faulty: out of stock, marked faulty
  perform public.pos_return_sale(v_sale, jsonb_build_array(jsonb_build_object('sale_line_id', v_phone_line, 'outcome', 'faulty')), 'Screen fault', 0);
  r := r || case when public.pos_lookup_imei(v_phone)->>'status' = 'faulty'
                 then 'PASS 7  returned phone marked faulty, not put back on sale' else 'FAIL 7  phone status ' || (public.pos_lookup_imei(v_phone)->>'status') end;

  -- 8. can't refund more than was paid
  begin
    perform public.pos_return_sale(v_sale, jsonb_build_array(jsonb_build_object('sale_line_id', v_acc_line, 'qty', 1, 'outcome', 'back_in_stock')),
                                   'Again', v_total, 'cash');
    r := r || 'FAIL 8  refunded more than was paid';
  exception when others then
    r := r || case when sqlerrm like 'The refund can be at most%' then 'PASS 8  ' || sqlerrm else 'FAIL 8  ' || sqlerrm end;
  end;

  -- 9. a sale from the old system can be returned too
  select s.id into v_old from pos.sales s join pos.sale_lines l on l.sale_id = s.id
  where s.source = 'legacy' and not s.is_branch_transfer and l.item_id is not null and l.unit_id is null and l.floor_id = v_acc
    and not exists (select 1 from pos.returns rt where rt.sale_id = s.id) order by s.paid_at desc limit 1;
  perform public.pos_return_sale(v_old, jsonb_build_array(jsonb_build_object(
            'sale_line_id', (select id from pos.sale_lines where sale_id = v_old and item_id is not null limit 1), 'qty', 1, 'outcome', 'back_in_stock')),
          'Brought back after the switch-over', 0);
  r := r || case when jsonb_array_length(public.pos_sale(v_old)->'returns') = 1
                 then 'PASS 9  an old-system sale (' || (select receipt_no from pos.sales where id = v_old) || ') returned in the new POS' else 'FAIL 9' end;

  -- 10. stock sent to our branch can't be "returned" as a sale
  begin
    perform public.pos_return_sale((select id from pos.sales where is_branch_transfer limit 1),
            jsonb_build_array(jsonb_build_object('sale_line_id', 0, 'outcome', 'faulty')), 'Test');
    r := r || 'FAIL 10 returned a branch transfer';
  exception when others then
    r := r || case when sqlerrm in ('This was stock sent to our branch, not a sale.', 'This sale has no items from your departments.')
                   then 'PASS 10 ' || sqlerrm else 'FAIL 10 ' || sqlerrm end;
  end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
