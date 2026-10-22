-- Automated tests for the back office (supabase/migrations/20261022_pos_back_office.sql):
-- staff, departments and the dashboard. Runs as pretend staff, then rolls everything back.

do $test$
declare
  r      text[] := '{}';
  v_boss uuid := gen_random_uuid();   -- owner
  v_hr   uuid := gen_random_uuid();   -- manager given "Manage staff", not an owner
  v_rep  uuid := gen_random_uuid();
  v_new  uuid := gen_random_uuid();   -- a login about to be added as staff
  v_acc  smallint; v_phones smallint; v_dep smallint;
  v_rep_role smallint; v_owner_role smallint;
  v_res  jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (v_boss, 'bo-owner@example.test', 'authenticated', 'authenticated'),
    (v_hr,   'bo-hr@example.test', 'authenticated', 'authenticated'),
    (v_rep,  'bo-rep@example.test', 'authenticated', 'authenticated'),
    (v_new,  'bo-new@example.test', 'authenticated', 'authenticated');
  select id into v_rep_role from pos.roles where name = 'Sales rep';
  select id into v_owner_role from pos.roles where is_owner limit 1;
  insert into pos.staff (user_id, display_name, role_id)
  select v_boss, 'BO Owner', v_owner_role union all
  select v_hr, 'BO Manager', id from pos.roles where name = 'Manager' union all
  select v_rep, 'BO Rep', v_rep_role;
  insert into pos.staff_permission_overrides (user_id, permission_code, granted) values (v_hr, 'staff.manage', true);
  select id into v_acc from pos.floors where code = 'accessories';
  select id into v_phones from pos.floors where code = 'phones';
  insert into pos.staff_departments (user_id, floor_id) values (v_hr, v_acc), (v_rep, v_acc);

  -- 1. a rep can't see the staff list
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_staff_list();
    r := r || 'FAIL 1  a rep opened the staff list';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 1  rep can''t see staff' else 'FAIL 1  ' || sqlerrm end;
  end;

  -- 2. the owner adds someone with two departments
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  perform public.pos_save_staff(v_new, 'Ada Rep', v_rep_role, array[v_acc, v_phones]::smallint[], '0803 555 0101');
  r := r || case when (select phone from pos.staff where user_id = v_new) = '+2348035550101'
                  and pos.user_departments(v_new) = array[least(v_acc, v_phones), greatest(v_acc, v_phones)]::smallint[]
                  and exists (select 1 from pos.audit_log where entity_id = v_new::text and action = 'staff_added')
                 then 'PASS 2  staff added with two departments, phone tidied, logged' else 'FAIL 2  staff not saved correctly' end;

  -- 3. editing takes a department away
  perform public.pos_save_staff(v_new, 'Ada Rep', v_rep_role, array[v_acc]::smallint[]);
  r := r || case when pos.user_departments(v_new) = array[v_acc]::smallint[]
                 then 'PASS 3  department removed on edit' else 'FAIL 3  departments not updated' end;

  -- 4. a non-owner needs at least one department
  begin
    perform public.pos_save_staff(v_new, 'Ada Rep', v_rep_role, '{}'::smallint[]);
    r := r || 'FAIL 4  saved with no departments';
  exception when others then
    r := r || case when sqlerrm like 'Choose at least one department%' then 'PASS 4  ' || sqlerrm else 'FAIL 4  ' || sqlerrm end;
  end;

  -- 5. a manager with "Manage staff" can't make someone an owner
  perform set_config('request.jwt.claims', json_build_object('sub', v_hr, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_save_staff(v_new, 'Ada Rep', v_owner_role, '{}'::smallint[]);
    r := r || 'FAIL 5  a non-owner made someone an owner';
  exception when others then
    r := r || case when sqlerrm = 'Only the owner can add or change an owner.' then 'PASS 5  ' || sqlerrm else 'FAIL 5  ' || sqlerrm end;
  end;

  -- 6. ...or edit the owner
  begin
    perform public.pos_save_staff(v_boss, 'BO Owner', v_rep_role, array[v_acc]::smallint[]);
    r := r || 'FAIL 6  a non-owner demoted the owner';
  exception when others then
    r := r || case when sqlerrm = 'Only the owner can add or change an owner.' then 'PASS 6  non-owner can''t change the owner' else 'FAIL 6  ' || sqlerrm end;
  end;

  -- 7. the owner can't lock themselves out
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_save_staff(v_boss, 'BO Owner', v_owner_role, '{}'::smallint[], null, null, false);
    r := r || 'FAIL 7  the owner deactivated themselves';
  exception when others then
    r := r || case when sqlerrm like 'You can''t deactivate yourself%' then 'PASS 7  ' || sqlerrm else 'FAIL 7  ' || sqlerrm end;
  end;

  -- 8. deactivated staff can't use the POS
  perform public.pos_save_staff(v_new, 'Ada Rep', v_rep_role, array[v_acc]::smallint[], null, null, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_new, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_me();
    r := r || 'FAIL 8  a deactivated person reached the POS';
  exception when others then
    r := r || case when sqlerrm like 'This account isn''t set up as staff%' then 'PASS 8  deactivated staff refused' else 'FAIL 8  ' || sqlerrm end;
  end;

  -- 9. the staff list shows everyone, with the owner covering every department
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  v_res := public.pos_staff_list();
  r := r || case when exists (select 1 from jsonb_array_elements(v_res) s where s->>'name' = 'Ada Rep' and not (s->>'is_active')::boolean)
                  and (select jsonb_array_length(s->'department_ids') from jsonb_array_elements(v_res) s where s->>'name' = 'BO Owner')
                      = (select count(*) from pos.floors where is_active)
                 then format('PASS 9  staff list: %s people, owner has every department', jsonb_array_length(v_res))
                 else 'FAIL 9  staff list wrong' end;

  -- 10. adding a department makes it available straight away
  v_res := public.pos_save_department(null, 'Electrical & Electronic Appliances');
  v_dep := (v_res->>'id')::smallint;
  r := r || case when (select code from pos.floors where id = v_dep) = 'electrical_electronic_appliances'
                  and v_dep = any(pos.user_departments(v_boss))
                  and exists (select 1 from jsonb_array_elements(public.pos_staff_form_options()->'departments') d where (d->>'id')::int = v_dep)
                 then 'PASS 10 new department added and offered on the staff form' else 'FAIL 10 department not added' end;

  -- 11. no two departments with the same name
  begin
    perform public.pos_save_department(null, 'mobile phones');
    r := r || 'FAIL 11 duplicate department added';
  exception when others then
    r := r || case when sqlerrm like 'There''s already a department called%' then 'PASS 11 ' || sqlerrm else 'FAIL 11 ' || sqlerrm end;
  end;

  -- 12. a department holding stock can't be hidden; an empty one can
  begin
    perform public.pos_save_department(v_phones, 'Mobile Phones', false);
    r := r || 'FAIL 12a hid a department with stock';
  exception when others then
    r := r || case when sqlerrm like 'This department still holds stock%' then 'PASS 12a ' || sqlerrm else 'FAIL 12a ' || sqlerrm end;
  end;
  perform public.pos_save_department(v_dep, 'Electrical & Electronic Appliances', false);
  r := r || case when not (v_dep = any(pos.user_departments(v_boss)))
                 then 'PASS 12b empty department hidden' else 'FAIL 12b department not hidden' end;

  -- 13. a manager without "Change business settings" can't add departments
  perform set_config('request.jwt.claims', json_build_object('sub', v_hr, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_save_department(null, 'Gaming');
    r := r || 'FAIL 13 manager added a department';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission%' then 'PASS 13 manager can''t add departments' else 'FAIL 13 ' || sqlerrm end;
  end;

  -- 14. dashboard: the owner sees every department; a rep can't open it
  perform set_config('request.jwt.claims', json_build_object('sub', v_boss, 'role', 'authenticated')::text, true);
  v_res := public.pos_dashboard();
  r := r || case when jsonb_array_length(v_res->'last_7_days') = 7
                  and jsonb_array_length(v_res->'by_department') = (select count(*) from pos.floors where is_active)
                 then format('PASS 14a owner dashboard: today %s, %s orders waiting',
                             pos.naira((v_res->'today'->>'total_kobo')::bigint), v_res->>'waiting_orders')
                 else 'FAIL 14a ' || v_res::text end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_rep, 'role', 'authenticated')::text, true);
  begin
    perform public.pos_dashboard();
    r := r || 'FAIL 14b a rep opened the dashboard';
  exception when others then
    r := r || case when sqlerrm like 'You don''t have permission to see the dashboard%' then 'PASS 14b rep goes to Sell instead' else 'FAIL 14b ' || sqlerrm end;
  end;

  raise exception E'TEST REPORT (all changes rolled back)\n%\n\n% passed, % failed',
    array_to_string(r, E'\n'),
    (select count(*) from unnest(r) x where x like 'PASS%'),
    (select count(*) from unnest(r) x where x like 'FAIL%');
end $test$;
