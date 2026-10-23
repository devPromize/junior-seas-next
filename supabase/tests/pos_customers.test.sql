-- Automated tests for Customers (supabase/migrations/20261023_pos_customers.sql). Rolled back at the end.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();
  v_mgr  uuid := gen_random_uuid();
  v_rep  uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid();
  v_acc smallint; v_phones smallint;
  v_cust uuid; v_other uuid; v_phone text; v_item bigint;
  v_res jsonb; v_sale uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'cu-owner@example.test', 'authenticated', 'authenticated'), (v_mgr, 'cu-mgr@example.test', 'authenticated', 'authenticated'),
    (v_rep, 'cu-rep@example.test', 'authenticated', 'authenticated'), (v_cash, 'cu-cash@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'CU Owner', id from (select id from pos.roles where is_owner limit 1) o union all
  select v_mgr, 'CU Manager', id from pos.roles where name = 'Manager' union all
  select v_rep, 'CU Rep', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'CU Cashier', id from pos.roles where name = 'Cashier';
  select id into v_acc from pos.floors where code = 'accessories';
  select id into v_phones from pos.floors where code = 'phones';
  insert into pos.staff_departments (user_id, floor_id) select u, f from unnest(array[v_mgr, v_rep, v_cash]) u, unnest(array[v_acc, v_phones]) f;
  select ui.code into v_phone from pos.phone_units u join pos.unit_identifiers ui on ui.unit_id = u.id and ui.slot = 1
  where u.status = 'in_stock' and u.floor_id = v_phones limit 1;

  -- 1. a rep captures a new customer at a sale and sells them a phone
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_cust := (public.pos_save_customer('0803 000 1122', 'Ngozi Test', null, 'instagram', true)->>'id')::uuid;
  v_sale := (public.pos_place_order(jsonb_build_array(jsonb_build_object('code', v_phone)), v_cust)->>'sale_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash',
            'amount_kobo', (select total_kobo from pos.sales where id = v_sale))));

  -- 2. reps and cashiers can't browse the customer list
  begin
    perform public.pos_customers();
    r := r || 'FAIL 2  a cashier opened the customer list';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 2  cashiers can''t browse customers' else 'FAIL 2  ' || sqlerrm end;
  end;

  -- 3. the manager finds them by phone (any format), with the phone they bought
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  v_res := public.pos_customers('08030001122');
  r := r || case when (v_res->>'total')::int = 1 and (v_res->'rows'->0->>'phones')::int = 1 and (v_res->'rows'->0->>'marketing')::boolean
                 then 'PASS 3  found by phone: 1 purchase, 1 phone, agreed to offers' else 'FAIL 3  ' || v_res::text end;

  -- 4. their page shows the device with its IMEI
  v_res := public.pos_customer(v_cust);
  r := r || case when jsonb_array_length(v_res->'devices') = 1 and (v_res->'devices'->0->'codes') ? v_phone and (v_res->>'purchases')::int = 1
                 then 'PASS 4  customer page lists the phone they own: ' || (v_res->'devices'->0->>'name') else 'FAIL 4  ' || left(v_res::text, 300) end;

  -- 5. editing: phone in any format, duplicate numbers refused, consent changes timestamped and logged
  v_other := (select id from pos.customers where phone is not null and id <> v_cust limit 1);
  begin
    perform public.pos_update_customer(v_cust, jsonb_build_object('phone', (select phone from pos.customers where id = v_other)));
    r := r || 'FAIL 5a two customers with one number';
  exception when others then
    r := r || case when sqlerrm like 'Another customer already has the number%' then 'PASS 5a duplicate number refused' else 'FAIL 5a ' || sqlerrm end;
  end;
  perform public.pos_update_customer(v_cust, jsonb_build_object('consent_marketing', false, 'company', 'Test Ventures'));
  r := r || case when not (select consent_marketing from pos.customers where id = v_cust)
                  and (select consent_updated_at from pos.customers where id = v_cust) is not null
                  and exists (select 1 from pos.audit_log where entity_id = v_cust::text and action = 'customer_updated' and detail ? 'consent_marketing')
                 then 'PASS 5b opted out of offers: timestamped and logged' else 'FAIL 5b' end;

  -- 6. notes
  perform public.pos_add_customer_note(v_cust, 'Wants the next iPhone when it arrives');
  r := r || case when jsonb_array_length(public.pos_customer(v_cust)->'notes') = 1 then 'PASS 6  staff note saved' else 'FAIL 6' end;

  -- 7. segments: business, and "due for an upgrade" once their phone is over a year old
  r := r || case when exists (select 1 from jsonb_array_elements(public.pos_customers(null, 'business', 200)->'rows') x where (x->>'id')::uuid = v_cust)
                 then 'PASS 7a appears under Businesses' else 'FAIL 7a' end;
  update pos.sales set paid_at = now() - interval '14 months', placed_at = now() - interval '14 months' where id = v_sale;
  r := r || case when exists (select 1 from jsonb_array_elements(public.pos_customers('ngozi', 'upgrade_due')->'rows') x where (x->>'id')::uuid = v_cust)
                 then 'PASS 7b appears under "Due for an upgrade" 14 months after buying a phone' else 'FAIL 7b' end;

  -- 8. exporting: managers can't by default; the owner can, marketing-consented only by default, and it's logged
  begin
    perform public.pos_export_customers();
    r := r || 'FAIL 8a manager exported customers';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 8a managers can''t export by default' else 'FAIL 8a ' || sqlerrm end;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  perform public.pos_update_customer(v_cust, jsonb_build_object('consent_marketing', true));
  v_res := public.pos_export_customers('all');
  r := r || case when exists (select 1 from jsonb_array_elements(v_res) x where x->>'Phone Number' = '+2348030001122' and x->>'First Name' = 'Ngozi')
                  and not exists (select 1 from jsonb_array_elements(v_res) x where x->>'Marketing Consent' = 'No')
                  and exists (select 1 from pos.audit_log where action = 'customers_exported' and actor_id = v_boss)
                 then format('PASS 8b owner exported %s marketing-consented customers in HubSpot columns; logged', jsonb_array_length(v_res))
                 else 'FAIL 8b' end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
