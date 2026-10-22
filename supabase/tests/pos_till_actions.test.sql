-- Automated tests for the till actions (supabase/migrations/20261021_pos_till_actions.sql).
--
-- How it works: everything runs inside one block that deliberately fails at the very end,
-- so Postgres rolls back every change it made. No real stock, sales or staff are touched.
-- The "failure" message at the end IS the test report: one PASS/FAIL line per test.
--
-- It creates four pretend staff (two reps, a cashier, a manager), picks two real phones in
-- stock and one real non-phone item, and acts as each person in turn.

do $test$
declare
  r       text[] := '{}';
  v_rep1  uuid := gen_random_uuid();
  v_rep2  uuid := gen_random_uuid();
  v_cash  uuid := gen_random_uuid();
  v_mgr   uuid := gen_random_uuid();
  v_floor smallint;
  v_phone1 text; v_phone2 text; v_unit1 uuid;
  v_item  bigint; v_item_floor smallint; v_item_stock int; v_item_price bigint;
  v_phone_price bigint;
  v_opay  smallint;
  v_res   jsonb;
  v_sale  uuid; v_sale2 uuid; v_sale3 uuid; v_sale4 uuid;
  v_line  bigint;
  v_n     int;

begin
  -- ---------- setup ----------
  insert into auth.users (id, email, aud, role)
  values (v_rep1, 'test-rep1@example.test', 'authenticated', 'authenticated'),
         (v_rep2, 'test-rep2@example.test', 'authenticated', 'authenticated'),
         (v_cash, 'test-cashier@example.test', 'authenticated', 'authenticated'),
         (v_mgr,  'test-manager@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_rep1, 'Test Rep 1', id from pos.roles where name = 'Sales rep' union all
  select v_rep2, 'Test Rep 2', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'Test Cashier', id from pos.roles where name = 'Cashier' union all
  select v_mgr,  'Test Manager', id from pos.roles where name = 'Manager';

  insert into pos.staff_departments (user_id, floor_id)
  select s.id, f.id from unnest(array[v_rep1, v_rep2, v_cash, v_mgr]) s(id) cross join pos.floors f where f.is_active;

  select id into v_floor from pos.floors where code = 'phones';
  select id into v_opay from pos.payment_accounts where name = 'OPay';

  select ui.code, u.id, i.price_kobo into v_phone1, v_unit1, v_phone_price
  from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id and ui.slot = 1
  join pos.items i on i.id = u.item_id
  where u.status = 'in_stock' and i.is_active and i.price_kobo > 2000000
  order by u.id limit 1;
  select ui.code into v_phone2
  from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id and ui.slot = 1
  join pos.items i on i.id = u.item_id
  where u.status = 'in_stock' and i.is_active and u.id <> v_unit1 and i.price_kobo > 2500000
  order by u.id limit 1;

  select l.item_id, l.floor_id, l.quantity, i.price_kobo into v_item, v_item_floor, v_item_stock, v_item_price
  from pos.stock_levels l join pos.items i on i.id = l.item_id
  where not i.tracks_imei and i.is_active and l.quantity between 3 and 50 and i.price_kobo > 0
  order by l.item_id limit 1;

  r := r || format('setup: phone1 %s, phone2 %s, item %s with %s in stock', v_phone1, v_phone2, v_item, v_item_stock);

  -- ---------- 1. a rep places an order for a phone ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep1, 'role', 'authenticated')::text, true);
  begin
    v_res := pos.place_order(v_floor, jsonb_build_array(jsonb_build_object('code', v_phone1)), null, 'test order');
    v_sale := (v_res->>'sale_id')::uuid;
    select count(*) into v_n from pos.phone_units where id = v_unit1 and status = 'held' and held_by_sale = v_sale;
    r := r || case when v_n = 1 then 'PASS 1  rep places an order; the phone is held'
                   else 'FAIL 1  phone was not marked held' end;
  exception when others then r := r || ('FAIL 1  ' || sqlerrm);
  end;

  -- ---------- 2. a second rep can't take the same phone ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep2, 'role', 'authenticated')::text, true);
  begin
    perform pos.place_order(v_floor, jsonb_build_array(jsonb_build_object('code', v_phone1)));
    r := r || 'FAIL 2  a second rep could order a phone that was already held';
  exception when others then
    r := r || case when sqlerrm like 'This phone is already in order%' then 'PASS 2  second rep is told: ' || sqlerrm
                   else 'FAIL 2  wrong error: ' || sqlerrm end;
  end;

  -- ---------- 3. a rep can't take payment ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep1, 'role', 'authenticated')::text, true);
  begin
    perform pos.checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', v_phone_price)));
    r := r || 'FAIL 3  a rep was able to check out a sale';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 3  rep checkout refused: ' || sqlerrm
                   else 'FAIL 3  wrong error: ' || sqlerrm end;
  end;

  -- ---------- 4. a discount must say who authorised it ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  begin
    perform pos.checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', v_phone_price - 100000)), 100000);
    r := r || 'FAIL 4  a discount was applied without naming who authorised it';
  exception when others then
    r := r || case when sqlerrm = 'Choose who authorised this discount.' then 'PASS 4  discount needs an authoriser: ' || sqlerrm
                   else 'FAIL 4  wrong error: ' || sqlerrm end;
  end;

  -- ---------- 5. payments must add up ----------
  begin
    perform pos.checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', 100)));
    r := r || 'FAIL 5  a short payment was accepted';
  exception when others then
    r := r || case when sqlerrm like 'Payments add up to%' then 'PASS 5  short payment refused: ' || sqlerrm
                   else 'FAIL 5  wrong error: ' || sqlerrm end;
  end;

  -- ---------- 6. card payment needs an account ----------
  begin
    perform pos.checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'card', 'amount_kobo', v_phone_price)));
    r := r || 'FAIL 6  a card payment without an account was accepted';
  exception when others then
    r := r || case when sqlerrm like 'Choose which bank%' then 'PASS 6  card payment without an account refused'
                   else 'FAIL 6  wrong error: ' || sqlerrm end;
  end;

  -- ---------- 7. cashier checks out with a split payment ----------
  begin
    select quantity into v_n from pos.stock_levels l join pos.phone_units u on u.item_id = l.item_id and u.floor_id = l.floor_id where u.id = v_unit1;
    v_res := pos.checkout(v_sale, jsonb_build_array(
      jsonb_build_object('method', 'cash', 'amount_kobo', 1000000),
      jsonb_build_object('method', 'transfer', 'account_id', v_opay, 'amount_kobo', v_phone_price - 1000000)));
    if (select status from pos.sales where id = v_sale) = 'paid'
       and (select status from pos.phone_units where id = v_unit1) = 'sold'
       and (select quantity from pos.stock_levels l join pos.phone_units u on u.item_id = l.item_id and u.floor_id = l.floor_id where u.id = v_unit1) = v_n - 1
       and (select count(*) from pos.sale_payments where sale_id = v_sale) = 2 then
      r := r || ('PASS 7  split-payment checkout: ' || (v_res->>'receipt_no') || ' paid, phone sold, stock down by 1');
    else
      r := r || 'FAIL 7  checkout finished but the records are wrong';
    end if;
  exception when others then r := r || ('FAIL 7  ' || sqlerrm);
  end;

  -- ---------- 8. a sold phone can't be ordered again ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep2, 'role', 'authenticated')::text, true);
  begin
    perform pos.place_order(v_floor, jsonb_build_array(jsonb_build_object('code', v_phone1)));
    r := r || 'FAIL 8  a sold phone was ordered again';
  exception when others then
    r := r || case when sqlerrm like 'This phone shows as sold%' then 'PASS 8  sold phone refused: ' || sqlerrm
                   else 'FAIL 8  wrong error: ' || sqlerrm end;
  end;

  -- ---------- 9. other items stop at zero ----------
  begin
    v_res := pos.place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', v_item_stock + 1)));
    v_sale2 := (v_res->>'sale_id')::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
    perform pos.checkout(v_sale2, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', (v_item_stock + 1) * v_item_price)));
    r := r || 'FAIL 9  sold more than the stock on record';
  exception when others then
    r := r || case when sqlerrm like 'Not enough%' then 'PASS 9  overselling refused: ' || sqlerrm
                   else 'FAIL 9  wrong error: ' || sqlerrm end;
  end;

  -- ---------- 10. quick discount: cashier applies ₦10,000 on the whole order, manager alerted ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep1, 'role', 'authenticated')::text, true);
  begin
    v_res := pos.place_order(v_floor, jsonb_build_array(jsonb_build_object('code', v_phone2),
                                                        jsonb_build_object('item_id', v_item, 'qty', 1, 'floor_id', v_item_floor)),
                             null, 'Boss said ₦10,000 off', 1000000);
    v_sale3 := (v_res->>'sale_id')::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
    begin
      perform pos.checkout(v_sale3, jsonb_build_array(jsonb_build_object('method', 'cash',
        'amount_kobo', (v_res->>'total_kobo')::bigint - 1000000)), 1000000, null, null, v_rep2);
      r := r || 'FAIL 10a a rep was accepted as the authoriser';
    exception when others then
      r := r || case when sqlerrm like '%can''t authorise discounts.' then 'PASS 10a reps can''t authorise: ' || sqlerrm else 'FAIL 10a ' || sqlerrm end;
    end;
    perform pos.checkout(v_sale3, jsonb_build_array(jsonb_build_object('method', 'cash',
      'amount_kobo', (v_res->>'total_kobo')::bigint - 1000000)), 1000000, null, null, v_mgr);
    r := r || case when (select discount_kobo from pos.sales where id = v_sale3) = 1000000
                    and (select sum(line_discount_kobo) from pos.sale_lines where sale_id = v_sale3) = 1000000
                    and (select count(*) from pos.sale_lines where sale_id = v_sale3 and line_discount_kobo > 0) = 2
                   then 'PASS 10b ₦10,000 off the whole order, no waiting, spread across both items'
                   else 'FAIL 10b discount not recorded or not spread' end;
    r := r || case when exists (select 1 from pos.notifications where recipient_id = v_mgr and entity_id = v_sale3::text)
                    and exists (select 1 from pos.audit_log where entity_id = v_sale3::text and action = 'discount_applied'
                                  and detail->>'approved_by' = v_mgr::text and detail->>'applied_by' = v_cash::text)
                   then 'PASS 10c manager alerted: ' || (select body from pos.notifications where recipient_id = v_mgr and entity_id = v_sale3::text)
                   else 'FAIL 10c manager not alerted' end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
    perform pos.dispute_discount(v_sale3, 'Test');
    r := r || case when exists (select 1 from pos.audit_log where entity_id = v_sale3::text and action = 'discount_disputed')
                   then 'PASS 10d manager can flag "I didn''t approve this"' else 'FAIL 10d dispute not logged' end;
  exception when others then r := r || ('FAIL 10  ' || sqlerrm);
  end;

  -- ---------- 11. cancel an unpaid order: phone goes back on sale ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep1, 'role', 'authenticated')::text, true);
  begin
    v_res := pos.place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)));
    v_sale4 := (v_res->>'sale_id')::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
    begin
      perform pos.cancel_order(v_sale4, '  ');
      r := r || 'FAIL 11a cancelled without a reason';
    exception when others then
      r := r || case when sqlerrm like 'Say why%' then 'PASS 11a cancelling needs a reason' else 'FAIL 11a ' || sqlerrm end;
    end;
    perform pos.cancel_order(v_sale4, 'Customer changed their mind');
    r := r || case when (select status from pos.sales where id = v_sale4) = 'cancelled'
                   then 'PASS 11b order cancelled with a reason' else 'FAIL 11b order not cancelled' end;
  exception when others then r := r || ('FAIL 11  ' || sqlerrm);
  end;

  -- ---------- 12. returns: phone faulty (stays out of stock), item back in stock ----------
  begin
    -- a cashier can't refund
    begin
      perform pos.return_sale(v_sale, (select jsonb_agg(jsonb_build_object('sale_line_id', id, 'outcome', 'faulty')) from pos.sale_lines where sale_id = v_sale), 'Screen fault');
      r := r || 'FAIL 12a a cashier processed a return';
    exception when others then
      r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 12a cashier return refused' else 'FAIL 12a ' || sqlerrm end;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
    select quantity into v_n from pos.stock_levels l join pos.phone_units u on u.item_id = l.item_id and u.floor_id = l.floor_id where u.id = v_unit1;
    perform pos.return_sale(v_sale,
      (select jsonb_agg(jsonb_build_object('sale_line_id', id, 'outcome', 'faulty')) from pos.sale_lines where sale_id = v_sale),
      'Screen fault', v_phone_price, 'cash', null);
    r := r || case when (select status from pos.phone_units where id = v_unit1) = 'faulty'
                    and (select quantity from pos.stock_levels l join pos.phone_units u on u.item_id = l.item_id and u.floor_id = l.floor_id where u.id = v_unit1) = v_n
                   then 'PASS 12b faulty phone returned: marked faulty, not put back on sale'
                   else 'FAIL 12b faulty return recorded wrongly' end;
    begin
      perform pos.return_sale(v_sale,
        (select jsonb_agg(jsonb_build_object('sale_line_id', id, 'outcome', 'back_in_stock')) from pos.sale_lines where sale_id = v_sale),
        'Again');
      r := r || 'FAIL 12c the same phone was returned twice';
    exception when others then
      r := r || case when sqlerrm like 'Only 0 of%' then 'PASS 12c can''t return the same item twice' else 'FAIL 12c ' || sqlerrm end;
    end;
  exception when others then r := r || ('FAIL 12  ' || sqlerrm);
  end;

  -- ---------- 13. wholesale ----------
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_rep1, 'role', 'authenticated')::text, true);
    begin
      perform pos.place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 2, 'price_tier', 'wholesale')));
      r := r || 'FAIL 13a a rep sold at wholesale without permission';
    exception when others then
      r := r || case when sqlerrm like 'You don''t have permission to sell at the wholesale%' then 'PASS 13a rep wholesale refused' else 'FAIL 13a ' || sqlerrm end;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
    begin
      perform pos.place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 2, 'price_tier', 'wholesale')));
      r := r || 'FAIL 13b wholesale sale with no wholesale price set';
    exception when others then
      r := r || case when sqlerrm like '%has no wholesale price set%' then 'PASS 13b no wholesale price: refused' else 'FAIL 13b ' || sqlerrm end;
    end;
    update pos.items set wholesale_price_kobo = greatest(v_item_price - 10000, 0) where id = v_item;
    v_res := pos.place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 2, 'price_tier', 'wholesale')));
    r := r || case when (v_res->>'total_kobo')::bigint = 2 * greatest(v_item_price - 10000, 0)
                   then 'PASS 13c manager sells at the wholesale price' else 'FAIL 13c wrong wholesale total' end;
  exception when others then r := r || ('FAIL 13  ' || sqlerrm);
  end;

  -- ---------- 14. expired holds are released ----------
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_rep2, 'role', 'authenticated')::text, true);
    select ui.code into v_phone2 from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id
    where u.status = 'in_stock' order by u.id desc limit 1;
    v_res := pos.place_order(v_floor, jsonb_build_array(jsonb_build_object('code', v_phone2)));
    update pos.sales set hold_expires_at = now() - interval '1 minute' where id = (v_res->>'sale_id')::uuid;
    v_n := pos.release_expired_holds();
    r := r || case when (select u.status from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id where ui.code = v_phone2) = 'in_stock'
                   then format('PASS 14 expired hold released (%s phone)', v_n) else 'FAIL 14 hold not released' end;
  exception when others then r := r || ('FAIL 14 ' || sqlerrm);
  end;

  -- ---------- 15. the stock ledger can't be edited ----------
  begin
    update pos.stock_movements set qty_change = 999 where id = (select max(id) from pos.stock_movements);
    r := r || 'FAIL 15 a stock movement was edited';
  exception when others then
    r := r || case when sqlerrm like 'Stock movements cannot be changed%' then 'PASS 15 ledger edit refused' else 'FAIL 15 ' || sqlerrm end;
  end;

  -- ---------- 16. a large discount needs the manager's PIN at the cash desk ----------
  begin
    update pos.settings set value = '50' where key = 'discount_quick_max_kobo';   -- pretend the quick limit is 50 kobo
    perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
    v_res := pos.place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)));
    begin
      perform pos.checkout((v_res->>'sale_id')::uuid, jsonb_build_array(jsonb_build_object('method', 'cash',
        'amount_kobo', (v_res->>'total_kobo')::bigint - 100)), 100, null, null, v_mgr);
      r := r || 'FAIL 16  a discount above the quick limit went through without a PIN';
    exception when others then
      r := r || case when sqlerrm like 'A discount above % needs a manager%' then 'PASS 16  above the quick limit: ' || sqlerrm else 'FAIL 16  ' || sqlerrm end;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
    perform pos.set_my_pin('482615');
    perform set_config('request.jwt.claims', json_build_object('sub', v_rep1, 'role', 'authenticated')::text, true);
    v_res := pos.place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null, null, 100);
    v_sale4 := (v_res->>'sale_id')::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
    v_res := pos.approve_discount_with_pin(v_sale4, v_mgr, '000000', 100);
    r := r || case when (v_res->>'ok')::boolean = false and v_res->>'message' = 'Wrong PIN.'
                   then 'PASS 16a wrong PIN refused' else 'FAIL 16a ' || v_res::text end;
    v_res := pos.approve_discount_with_pin(v_sale4, v_mgr, '482615', 100);
    r := r || case when (v_res->>'ok')::boolean then 'PASS 16b correct PIN approves the large discount' else 'FAIL 16b ' || v_res::text end;
    perform pos.checkout(v_sale4, jsonb_build_array(jsonb_build_object('method', 'cash',
      'amount_kobo', (select total_kobo from pos.sales where id = v_sale4) - 100)), 100);
    r := r || case when (select status from pos.sales where id = v_sale4) = 'paid'
                   then 'PASS 16c cashier checks out with the PIN-approved discount' else 'FAIL 16c not paid' end;
    -- five wrong PINs lock it
    for v_n in 1..5 loop
      perform pos.approve_discount_with_pin(v_sale4, v_mgr, '111111', 100);
    end loop;
    v_res := pos.approve_discount_with_pin(v_sale4, v_mgr, '482615', 100);
    r := r || case when v_res->>'message' like 'Too many wrong PINs%' then 'PASS 16d PIN locked after 5 wrong tries'
                   else 'FAIL 16d ' || v_res::text end;
  exception when others then r := r || ('FAIL 16 ' || sqlerrm);
  end;

  -- ---------- report, and roll everything back ----------
  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
