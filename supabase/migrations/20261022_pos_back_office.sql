-- POS step 7: the back office foundations. Staff, departments the owner can add, and the
-- dashboard's numbers. Each entry point checks permission before doing anything.
--
-- Creating a login needs the server key, which the POS app never holds. That one step runs in
-- the pos-add-staff edge function; everything else about a staff member is saved here.

-- Permission labels said "floor"; they now say "department" (D-033).
update pos.permissions set label = 'See reports for their departments' where code = 'reports.view';
update pos.permissions set label = 'See sales in every department',
  warning = 'They will see sales and takings for every department, not just their own.' where code = 'sales.view_all';
update pos.permissions set label = 'See all sales in their departments' where code = 'sales.view_floor';
update pos.roles set description = 'Everything, every department' where is_owner;
update pos.roles set description = 'Handles money for their departments' where name = 'Cashier';
update pos.roles set description = 'Runs their departments: approvals, stock, returns' where name = 'Manager';

-- ---------- staff ----------

create function public.pos_staff_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('staff.manage');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id, 'name', s.display_name, 'phone', s.phone, 'email', u.email,
      'role_id', s.role_id, 'role', r.name, 'is_owner', r.is_owner, 'is_active', s.is_active,
      'discount_limit_kobo', s.discount_limit_kobo,
      'department_ids', to_jsonb(pos.user_departments(s.user_id)),
      'last_sign_in_at', u.last_sign_in_at, 'created_at', s.created_at)
      order by s.is_active desc, r.is_owner desc, s.display_name)
    from pos.staff s join pos.roles r on r.id = s.role_id join auth.users u on u.id = s.user_id
  ), '[]'::jsonb);
end $$;

-- What the add/edit staff form needs: roles (with what each can do) and departments.
create function public.pos_staff_form_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('staff.manage');
  return jsonb_build_object(
    'roles', (select jsonb_agg(jsonb_build_object(
                'id', r.id, 'name', r.name, 'description', r.description, 'is_owner', r.is_owner,
                'permissions', coalesce((select jsonb_agg(p.label order by p.label)
                                         from pos.role_permissions rp join pos.permissions p on p.code = rp.permission_code
                                         where rp.role_id = r.id), '[]'::jsonb),
                'warnings', coalesce((select jsonb_agg(p.warning order by p.label)
                                      from pos.role_permissions rp join pos.permissions p on p.code = rp.permission_code
                                      where rp.role_id = r.id and p.is_sensitive), '[]'::jsonb))
                order by r.is_owner, r.id)
              from pos.roles r),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.id)
                             from pos.floors f where f.is_active), '[]'::jsonb)
  );
end $$;

