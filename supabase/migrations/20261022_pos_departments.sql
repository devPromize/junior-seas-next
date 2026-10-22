-- POS step 6: departments, not floors, and per-person department access.
--
-- The shop's sections are departments: Mobile Phones, Accessories, Spare Parts & Repairs. Which
-- floor a department sits on can change, so the POS never names floors. The table keeps its
-- original name (pos.floors, and floor_id columns) because every till action already uses it;
-- only what people see changes.
--
-- Access: the owner sees every department. Everyone else sees only the departments the owner
-- gave them when adding them. The device no longer picks a floor: a rep searches everything
-- they have access to, and each item is taken from the department that holds it.

update pos.floors set code = 'accessories', name = 'Accessories'           where id = 1;
update pos.floors set code = 'phones',      name = 'Mobile Phones'         where id = 2;
update pos.floors set code = 'spare_parts', name = 'Spare Parts & Repairs' where id = 3;
comment on table pos.floors is
  'Departments (Mobile Phones, Accessories, Spare Parts & Repairs). Named "floors" for history only.';

-- Which departments each staff member can sell from and see stock for. Set by the owner.
create table pos.staff_departments (
  user_id    uuid not null references pos.staff(user_id) on delete cascade,
  floor_id   smallint not null references pos.floors(id),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, floor_id)
);
alter table pos.staff_departments enable row level security;

create function pos.user_departments(p_user uuid) returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(f.id order by f.id), '{}')
  from pos.floors f
  where f.is_active
    and (exists (select 1 from pos.staff s join pos.roles r on r.id = s.role_id
                 where s.user_id = p_user and s.is_active and r.is_owner)
         or exists (select 1 from pos.staff_departments d where d.user_id = p_user and d.floor_id = f.id));
$$;

-- ---------- what the app sees ----------

create or replace function public.pos_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
begin
  return (
    select jsonb_build_object(
      'user_id', s.user_id,
      'name', s.display_name,
      'role', r.name,
      'is_owner', r.is_owner,
      'has_pin', s.pin_hash is not null,
      'permissions', coalesce((select jsonb_agg(p.code order by p.code) from pos.permissions p
                               where pos.user_has_permission(v_user, p.code)), '[]'::jsonb),
      'departments', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'code', f.code, 'name', f.name) order by f.id)
                               from pos.floors f where f.id = any(pos.user_departments(v_user))), '[]'::jsonb),
      'payment_accounts', (select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name,
                             'transfer', a.accepts_transfer, 'card', a.accepts_card, 'online', a.accepts_online) order by a.sort)
                           from pos.payment_accounts a where a.is_active),
      'authorisers', (select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', x.display_name) order by x.display_name)
                      from pos.staff x where x.is_active and pos.user_has_permission(x.user_id, 'sales.discount')),
      'settings', (select jsonb_object_agg(key, value) from pos.settings)
    )
    from pos.staff s join pos.roles r on r.id = s.role_id
    where s.user_id = v_user
  );
end $$;

-- Only the departments this person has access to. An item belongs to a department when that
-- department holds (or has held) stock of it; items no department has ever held show to everyone.
create or replace function public.pos_catalogue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps smallint[] := pos.user_departments(pos.require_staff());
begin
  return jsonb_build_object(
    'loaded_at', now(),
    'items', (select coalesce(jsonb_agg(jsonb_build_array(
                i.id, i.sku, i.name, i.price_kobo, i.wholesale_price_kobo, i.tracks_imei,
                coalesce(c.name, ''), coalesce(b.name, ''))), '[]'::jsonb)
              from pos.items i
              left join pos.categories c on c.id = i.category_id
              left join pos.brands b on b.id = i.brand_id
              where i.is_active
                and (exists (select 1 from pos.stock_levels l where l.item_id = i.id and l.floor_id = any(v_deps))
                     or exists (select 1 from pos.phone_units u where u.item_id = i.id and u.floor_id = any(v_deps))
                     or (not exists (select 1 from pos.stock_levels l where l.item_id = i.id)
                         and not exists (select 1 from pos.phone_units u where u.item_id = i.id)))),
    'stock', (select coalesce(jsonb_agg(jsonb_build_array(l.item_id, l.floor_id, l.quantity)), '[]'::jsonb)
              from pos.stock_levels l join pos.items i on i.id = l.item_id
              where i.is_active and l.quantity <> 0 and l.floor_id = any(v_deps)),
    'units', (select coalesce(jsonb_agg(jsonb_build_array(u.id, u.item_id, u.floor_id, u.status,
                (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = u.id))), '[]'::jsonb)
              from pos.phone_units u
              where u.status in ('in_stock', 'held') and u.floor_id = any(v_deps))
  );
