-- Automated tests for Money (supabase/migrations/20261023_pos_money.sql): supplier bills and
-- reminders, expenses, cash-up, alerts and payment accounts. Rolled back at the end.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();
  v_mgr  uuid := gen_random_uuid();
  v_inv  uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid();
  v_rep  uuid := gen_random_uuid();
  v_acc smallint; v_opay smallint; v_fuel smallint;
  v_item bigint; v_price bigint;
  v_res jsonb; v_buy uuid; v_sale uuid; v_n int;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'mo-owner@example.test', 'authenticated', 'authenticated'), (v_mgr, 'mo-mgr@example.test', 'authenticated', 'authenticated'),
    (v_inv, 'mo-inv@example.test', 'authenticated', 'authenticated'), (v_cash, 'mo-cash@example.test', 'authenticated', 'authenticated'),
    (v_rep, 'mo-rep@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'MO Owner', id from (select id from pos.roles where is_owner limit 1) o union all
  select v_mgr, 'MO Manager', id from pos.roles where name = 'Manager' union all
  select v_inv, 'MO Inventory', id from pos.roles where name = 'Inventory officer' union all
  select v_cash, 'MO Cashier', id from pos.roles where name = 'Cashier' union all
  select v_rep, 'MO Rep', id from pos.roles where name = 'Sales rep';
  select id into v_acc from pos.floors where code = 'accessories';
  insert into pos.staff_departments (user_id, floor_id) select u, v_acc from unnest(array[v_mgr, v_inv, v_cash, v_rep]) u;
  select id into v_opay from pos.payment_accounts where name = 'OPay';
  select id into v_fuel from pos.expense_categories where name = 'Diesel / fuel';
  select l.item_id, i.price_kobo into v_item, v_price from pos.stock_levels l join pos.items i on i.id = l.item_id
  where l.floor_id = v_acc and not i.tracks_imei and i.is_active and l.quantity > 3 and i.price_kobo > 0 limit 1;

  -- 1. the old system's purchases are settled
  r := r || case when not exists (select 1 from pos.deliveries d where d.legacy_id is not null and pos.purchase_owed(d) > 0)
                 then 'PASS 1  all 344 old purchases marked settled' else 'FAIL 1  old purchases still owing' end;

  -- 2. a new purchase is owed; the inventory officer who recorded it can't mark it paid
  perform set_config('request.jwt.claims', json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);
  v_buy := (public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 10, 'unit_cost_kobo', 1000000)))->>'delivery_id')::uuid;
  begin
    perform public.pos_pay_supplier(v_buy, 1000000, v_today, 'cash');
    r := r || 'FAIL 2  inventory officer paid a supplier';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 2  ₦100,000 purchase owed; inventory officer can''t mark it paid' else 'FAIL 2  ' || sqlerrm end;
  end;

  -- 3. the manager pays part by transfer, with checks on amount, date and account
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_pay_supplier(v_buy, 11000000, v_today, 'cash');
    r := r || 'FAIL 3a overpaid';
  exception when others then
    r := r || case when sqlerrm like 'Only ₦100,000 is owed%' then 'PASS 3a ' || sqlerrm else 'FAIL 3a ' || sqlerrm end;
  end;
  begin
    perform public.pos_pay_supplier(v_buy, 4000000, v_today + 1, 'cash');
    r := r || 'FAIL 3b future date accepted';
  exception when others then
    r := r || case when sqlerrm like 'The payment date can''t be in the future%' then 'PASS 3b ' || sqlerrm else 'FAIL 3b ' || sqlerrm end;
  end;
  begin
    perform public.pos_pay_supplier(v_buy, 4000000, v_today, 'transfer');
    r := r || 'FAIL 3c transfer without an account';
  exception when others then
    r := r || case when sqlerrm like 'Choose which bank%' then 'PASS 3c transfer needs the account' else 'FAIL 3c ' || sqlerrm end;
  end;
  v_res := public.pos_pay_supplier(v_buy, 4000000, v_today, 'transfer', v_opay, 'TRF-123');
  r := r || case when (v_res->>'owed_kobo')::bigint = 6000000 then 'PASS 3d ₦40,000 paid by OPay transfer, ₦60,000 left' else 'FAIL 3d ' || v_res::text end;

  -- 4. paying the rest clears it; it can't be paid twice
  perform public.pos_pay_supplier(v_buy, 6000000, v_today, 'cash');
  begin
    perform public.pos_pay_supplier(v_buy, 100, v_today, 'cash');
    r := r || 'FAIL 4  paid twice';
  exception when others then
    r := r || case when sqlerrm like '% is already fully paid.' then 'PASS 4  fully paid; ' || sqlerrm else 'FAIL 4  ' || sqlerrm end;
  end;

  -- 5. a bill unpaid for 40 days reminds the owner and the manager, once a week
  perform set_config('request.jwt.claims', json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);
  v_buy := (public.pos_record_purchase(v_acc, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1, 'unit_cost_kobo', 500000)))->>'delivery_id')::uuid;
  update pos.deliveries set received_at = now() - interval '40 days' where id = v_buy;
  perform pos.remind_overdue_supplier_bills();
  v_n := (select count(*) from pos.notifications where entity_id = v_buy::text and recipient_id in (v_boss, v_mgr));
  perform pos.remind_overdue_supplier_bills();
  r := r || case when v_n = 2 and (select count(*) from pos.notifications where entity_id = v_buy::text and recipient_id in (v_boss, v_mgr)) = 2
                  and not exists (select 1 from pos.notifications where entity_id = v_buy::text and recipient_id in (v_inv, v_rep))
                 then 'PASS 5  overdue bill reminded owner and manager: ' || (select body from pos.notifications where entity_id = v_buy::text and recipient_id = v_boss)
                 else 'FAIL 5  reminders: ' || v_n end;

  -- 6. expenses: the manager records fuel; a rep can't; date and description are checked
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_record_expense(v_today, v_fuel, 500000, 'cash', 'Diesel');
    r := r || 'FAIL 6a rep recorded an expense';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 6a rep can''t record expenses' else 'FAIL 6a ' || sqlerrm end;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_record_expense(v_today, v_fuel, 500000, 'cash', '  ');
    r := r || 'FAIL 6b expense without a description';
  exception when others then
    r := r || case when sqlerrm = 'Say what it was for.' then 'PASS 6b ' || sqlerrm else 'FAIL 6b ' || sqlerrm end;
  end;
  v_res := public.pos_record_expense(v_today, v_fuel, 4500000, 'cash', '25 litres of diesel for the generator');
  r := r || case when v_res->>'ref_no' ~ ('^EX' || to_char(v_today, 'YYYY') || '/\d{4}$')
                 then 'PASS 6c expense recorded as ' || (v_res->>'ref_no') else 'FAIL 6c ' || v_res::text end;

  -- 7. cash-up: a cash sale, then the drawer count
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_sale := (public.pos_place_order(jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null, true)->>'sale_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', v_price)));
  v_res := public.pos_cash_up_preview();
  r := r || case when (v_res->>'cash_in_kobo')::bigint = v_price
                 then 'PASS 7a cash-up expects ' || pos.naira(v_price) || ' from today''s cash sale' else 'FAIL 7a ' || v_res::text end;
  begin
    perform public.pos_cash_up(v_price + 500000 - 100000, 500000);   -- ₦5,000 float, ₦1,000 short
    r := r || 'FAIL 7b closed a short drawer without a note';
  exception when others then
    r := r || case when sqlerrm like 'The drawer is ₦1,000 short%' then 'PASS 7b ' || sqlerrm else 'FAIL 7b ' || sqlerrm end;
  end;
  v_res := public.pos_cash_up(v_price + 500000 - 100000, 500000, 'Gave change from my own money earlier');
  r := r || case when (v_res->>'difference_kobo')::bigint = -100000
                  and exists (select 1 from pos.notifications where recipient_id = v_boss and kind = 'cash_up_difference')
                 then 'PASS 7c short by ₦1,000 with a note; owner alerted' else 'FAIL 7c ' || v_res::text end;

  -- 8. the owner's money overview and alerts
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  v_res := public.pos_money_overview();
  r := r || case when (v_res->>'expenses_kobo')::bigint >= 4500000 and (v_res->>'supplier_payments_kobo')::bigint >= 10000000
                  and (v_res->>'overdue')::int >= 1 and jsonb_array_length(v_res->'cash_ups') >= 1
                 then format('PASS 8a overview: takings %s, expenses %s, paid to suppliers %s, %s overdue',
                             pos.naira((v_res->>'takings_kobo')::bigint), pos.naira((v_res->>'expenses_kobo')::bigint),
                             pos.naira((v_res->>'supplier_payments_kobo')::bigint), v_res->>'overdue')
                 else 'FAIL 8a ' || left(v_res::text, 300) end;
  v_n := (public.pos_me()->>'unread_alerts')::int;
  perform public.pos_mark_alerts_read();
  r := r || case when v_n >= 2 and (public.pos_me()->>'unread_alerts')::int = 0
                 then format('PASS 8b owner had %s unread alerts; marked read', v_n) else 'FAIL 8b ' || v_n end;

  -- 9. payment accounts: add one, no duplicates, must take something
  v_res := public.pos_save_payment_account(null, 'Moniepoint', true, true);
  begin
    perform public.pos_save_payment_account(null, 'moniepoint', true, false);
    r := r || 'FAIL 9  duplicate account';
  exception when others then
    r := r || case when sqlerrm like 'There''s already an account called%' then 'PASS 9  Moniepoint added; duplicate refused' else 'FAIL 9  ' || sqlerrm end;
  end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
