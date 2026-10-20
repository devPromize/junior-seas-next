-- Automated tests for the POS app's entry points (supabase/migrations/20261021_pos_app_api.sql).
-- Same approach as pos_till_actions.test.sql: runs as pretend staff, then rolls everything back.

do $test$
declare
  r      text[] := '{}';
  v_rep  uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid();
  v_web  uuid := gen_random_uuid();   -- a website customer account, not staff
  v_floor smallint;
  v_item bigint; v_item_floor smallint;
  v_res  jsonb; v_res2 jsonb;
  v_cust uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (v_rep,  'api-rep@example.test', 'authenticated', 'authenticated'),
    (v_cash, 'api-cashier@example.test', 'authenticated', 'authenticated'),
    (v_web,  'api-shopper@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_rep, 'API Rep', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'API Cashier', id from pos.roles where name = 'Cashier';
  select id into v_floor from pos.floors where code = 'ground';
  select l.item_id, l.floor_id into v_item, v_item_floor
  from pos.stock_levels l join pos.items i on i.id = l.item_id
  where not i.tracks_imei and i.is_active and l.quantity > 5 order by l.item_id limit 1;

  -- 1. phone numbers in every common format become one standard format
  r := r || case when pos.normalize_phone('0803 123 4567') = '+2348031234567'
                  and pos.normalize_phone('2348031234567') = '+2348031234567'
                  and pos.normalize_phone('+234 803 123 4567') = '+2348031234567'
                  and pos.normalize_phone('803-123-4567') = '+2348031234567'
                  and pos.normalize_phone('12345') is null
                 then 'PASS 1  phone numbers normalised to +2348031234567' else 'FAIL 1  phone normalising' end;

  -- 2. a website customer can't use the POS
  perform set_config('request.jwt.claims', json_build_object('sub', v_web, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_me();
    r := r || 'FAIL 2  a non-staff account reached the POS';
  exception when others then
    r := r || case when sqlerrm like 'This account isn''t set up as staff%' then 'PASS 2  non-staff refused: ' || sqlerrm else 'FAIL 2  ' || sqlerrm end;
  end;

  -- 3. who am I
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_res := public.pos_me();
  r := r || case when v_res->>'role' = 'Sales rep' and v_res->'permissions' ? 'sales.create'
                  and not (v_res->'permissions' ? 'sales.checkout') and jsonb_array_length(v_res->'floors') = 3
                 then 'PASS 3  rep sees their role, permissions and floors' else 'FAIL 3  ' || v_res::text end;

  -- 4. the catalogue loads in one go
  v_res := public.pos_catalogue();
  r := r || case when jsonb_array_length(v_res->'items') > 3000 and jsonb_array_length(v_res->'units') > 400
                 then format('PASS 4  catalogue: %s items, %s stock rows, %s phones',
                             jsonb_array_length(v_res->'items'), jsonb_array_length(v_res->'stock'), jsonb_array_length(v_res->'units'))
                 else 'FAIL 4  catalogue too small' end;

  -- 5. a customer needs a name
  begin
    perform public.pos_save_customer('0803 123 4567', '  ');
    r := r || 'FAIL 5  saved a customer without a name';
  exception when others then
    r := r || case when sqlerrm = 'Add the customer''s name.' then 'PASS 5  name required' else 'FAIL 5  ' || sqlerrm end;
  end;

  -- 6. a bad number is refused
  begin
    perform public.pos_save_customer('12345', 'Chika Okafor');
    r := r || 'FAIL 6  saved a bad phone number';
  exception when others then
    r := r || case when sqlerrm like 'That phone number doesn''t look right%' then 'PASS 6  bad phone refused' else 'FAIL 6  ' || sqlerrm end;
  end;

  -- 7. saving the same customer twice (different number formats) updates one record
  v_res  := public.pos_save_customer('0803 123 4567', 'Chika O.', null, 'instagram', true);
  v_res2 := public.pos_save_customer('+234 803 123 4567', 'Chika Okafor', 'Chika@Example.com');
  r := r || case when v_res->>'id' = v_res2->>'id'
                  and (select name from pos.customers where id = (v_res->>'id')::uuid) = 'Chika Okafor'
                  and (select email from pos.customers where id = (v_res->>'id')::uuid) = 'chika@example.com'
                  and (select heard_from from pos.customers where id = (v_res->>'id')::uuid) = 'instagram'
                 then 'PASS 7  one customer, updated not duplicated' else 'FAIL 7  customer duplicated or not updated' end;
  v_cust := (v_res->>'id')::uuid;

  -- 8. lookup by phone, in any format
  v_res := public.pos_find_customer('08031234567');
  r := r || case when v_res->>'name' = 'Chika Okafor' then 'PASS 8  found by phone: ' || (v_res->>'name')
                 else 'FAIL 8  lookup failed' end;

  -- 9. an order needs a customer or "Customer declined"
  begin
    perform public.pos_place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)));
    r := r || 'FAIL 9  order placed with no customer and no "declined"';
  exception when others then
    r := r || case when sqlerrm like 'Add the customer''s phone and name, or tap%' then 'PASS 9  ' || sqlerrm else 'FAIL 9  ' || sqlerrm end;
  end;

  -- 10. "Customer declined" is recorded on the sale
  v_res := public.pos_place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null, true);
  r := r || case when (select customer_declined from pos.sales where id = (v_res->>'sale_id')::uuid)
                 then 'PASS 10 "Customer declined" recorded' else 'FAIL 10 declined not recorded' end;

  -- 11. an order with a customer links them
  v_res := public.pos_place_order(v_item_floor, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 2)), v_cust);
  r := r || case when (select customer_id from pos.sales where id = (v_res->>'sale_id')::uuid) = v_cust
                 then 'PASS 11 customer linked to the order' else 'FAIL 11 customer not linked' end;

  -- 12. reps can't see the cashier's queue; the cashier can
  begin
    perform public.pos_order_queue(v_item_floor);
    r := r || 'FAIL 12a a rep opened the checkout queue';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 12a rep can''t open the queue' else 'FAIL 12a ' || sqlerrm end;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  v_res := public.pos_order_queue(v_item_floor);
  r := r || case when jsonb_array_length(v_res) >= 2
                  and exists (select 1 from jsonb_array_elements(v_res) o where o->'customer'->>'name' = 'Chika Okafor')
                 then format('PASS 12b cashier sees %s waiting orders, with the customer''s name', jsonb_array_length(v_res))
                 else 'FAIL 12b queue wrong: ' || v_res::text end;

  -- 13. the cashier checks out through the app's entry point
  v_res2 := v_res->0;
  perform public.pos_checkout((v_res2->>'sale_id')::uuid,
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', (v_res2->>'subtotal_kobo')::bigint)));
  r := r || case when (select status from pos.sales where id = (v_res2->>'sale_id')::uuid) = 'paid'
                 then 'PASS 13 checkout through the app entry point' else 'FAIL 13 not paid' end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