-- Used by the pos-add-staff edge function before it creates a login: is this email already
-- someone (e.g. a website customer, or existing staff)?
create function public.pos_find_login(p_email text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('staff.manage');
  return (select jsonb_build_object('user_id', u.id,
                                    'is_staff', exists (select 1 from pos.staff s where s.user_id = u.id))
          from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1);
end $$;

-- Add or update a staff member. The login (auth user) must already exist.
create function public.pos_save_staff(
  p_user_id             uuid,
  p_name                text,
  p_role_id             smallint,
  p_department_ids      smallint[],
  p_phone               text default null,
  p_discount_limit_kobo bigint default null,
  p_is_active           boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me        uuid := pos.require_permission('staff.manage');
  v_me_owner  boolean := exists (select 1 from pos.staff s join pos.roles r on r.id = s.role_id
                                 where s.user_id = v_me and r.is_owner);
  v_new_owner boolean;
  v_was_owner boolean := exists (select 1 from pos.staff s join pos.roles r on r.id = s.role_id
                                 where s.user_id = p_user_id and r.is_owner);
  v_existed   boolean := exists (select 1 from pos.staff where user_id = p_user_id);
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'Add their name.' using hint = 'name_required';
  end if;
  select is_owner into v_new_owner from pos.roles where id = p_role_id;
  if v_new_owner is null then
    raise exception 'Choose a role.' using hint = 'role_required';
  end if;
  if (v_new_owner or v_was_owner) and not v_me_owner then
    raise exception 'Only the owner can add or change an owner.' using hint = 'not_allowed';
  end if;
  if p_user_id = v_me and (not coalesce(p_is_active, true) or (v_was_owner and not v_new_owner)) then
    raise exception 'You can''t deactivate yourself or remove your own owner role.' using hint = 'not_allowed';
  end if;
  if not v_new_owner and coalesce(cardinality(p_department_ids), 0) = 0 then
    raise exception 'Choose at least one department they can work in.' using hint = 'departments_required';
  end if;
  if exists (select 1 from unnest(p_department_ids) d(id)
             where not exists (select 1 from pos.floors f where f.id = d.id and f.is_active)) then
    raise exception 'One of those departments doesn''t exist.' using hint = 'bad_department';
  end if;
  if p_discount_limit_kobo is not null and p_discount_limit_kobo < 0 then
    raise exception 'The discount limit can''t be negative.' using hint = 'bad_discount_limit';
  end if;

  insert into pos.staff (user_id, display_name, phone, role_id, discount_limit_kobo, is_active)
  values (p_user_id, trim(p_name), pos.normalize_phone(p_phone), p_role_id, p_discount_limit_kobo, coalesce(p_is_active, true))
  on conflict (user_id) do update set
    display_name        = excluded.display_name,
    phone               = excluded.phone,
    role_id             = excluded.role_id,
    discount_limit_kobo = excluded.discount_limit_kobo,
    is_active           = excluded.is_active;

  -- The owner has every department automatically; nothing to store.
  delete from pos.staff_departments where user_id = p_user_id
    and (v_new_owner or not floor_id = any(p_department_ids));
  if not v_new_owner then
    insert into pos.staff_departments (user_id, floor_id, granted_by)
    select p_user_id, d.id, v_me from unnest(p_department_ids) d(id)
    on conflict do nothing;
  end if;

  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_me, case when v_existed then 'staff_updated' else 'staff_added' end, 'staff', p_user_id::text,
          jsonb_build_object('name', trim(p_name), 'role_id', p_role_id, 'departments', to_jsonb(p_department_ids),
                             'discount_limit_kobo', p_discount_limit_kobo, 'is_active', coalesce(p_is_active, true)));
  return jsonb_build_object('user_id', p_user_id);
end $$;

-- ---------- departments ----------

create function public.pos_departments() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('settings.manage');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'is_active', f.is_active,
      'items_in_stock', (select count(*) from pos.stock_levels l where l.floor_id = f.id and l.quantity > 0)
                      + (select count(distinct u.item_id) from pos.phone_units u where u.floor_id = f.id and u.status in ('in_stock', 'held')),
      'staff', (select count(*) from pos.staff_departments d join pos.staff s on s.user_id = d.user_id
                where d.floor_id = f.id and s.is_active))
      order by f.is_active desc, f.id)
    from pos.floors f
  ), '[]'::jsonb);
end $$;