end $$;

-- ---------- place order: no device floor ----------
-- p_floor_id is now optional and kept only so older callers still work. Each line comes from
-- its own department (a phone from where it is; other items from the line's floor_id, or the
-- department the rep has access to with the most stock). The rep must have access to every
-- department in the order. The order is filed under the first line's department.
create or replace function pos.place_order(
  p_floor_id                smallint,
  p_lines                   jsonb,
  p_customer_id             uuid default null,
  p_rep_note                text default null,
  p_discount_request_kobo   bigint default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('sales.create');
  v_deps     smallint[] := pos.user_departments(auth.uid());
  v_sale     pos.sales;
  v_line     jsonb;
  v_item     pos.items;
  v_unit     pos.phone_units;
  v_tier     text;
  v_qty      int;
  v_floor    smallint;
  v_price    bigint;
  v_hold     int;
  v_subtotal bigint := 0;
  v_holder   text;
  v_first    boolean := true;
begin
  if p_floor_id is not null and not exists (select 1 from pos.floors where id = p_floor_id and is_active) then
    raise exception 'Unknown department.' using hint = 'bad_floor';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An order needs at least one item.' using hint = 'empty_order';
  end if;
  if cardinality(v_deps) = 0 then
    raise exception 'You haven''t been given access to any department yet. Ask the owner.' using hint = 'no_departments';
  end if;

  select (value #>> '{}')::int into v_hold from pos.settings where key = 'order_hold_minutes';

  -- Filed under a placeholder department for now; set to the first line's department below.
  insert into pos.sales (floor_id, customer_id, sold_by, rep_note, hold_expires_at)
  values (coalesce(p_floor_id, v_deps[1]), p_customer_id, v_user, nullif(trim(p_rep_note), ''),
          now() + make_interval(mins => coalesce(v_hold, 30)))
  returning * into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_tier := coalesce(v_line->>'price_tier', 'retail');
    v_qty  := coalesce((v_line->>'qty')::int, 1);
    v_unit := null;

    -- A scanned IMEI or serial number points at one exact phone.
    if v_line ? 'code' then
      select u.* into v_unit
      from pos.unit_identifiers ui join pos.phone_units u on u.id = ui.unit_id
      where ui.code = trim(v_line->>'code')
      for update of u;
      if not found then
        raise exception 'No phone with IMEI or serial % is in the system.', trim(v_line->>'code')
          using hint = 'unknown_imei';
      end if;
    end if;

    select * into v_item from pos.items where id = coalesce(v_unit.item_id, (v_line->>'item_id')::bigint);
    if not found or not v_item.is_active then
      raise exception 'That product isn''t available for sale.' using hint = 'bad_item';
    end if;

    if v_item.tracks_imei then
      if v_unit.id is null then
        raise exception 'Scan the IMEI of the % you''re selling.', v_item.name using hint = 'imei_required';
      end if;
      if v_unit.status = 'held' then
        select receipt_no into v_holder from pos.sales where id = v_unit.held_by_sale;
        raise exception 'This phone is already in order %.', coalesce(v_holder, '(another order)')
          using hint = 'phone_held';
      elsif v_unit.status <> 'in_stock' then
        raise exception 'This phone shows as % in the system.', replace(v_unit.status, '_', ' ')
          using hint = 'phone_unavailable';
      end if;
      v_qty   := 1;
      v_floor := v_unit.floor_id;
    else
      if v_qty < 1 then
        raise exception 'Quantity must be at least 1.' using hint = 'bad_qty';
      end if;
      v_floor := coalesce((v_line->>'floor_id')::smallint, p_floor_id,
                          (select l.floor_id from pos.stock_levels l
                           where l.item_id = v_item.id and l.floor_id = any(v_deps)
                           order by l.quantity desc, l.floor_id limit 1),
                          v_deps[1]);
    end if;

    if not v_floor = any(v_deps) then
      raise exception 'You don''t have access to %, where the % is.',
        (select name from pos.floors where id = v_floor), v_item.name using hint = 'no_department_access';
    end if;
    if v_unit.id is not null then
      update pos.phone_units set status = 'held', held_by_sale = v_sale.id where id = v_unit.id;
    end if;
    if v_first and p_floor_id is null then
      update pos.sales set floor_id = v_floor where id = v_sale.id;
      v_first := false;
    end if;

    if v_tier = 'wholesale' then
      if not pos.has_permission('sales.wholesale') then
        raise exception 'You don''t have permission to sell at the wholesale price.' using hint = 'not_allowed';
      end if;
      if v_item.wholesale_price_kobo is null then
        raise exception '% has no wholesale price set.', v_item.name using hint = 'no_wholesale_price';
      end if;
      if v_item.wholesale_min_qty is not null and v_qty < v_item.wholesale_min_qty then
        raise exception 'The wholesale price for % starts at % pieces.', v_item.name, v_item.wholesale_min_qty
          using hint = 'wholesale_min_qty';
      end if;
      v_price := v_item.wholesale_price_kobo;
    elsif v_tier = 'retail' then
      v_price := v_item.price_kobo;
    else
      raise exception 'Unknown price type "%".', v_tier using hint = 'bad_price_tier';
    end if;

    insert into pos.sale_lines (sale_id, item_id, item_name, unit_id, floor_id, qty,
                                unit_price_kobo, price_tier, unit_cost_kobo)
    values (v_sale.id, v_item.id, v_item.name, v_unit.id, v_floor, v_qty,
            v_price, v_tier, coalesce(v_unit.cost_kobo, v_item.cost_kobo));
    v_subtotal := v_subtotal + v_qty * v_price;
  end loop;

  if p_discount_request_kobo is not null and (p_discount_request_kobo < 0 or p_discount_request_kobo > v_subtotal) then
    raise exception 'The discount must be between ₦0 and the order total.' using hint = 'bad_discount';
  end if;

  update pos.sales set subtotal_kobo = v_subtotal, total_kobo = v_subtotal,
                       discount_requested_kobo = nullif(p_discount_request_kobo, 0)
  where id = v_sale.id;

  return jsonb_build_object('sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no,
                            'total_kobo', v_subtotal, 'hold_expires_at', v_sale.hold_expires_at);
end $$;

-- The app no longer sends a floor.
drop function public.pos_place_order(smallint, jsonb, uuid, boolean, text, bigint);
create function public.pos_place_order(
  p_lines                 jsonb,
  p_customer_id           uuid default null,
  p_customer_declined     boolean default false,
  p_rep_note              text default null,
  p_discount_request_kobo bigint default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb;
begin
  perform pos.require_staff();
  if p_customer_id is null and not coalesce(p_customer_declined, false) then
    raise exception 'Add the customer''s phone and name, or tap "Customer declined".' using hint = 'customer_required';
  end if;
  v_res := pos.place_order(null, p_lines, p_customer_id, p_rep_note, p_discount_request_kobo);
  if p_customer_id is null then
    update pos.sales set customer_declined = true where id = (v_res->>'sale_id')::uuid;
  end if;
  return v_res;
end $$;

-- The cashier's queue: every waiting order with at least one item from a department the
-- cashier has access to. One order, one receipt, whichever departments its items come from.
drop function public.pos_order_queue(smallint);
create function public.pos_order_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps smallint[] := pos.user_departments(pos.require_permission('sales.checkout'));
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'sale_id', s.id, 'receipt_no', s.receipt_no, 'placed_at', s.placed_at,
      'hold_expires_at', s.hold_expires_at,
      'rep', (select display_name from pos.staff where user_id = s.sold_by),
      'rep_note', s.rep_note, 'discount_requested_kobo', s.discount_requested_kobo,
      'discount_approved_kobo', s.discount_approved_kobo,
      'customer', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone) end,
      'customer_declined', s.customer_declined,
      'subtotal_kobo', s.subtotal_kobo,
      'lines', (select jsonb_agg(jsonb_build_object(
                  'id', l.id, 'item_name', l.item_name, 'qty', l.qty, 'unit_price_kobo', l.unit_price_kobo,
                  'price_tier', l.price_tier, 'department_id', l.floor_id,
                  'imei', (select ui.code from pos.unit_identifiers ui where ui.unit_id = l.unit_id and ui.slot = 1))
                  order by l.id)
                from pos.sale_lines l where l.sale_id = s.id and l.removed_at is null)
    ) order by s.placed_at)
    from pos.sales s left join pos.customers c on c.id = s.customer_id
    where s.status = 'placed'
      and exists (select 1 from pos.sale_lines l
                  where l.sale_id = s.id and l.removed_at is null and l.floor_id = any(v_deps))
  ), '[]'::jsonb);
end $$;

revoke execute on function pos.user_departments(uuid) from public, anon;
revoke execute on function
  public.pos_place_order(jsonb, uuid, boolean, text, bigint), public.pos_order_queue()
from public, anon;
grant execute on function
  public.pos_place_order(jsonb, uuid, boolean, text, bigint), public.pos_order_queue()
to authenticated;
