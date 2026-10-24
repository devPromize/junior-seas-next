-- Automated tests for Reports (supabase/migrations/20261024_pos_reports*.sql). Rolled back at the end.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid; v_mgr uuid := gen_random_uuid(); v_rep uuid := gen_random_uuid(); v_cash uuid := gen_random_uuid();
  v_acc smallint; v_item bigint; v_price bigint; v_cost bigint;
  v_rep_r jsonb; v_res jsonb; v_sale uuid; v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_raw_net bigint; v_raw_sales bigint; v_before jsonb;
begin
  select s.user_id into v_boss from pos.staff s join pos.roles ro on ro.id = s.role_id where ro.is_owner and s.is_active limit 1;
  insert into auth.users (id, email, aud, role) values
    (v_mgr, 'rp-mgr@example.test', 'authenticated', 'authenticated'), (v_rep, 'rp-rep@example.test', 'authenticated', 'authenticated'),
    (v_cash, 'rp-cash@example.test', 'authenticated', 'authenticated');
  insert into pos.staff (user_id, display_name, role_id)
  select v_mgr, 'RP Manager', id from pos.roles where name = 'Manager' union all
  select v_rep, 'RP Rep', id from pos.roles where name = 'Sales rep' union all
  select v_cash, 'RP Cashier', id from pos.roles where name = 'Cashier';
  select id into v_acc from pos.floors where code = 'accessories';
  insert into pos.staff_departments (user_id, floor_id) select u, v_acc from unnest(array[v_mgr, v_rep, v_cash]) u;

  -- 1. the whole history adds up to the raw sale lines (branch transfers left out)
  select sum(l.qty * l.unit_price_kobo - coalesce(l.line_discount_kobo, 0)), count(distinct s.id) into v_raw_net, v_raw_sales
  from pos.sales s join pos.sale_lines l on l.sale_id = s.id and l.removed_at is null
  where s.status = 'paid' and not s.is_branch_transfer;
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  v_rep_r := public.pos_report('2025-01-01', v_today);
  r := r || (case when (v_rep_r->'summary'->>'net_kobo')::bigint = v_raw_net and (v_rep_r->'summary'->>'sales')::bigint = v_raw_sales
                  then format('PASS 1  whole history reconciles: %s sales, every item line counted', v_raw_sales)
                  else format('FAIL 1  report %s/%s vs raw %s/%s', v_rep_r->'summary'->>'net_kobo', v_rep_r->'summary'->>'sales', v_raw_net, v_raw_sales) end);

  -- 2. departments, salespeople and periods each add up to the total
  r := r || (case when (select sum((x->>'net_kobo')::bigint) from jsonb_array_elements(v_rep_r->'by_department') x) = v_raw_net
                   and (select sum((x->>'net_kobo')::bigint) from jsonb_array_elements(v_rep_r->'by_staff') x) = v_raw_net
                   and (select sum((x->>'net_kobo')::bigint) from jsonb_array_elements(v_rep_r->'by_period') x) = v_raw_net
                   and (select sum((x->>'net_kobo')::bigint) from jsonb_array_elements(v_rep_r->'by_category') x) = v_raw_net
                  then 'PASS 2  departments, salespeople, categories and months all add up to the total' else 'FAIL 2' end);

  -- 3. no stock sent to the other branch is counted as a sale
  r := r || (case when not exists (select 1 from pos.report_lines('2025-01-01', now() + interval '1 day', '{1,2,3}') l
                                   join pos.sales s on s.id = l.sale_id where s.is_branch_transfer)
                  then 'PASS 3  branch transfers left out' else 'FAIL 3' end);

  -- 4. old discounts now sit on the items: every old discounted sale's items add up to what was paid
  r := r || (case when not exists (select 1 from pos.sales s where s.source = 'legacy' and s.status = 'paid' and s.discount_kobo > 0
                                      and s.total_kobo = (select sum(qty * unit_price_kobo) from pos.sale_lines where sale_id = s.id and removed_at is null) - s.discount_kobo
                                      and s.total_kobo <> (select sum(qty * unit_price_kobo - coalesce(line_discount_kobo, 0)) from pos.sale_lines where sale_id = s.id and removed_at is null))
                  then 'PASS 4  old sale-level discounts spread across items; every sale still adds up' else 'FAIL 4' end);

  -- 5. the previous-period figures match running the earlier period on its own
  v_res := public.pos_report('2026-09-01', '2026-09-30');
  v_before := public.pos_report('2026-08-02', '2026-08-31');
  r := r || (case when v_res->'previous'->>'net_kobo' = v_before->'summary'->>'net_kobo' and v_res->>'grain' = 'day'
                   and v_rep_r->>'grain' = 'month'
                  then 'PASS 5  "vs previous period" is the 30 days before; long ranges go by month' else 'FAIL 5' end);

  -- 6. a manager sees their department's sales but no costs or profit, and nothing else
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  v_res := public.pos_report('2026-09-01', '2026-09-30');
  r := r || (case when not (v_res->>'costs')::boolean and v_res->'summary'->'profit_kobo' = 'null'::jsonb
                   and (select bool_and(x->'profit_kobo' = 'null'::jsonb) from jsonb_array_elements(v_res->'top_products') x)
                   and jsonb_array_length(v_res->'by_department') = 1 and v_res->'by_payment' = 'null'::jsonb
                  then 'PASS 6a manager: Accessories only, no profit, no shop-wide payment split' else 'FAIL 6a ' || left(v_res::text, 200) end);
  begin
    perform public.pos_report('2026-09-01', '2026-09-30', (select id from pos.floors where code = 'phones'));
    r := r || 'FAIL 6b manager opened another department'::text;
  exception when others then
    r := r || (case when sqlerrm like 'You don''t have access to that department%' then 'PASS 6b another department refused' else 'FAIL 6b ' || sqlerrm end);
  end;

  -- 7. a sales rep can't open reports; a backwards date range is refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_report(v_today, v_today);
    r := r || 'FAIL 7a rep opened reports'::text;
  exception when others then
    r := r || (case when sqlerrm like 'You don''t have permission%' then 'PASS 7a reps can''t see reports' else 'FAIL 7a ' || sqlerrm end);
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_report(v_today, v_today - 1);
    r := r || 'FAIL 7b backwards range accepted'::text;
  exception when others then
    r := r || (case when sqlerrm like 'Choose a start date%' then 'PASS 7b backwards date range refused' else 'FAIL 7b ' || sqlerrm end);
  end;

  -- 8. a new sale today: exact profit from the cost recorded at the sale
  select l.item_id, i.price_kobo, i.cost_kobo into v_item, v_price, v_cost from pos.stock_levels l join pos.items i on i.id = l.item_id
  where l.floor_id = v_acc and not i.tracks_imei and i.is_active and l.quantity > 3 and i.price_kobo > 0 and i.cost_kobo > 0 limit 1;
  v_before := public.pos_report(v_today, v_today, v_acc);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  v_sale := (public.pos_place_order(jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 2)), null, true)->>'sale_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cash, 'role', 'authenticated')::text, true);
  perform public.pos_checkout(v_sale, jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_kobo', 2 * v_price)));
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  v_res := public.pos_report(v_today, v_today, v_acc);
  r := r || (case when (v_res->'summary'->>'net_kobo')::bigint - coalesce((v_before->'summary'->>'net_kobo')::bigint, 0) = 2 * v_price
                   and (v_res->'summary'->>'profit_kobo')::bigint - coalesce((v_before->'summary'->>'profit_kobo')::bigint, 0) = 2 * (v_price - v_cost)
                   and exists (select 1 from jsonb_array_elements(v_res->'by_staff') x where x->>'name' = 'RP Rep')
                  then format('PASS 8  today''s sale shows at once: %s sales, profit %s exact from the recorded cost, credited to the rep',
                              pos.naira(2 * v_price), pos.naira(2 * (v_price - v_cost)))
                  else 'FAIL 8  ' || left((v_res->'summary')::text, 300) end);

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