-- Add a department (p_id null) or rename / hide one. A department that still holds stock
-- can't be hidden: move the stock out first.
create function public.pos_save_department(p_id smallint, p_name text, p_is_active boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me   uuid := pos.require_permission('settings.manage');
  v_name text := nullif(trim(p_name), '');
  v_id   smallint;
  v_code text;
begin
  if v_name is null then
    raise exception 'Give the department a name.' using hint = 'name_required';
  end if;
  if exists (select 1 from pos.floors where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'There''s already a department called %.', v_name using hint = 'duplicate_name';
  end if;

  if p_id is null then
    v_code := trim(both '_' from regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'));
    while exists (select 1 from pos.floors where code = v_code) loop
      v_code := v_code || '_2';
    end loop;
    insert into pos.floors (location_id, code, name)
    values ((select location_id from pos.floors order by id limit 1), v_code, v_name)
    returning id into v_id;
  else
    if not coalesce(p_is_active, true)
       and (exists (select 1 from pos.stock_levels where floor_id = p_id and quantity > 0)
            or exists (select 1 from pos.phone_units where floor_id = p_id and status in ('in_stock', 'held'))) then
      raise exception 'This department still holds stock. Move it to another department before hiding it.'
        using hint = 'department_has_stock';
    end if;
    update pos.floors set name = v_name, is_active = coalesce(p_is_active, true) where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Unknown department.' using hint = 'bad_department';
    end if;
  end if;

  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_me, case when p_id is null then 'department_added' else 'department_updated' end, 'department', v_id::text,
          jsonb_build_object('name', v_name, 'is_active', coalesce(p_is_active, true)));
  return jsonb_build_object('id', v_id);
end $$;

-- ---------- dashboard ----------
-- Sales for the departments this person may see (everything for the owner and anyone with
-- "See sales in every department"). Amounts are after discounts. Days are Nigerian days.
create function public.pos_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_staff();
  v_deps  smallint[];
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if not (pos.has_permission('reports.view') or pos.has_permission('sales.view_all')
          or pos.has_permission('sales.view_floor')) then
    raise exception 'You don''t have permission to see the dashboard.' using hint = 'not_allowed';
  end if;
  v_deps := case when pos.has_permission('sales.view_all')
                 then (select array_agg(id) from pos.floors)
                 else pos.user_departments(v_user) end;

  return (
    with lines as (
      select (s.paid_at at time zone 'Africa/Lagos')::date as day, s.id as sale_id, l.floor_id,
             l.qty * l.unit_price_kobo - coalesce(l.line_discount_kobo, 0) as amount
      from pos.sales s join pos.sale_lines l on l.sale_id = s.id and l.removed_at is null
      where s.status = 'paid' and s.paid_at >= (v_today - 6)::timestamp at time zone 'Africa/Lagos'
        and l.floor_id = any(v_deps)
    )
    select jsonb_build_object(
      'today', jsonb_build_object(
        'total_kobo', coalesce((select sum(amount) from lines where day = v_today), 0),
        'sales', (select count(distinct sale_id) from lines where day = v_today),
        'discount_kobo', coalesce((select sum(s.discount_kobo) from pos.sales s
                                   where s.status = 'paid' and (s.paid_at at time zone 'Africa/Lagos')::date = v_today
                                     and exists (select 1 from pos.sale_lines l where l.sale_id = s.id and l.floor_id = any(v_deps))), 0)),
      'by_department', (select jsonb_agg(jsonb_build_object(
                          'id', f.id, 'name', f.name,
                          'total_kobo', coalesce((select sum(amount) from lines where day = v_today and floor_id = f.id), 0))
                          order by f.id)
                        from pos.floors f where f.id = any(v_deps) and f.is_active),
      'last_7_days', (select jsonb_agg(jsonb_build_object(
                        'day', d::date,
                        'total_kobo', coalesce((select sum(amount) from lines where day = d::date), 0)) order by d)
                      from generate_series(v_today - 6, v_today, interval '1 day') d),
      'waiting_orders', (select count(*) from pos.sales s where s.status = 'placed'
                           and exists (select 1 from pos.sale_lines l where l.sale_id = s.id and l.removed_at is null
                                         and l.floor_id = any(v_deps))),
      'unread_alerts', (select count(*) from pos.notifications where recipient_id = v_user and read_at is null)
    )
  );
end $$;

revoke execute on function
  public.pos_staff_list(), public.pos_staff_form_options(), public.pos_find_login(text),
  public.pos_save_staff(uuid, text, smallint, smallint[], text, bigint, boolean),
  public.pos_departments(), public.pos_save_department(smallint, text, boolean), public.pos_dashboard()
from public, anon;
grant execute on function
  public.pos_staff_list(), public.pos_staff_form_options(), public.pos_find_login(text),
  public.pos_save_staff(uuid, text, smallint, smallint[], text, bigint, boolean),
  public.pos_departments(), public.pos_save_department(smallint, text, boolean), public.pos_dashboard()
to authenticated;
