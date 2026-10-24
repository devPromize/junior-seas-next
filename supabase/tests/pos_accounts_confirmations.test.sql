-- Automated tests for account details, payments that need confirming, and per-person
-- permissions (supabase/migrations/20261024_pos_accounts_confirmations*.sql). Rolled back at the end.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();
  v_mgr  uuid := gen_random_uuid();
  v_rep  uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid();
  v_acc smallint; v_item bigint; v_price bigint;
  v_access smallint; v_sale uuid; v_pay bigint; v_res jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'ac-owner@example.test', 'authenticated', 'authenticated'), (v_mgr, 'ac-mgr@example.test', 'authenticated', 'authenticated'),
    (v_rep, 'ac-rep@example.test', 'authenticated', 'authenticated'), (v_cash, 'ac-cash@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'AC Owner', id from (select id from pos.roles where is_owner limit 1) o union all
  select v_mgr, 'AC Manager', id from pos.roles where name = 'Manager' union all
  select v_rep, 'AC Rep', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'AC Cashier', id from pos.roles where name = 'Cashier';
  select id into v_acc from pos.floors where code = 'accessories';
  insert into pos.staff_departments (user_id, floor_id) select u, v_acc from unnest(array[v_mgr, v_rep, v_cash]) u;
  select l.item_id, i.price_kobo into v_item, v_price from pos.stock_levels l join pos.items i on i.id = l.item_id
  where l.floor_id = v_acc and not i.tracks_imei and i.is_active and l.quantity > 3 and i.price_kobo > 0 limit 1;

  -- 1. a manager can't set up accounts by default
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_save_payment_account(null, 'Test account', true, false);
    r := r || 'FAIL 1  manager set up an account without permission'::text;
  exception when others then
    r := r || (case when sqlerrm like 'You don''t have permission%' then 'PASS 1  managers can''t manage accounts by default' else 'FAIL 1  ' || sqlerrm end);
  end;

  -- 2. the owner adds Boss's personal Access Bank account; account numbers are checked
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_save_payment_account(null, 'Boss – Access Bank', true, false, false, true, 'Access Bank', '012345678', 'Boss Test', 'personal');
    r := r || 'FAIL 2a 9-digit account number accepted'::text;
  exception when others then
    r := r || (case when sqlerrm like 'A Nigerian account number has 10 digits%' then 'PASS 2a ' || sqlerrm else 'FAIL 2a ' || sqlerrm end);
  end;
  v_access := (public.pos_save_payment_account(null, 'Boss – Access Bank', true, false, false, true, 'Access Bank', '0123 456 789', 'Boss Test', 'personal')->>'id')::smallint;
  r := r || (case when (select needs_confirmation and account_number = '0123456789' from pos.payment_accounts where id = v_access)
                  then 'PASS 2b personal account saved (number tidied); confirming switched on automatically' else 'FAIL 2b' end);

  -- 3. the owner gives one manager the accounts permission, then takes it back
  perform public.pos_set_staff_permission(v_mgr, 'accounts.manage', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  perform public.pos_save_payment_account(null, 'Moniepoint POS – Phones floor', false, true);
  r := r || (case when exists (select 1 from pos.payment_accounts where name = 'Moniepoint POS – Phones floor')
                  then 'PASS 3a owner gave this one manager "Manage bank and card accounts"; they added a POS machine' else 'FAIL 3a' end);
  begin
    perform public.pos_set_staff_permission(v_rep, 'accounts.manage', true);
    r := r || 'FAIL 3b a manager handed out a permission'::text;
  exception when others then
    r := r || (case when sqlerrm like 'Only the owner can give%' then 'PASS 3b only the owner can hand out individual permissions' else 'FAIL 3b ' || sqlerrm end);
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  perform public.pos_set_staff_permission(v_mgr, 'accounts.manage', null);
  r := r || (case when not pos.user_has_permission(v_mgr, 'accounts.manage') then 'PASS 3c taken back: the manager is back to their role''s permissions' else 'FAIL 3c' end);

  -- 4. a customer pays into Boss's account: the sale completes, owner and manager are alerted
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_sale := (public.pos_place_order(jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null, true)->>'sale_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'transfer', 'account_id', v_access, 'amount_kobo', v_price)));
  select id into v_pay from pos.sale_payments where sale_id = v_sale;
  r := r || (case when (select status from pos.sales where id = v_sale) = 'paid'
                   and (select confirmation from pos.sale_payments where id = v_pay) = 'pending'
                   and exists (select 1 from pos.notifications where recipient_id = v_boss and kind = 'payment_to_confirm' and entity_id = v_pay::text)
                   and exists (select 1 from pos.notifications where recipient_id = v_mgr and kind = 'payment_to_confirm' and entity_id = v_pay::text)
                   and not exists (select 1 from pos.notifications where recipient_id in (v_rep, v_cash) and kind = 'payment_to_confirm')
                  then 'PASS 4  sale paid straight away; payment waiting for confirmation; owner and manager alerted: '
                       || (select body from pos.notifications where recipient_id = v_boss and entity_id = v_pay::text)
                  else 'FAIL 4' end);

  -- 5. a cashier can't confirm; "not received" needs a note and alerts the owner; "received" clears it
  begin
    perform public.pos_confirm_payment(v_pay, true);
    r := r || 'FAIL 5a cashier confirmed a payment'::text;
  exception when others then
    r := r || (case when sqlerrm like 'You don''t have permission to confirm%' then 'PASS 5a cashiers can''t confirm' else 'FAIL 5a ' || sqlerrm end);
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  r := r || (case when exists (select 1 from jsonb_array_elements(public.pos_payments_to_confirm()->'pending') p where (p->>'id')::bigint = v_pay)
                  then 'PASS 5b it''s on the manager''s "Payments to confirm" list' else 'FAIL 5b' end);
  begin
    perform public.pos_confirm_payment(v_pay, false);
    r := r || 'FAIL 5c "not received" without a note'::text;
  exception when others then
    r := r || (case when sqlerrm like 'Say what happened%' then 'PASS 5c "Not received" needs a note' else 'FAIL 5c ' || sqlerrm end);
  end;
  perform public.pos_confirm_payment(v_pay, true);
  r := r || (case when (select confirmation from pos.sale_payments where id = v_pay) = 'confirmed'
                   and (select confirmed_by from pos.sale_payments where id = v_pay) = v_mgr
                   and not exists (select 1 from jsonb_array_elements(public.pos_payments_to_confirm()->'pending') p where (p->>'id')::bigint = v_pay)
                  then 'PASS 5d manager confirmed it with Boss: off the list, recorded who and when' else 'FAIL 5d' end);

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
