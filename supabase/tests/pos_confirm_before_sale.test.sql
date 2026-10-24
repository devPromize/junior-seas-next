-- Automated tests for accounts that hold the sale until the money is confirmed
-- (supabase/migrations/20261024_pos_confirm_before_sale*.sql). Rolled back at the end.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();
  v_mgr  uuid := gen_random_uuid();
  v_rep  uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid();
  v_acc smallint; v_item bigint; v_price bigint; v_stock int;
  v_hold smallint; v_sale uuid; v_res jsonb; v_pays jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'cb-owner@example.test', 'authenticated', 'authenticated'), (v_mgr, 'cb-mgr@example.test', 'authenticated', 'authenticated'),
    (v_rep, 'cb-rep@example.test', 'authenticated', 'authenticated'), (v_cash, 'cb-cash@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'CB Owner', id from (select id from pos.roles where is_owner limit 1) o union all
  select v_mgr, 'CB Manager', id from pos.roles where name = 'Manager' union all
  select v_rep, 'CB Rep', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'CB Cashier', id from pos.roles where name = 'Cashier';
  select id into v_acc from pos.floors where code = 'accessories';
  insert into pos.staff_departments (user_id, floor_id) select u, v_acc from unnest(array[v_mgr, v_rep, v_cash]) u;
  select l.item_id, i.price_kobo, l.quantity into v_item, v_price, v_stock from pos.stock_levels l join pos.items i on i.id = l.item_id
  where l.floor_id = v_acc and not i.tracks_imei and i.is_active and l.quantity > 3 and i.price_kobo > 0 limit 1;

  -- 1. the owner sets Boss's account to hold the sale; confirming is switched on with it
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  v_hold := (public.pos_save_payment_account(null, 'Boss – Test Bank', true, false, false, true, null, null, null, 'business', false, true)->>'id')::smallint;
  r := r || (case when (select confirm_before_sale and needs_confirmation from pos.payment_accounts where id = v_hold)
                  then 'PASS 1  account set to hold the sale (confirming switched on with it)' else 'FAIL 1' end);
  v_pays := jsonb_build_array(jsonb_build_object('method', 'transfer', 'account_id', v_hold, 'amount_kobo', v_price));

  -- 2. a wrong amount is caught at the till, not later
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_sale := (public.pos_place_order(jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null, true)->>'sale_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'transfer', 'account_id', v_hold, 'amount_kobo', v_price - 100)));
    r := r || 'FAIL 2  short payment was accepted for holding'::text;
  exception when others then
    r := r || (case when sqlerrm like 'Payments add up to%' and (select awaiting_confirmation from pos.sales where id = v_sale) is null
                    then 'PASS 2  short payment refused straight away: ' || sqlerrm else 'FAIL 2  ' || sqlerrm end);
  end;

  -- 3. the right amount: the sale waits, nothing leaves stock, the owner and manager are alerted
  v_res := public.pos_checkout(v_sale, v_pays);
  r := r || (case when (v_res->>'awaiting')::boolean
                   and (select status from pos.sales where id = v_sale) = 'placed'
                   and (select awaiting_confirmation is not null and hold_expires_at is null from pos.sales where id = v_sale)
                   and not exists (select 1 from pos.sale_payments where sale_id = v_sale)
                   and not exists (select 1 from pos.stock_movements where ref_type = 'sale' and ref_id = v_sale::text)
                   and exists (select 1 from pos.notifications where recipient_id = v_boss and kind = 'sale_awaiting_confirmation' and entity_id = v_sale::text)
                   and exists (select 1 from pos.notifications where recipient_id = v_mgr and kind = 'sale_awaiting_confirmation' and entity_id = v_sale::text)
                  then 'PASS 3  sale held: no payment recorded, nothing out of stock, owner and manager alerted: '
                       || (select body from pos.notifications where recipient_id = v_boss and kind = 'sale_awaiting_confirmation' and entity_id = v_sale::text)
                  else 'FAIL 3  ' || v_res::text end);

  -- 4. a held order can't be checked out twice or cancelled underneath the confirmer
  begin
    perform public.pos_checkout(v_sale, v_pays);
    r := r || 'FAIL 4a checked out a held order twice'::text;
  exception when others then
    r := r || (case when sqlerrm like 'This order is already waiting%' then 'PASS 4a can''t check out a held order again' else 'FAIL 4a ' || sqlerrm end);
  end;
  begin
    update pos.sales set status = 'cancelled', cancelled_at = now() where id = v_sale;
    r := r || 'FAIL 4b cancelled a held order'::text;
  exception when others then
    r := r || (case when sqlerrm like '%waiting for a payment to be confirmed. Stop waiting first.' then 'PASS 4b held order can''t be cancelled' else 'FAIL 4b ' || sqlerrm end);
  end;

  -- 5. the cashier can't confirm; the manager sees it first on Payments to confirm
  begin
    perform public.pos_confirm_sale_payment(v_sale, true);
    r := r || 'FAIL 5a cashier confirmed their own held sale'::text;
  exception when others then
    r := r || (case when sqlerrm like 'You don''t have permission to confirm%' then 'PASS 5a cashiers can''t confirm' else 'FAIL 5a ' || sqlerrm end);
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  r := r || (case when exists (select 1 from jsonb_array_elements(public.pos_payments_to_confirm()->'awaiting') a where (a->>'sale_id')::uuid = v_sale)
                   and (public.pos_money_overview()->>'sales_waiting')::int >= 1
                  then 'PASS 5b on the manager''s list and counted on Money > Today' else 'FAIL 5b' end);

  -- 6. not received: needs a note, the order goes back to the queue, cashier and owner told
  begin
    perform public.pos_confirm_sale_payment(v_sale, false);
    r := r || 'FAIL 6a "not received" without a note'::text;
  exception when others then
    r := r || (case when sqlerrm like 'Say what happened%' then 'PASS 6a "Not received" needs a note' else 'FAIL 6a ' || sqlerrm end);
  end;
  perform public.pos_confirm_sale_payment(v_sale, false, 'Boss checked, nothing came in');
  r := r || (case when (select status = 'placed' and awaiting_confirmation is null and hold_expires_at > now() from pos.sales where id = v_sale)
                   and exists (select 1 from pos.notifications where recipient_id = v_cash and kind = 'sale_payment_not_received' and entity_id = v_sale::text)
                   and exists (select 1 from pos.notifications where recipient_id = v_boss and kind = 'sale_payment_not_received' and entity_id = v_sale::text)
                  then 'PASS 6b back in Checkout to take another payment; cashier and owner told' else 'FAIL 6b' end);

  -- 7. the cashier holds it again, then takes it back (customer pays cash instead)
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  perform public.pos_checkout(v_sale, v_pays);
  perform public.pos_stop_waiting(v_sale);
  r := r || (case when (select awaiting_confirmation is null and status = 'placed' from pos.sales where id = v_sale)
                   and exists (select 1 from pos.notifications where recipient_id = v_mgr and kind = 'sale_awaiting_withdrawn')
                  then 'PASS 7  cashier took the order back; watchers told there''s nothing to check' else 'FAIL 7' end);

  -- 8. held again, and the manager confirms: the sale completes in the cashier's name
  perform public.pos_checkout(v_sale, v_pays);
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  perform public.pos_confirm_sale_payment(v_sale, true);
  r := r || (case when (select status = 'paid' and checked_out_by = v_cash and awaiting_confirmation is null from pos.sales where id = v_sale)
                   and (select confirmation = 'confirmed' and confirmed_by = v_mgr and received_by = v_cash from pos.sale_payments where sale_id = v_sale)
                   and not exists (select 1 from pos.notifications n join pos.sale_payments p on n.entity_id = p.id::text
                                   where p.sale_id = v_sale and n.kind = 'payment_to_confirm')
                   and (select quantity from pos.stock_levels where item_id = v_item and floor_id = v_acc) = v_stock - 1
                   and exists (select 1 from pos.notifications where recipient_id = v_cash and kind = 'sale_payment_confirmed' and entity_id = v_sale::text)
                  then 'PASS 8  confirmed: sale paid under the cashier, payment already marked confirmed (nobody asked twice), stock down 1, cashier told to hand over'
                  else 'FAIL 8' end);

  -- 9. ordinary accounts are untouched: a cash sale completes at once
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_sale := (public.pos_place_order(jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null, true)->>'sale_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  v_res := public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', v_price)));
  r := r || (case when v_res->'awaiting' is null and (select status from pos.sales where id = v_sale) = 'paid'
                  then 'PASS 9  cash sales still complete straight away' else 'FAIL 9' end);

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
