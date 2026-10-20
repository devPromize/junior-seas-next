-- POS step 4: the till actions.
-- Each action is one database function. It checks who's asking, checks stock, and writes
-- everything in one transaction: a sale either fully happens or doesn't happen at all.
-- Error messages are written for the person at the till, in plain English.

-- Business-wide settings the owner can change later (Settings screen).
create table pos.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into pos.settings (key, value) values
  ('order_hold_minutes', '30'),
  ('discount_quick_max_kobo', '5000000');   -- ₦50,000: discounts up to this need no PIN
alter table pos.settings enable row level security;
grant select, insert, update, delete on pos.settings to service_role;

-- Which order is holding a phone (set when a rep places an order).
alter table pos.phone_units add column held_by_sale uuid references pos.sales(id) on delete set null;
alter table pos.phone_units add constraint phone_units_hold_check
  check ((status = 'held') = (held_by_sale is not null));

-- Discounts work like the shop does today, with no waiting at the till: the boss or a manager
-- agrees a discount on the floor, the cashier applies it straight away and records who
-- authorised it, and the person named is alerted at once. Only an unusually large discount
-- (above the "quick discount" limit in Settings) needs a manager's PIN or a tap on their phone.
update pos.permissions
set label   = 'Authorise discounts',
    warning = 'Cashiers can name them as the person who authorised a discount. Large discounts they approve are limited by their discount limit.'
where code = 'sales.discount';

insert into pos.permissions (code, label, is_sensitive, warning) values
  ('sales.apply_discount', 'Apply discounts at checkout', true,
   'They can take money off a sale at checkout. Each discount records who authorised it, and that person is alerted.');

insert into pos.role_permissions (role_id, permission_code)
select id, 'sales.apply_discount' from pos.roles where name in ('Cashier', 'Manager');

update pos.roles set discount_limit_kobo = 10000000 where name = 'Manager';   -- ₦100,000 for large-discount approvals

-- Alerts shown in the POS (and later sent by WhatsApp).
create table pos.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  entity       text,
  entity_id    text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index notifications_recipient_idx on pos.notifications (recipient_id, read_at, created_at desc);
alter table pos.notifications enable row level security;
grant select, insert, update, delete on pos.notifications to service_role;

alter table pos.sales
  add column discount_requested_kobo bigint check (discount_requested_kobo >= 0),
  add column discount_approved_kobo  bigint check (discount_approved_kobo >= 0),
  add column discount_approved_by    uuid references auth.users(id),
  add column discount_approved_at    timestamptz;

-- PIN protection: after 5 wrong PINs, that person's PIN is locked for 15 minutes.
alter table pos.staff
  add column pin_failed_count int not null default 0,
  add column pin_locked_until timestamptz;

-- Permission checks for any staff member (not just whoever is signed in), so a manager's
-- PIN approval can be checked against the manager's own permissions and limit.
create function pos.user_has_permission(p_user uuid, p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when not s.is_active then false
      when r.is_owner then true
      else coalesce(
        (select o.granted from pos.staff_permission_overrides o
          where o.user_id = s.user_id and o.permission_code = p_code
            and (o.expires_at is null or o.expires_at > now())),
        exists (select 1 from pos.role_permissions rp
                 where rp.role_id = s.role_id and rp.permission_code = p_code))
    end
    from pos.staff s join pos.roles r on r.id = s.role_id
    where s.user_id = p_user), false);
$$;

create or replace function pos.has_permission(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select pos.user_has_permission(auth.uid(), p_code);
$$;

-- ---------- helpers ----------

-- "₦20,000" for messages.
create function pos.naira(p_kobo bigint) returns text
language sql immutable set search_path = '' as $$
  select '₦' || case when p_kobo % 100 = 0
                     then to_char(p_kobo / 100, 'FM999,999,999,990')
                     else to_char(p_kobo / 100.0, 'FM999,999,999,990.00') end;
$$;

-- Stops with a clear message unless the signed-in person has the permission.
create function pos.require_permission(p_code text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using hint = 'not_signed_in';
  end if;
  if not pos.has_permission(p_code) then
    raise exception 'You don''t have permission to do this: %.',
      lower((select label from pos.permissions where code = p_code)) using hint = 'not_allowed';
  end if;
  return auth.uid();
end $$;

-- A staff member's discount limit in kobo. Null means no limit (owner).
create function pos.discount_limit(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case when r.is_owner then null else coalesce(s.discount_limit_kobo, r.discount_limit_kobo) end
  from pos.staff s join pos.roles r on r.id = s.role_id
  where s.user_id = p_user;
$$;

-- Records an approved discount on an order, after checking the approver's permission and limit.
create function pos.record_discount_approval(p_sale_id uuid, p_approver uuid, p_amount_kobo bigint, p_how text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sale  pos.sales;
  v_limit bigint;
begin
  select * into v_sale from pos.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Order not found.' using hint = 'not_found';
  end if;
  if v_sale.status <> 'placed' then
    raise exception 'Order % is already %.', v_sale.receipt_no, v_sale.status using hint = 'wrong_status';
  end if;
  if p_amount_kobo is null or p_amount_kobo < 0 or p_amount_kobo > v_sale.subtotal_kobo then
    raise exception 'The discount must be between ₦0 and the order total.' using hint = 'bad_discount';
  end if;
  if not pos.user_has_permission(p_approver, 'sales.discount') then
    raise exception 'This person can''t approve discounts.' using hint = 'not_allowed';
  end if;
  v_limit := pos.discount_limit(p_approver);
  if v_limit is not null and p_amount_kobo > v_limit then
    raise exception 'This discount is above the approver''s limit of %. Ask the owner.', pos.naira(v_limit)
      using hint = 'discount_over_limit';
  end if;

  update pos.sales set discount_approved_kobo = p_amount_kobo, discount_approved_by = p_approver,
                       discount_approved_at = now()
  where id = p_sale_id;

  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (p_approver, 'discount_approved', 'sale', p_sale_id::text,
          jsonb_build_object('receipt_no', v_sale.receipt_no, 'amount_kobo', p_amount_kobo,
                             'requested_kobo', v_sale.discount_requested_kobo, 'how', p_how));
end $$;

-- Checks a payment method and account go together (e.g. a card payment needs a card account).
create function pos.check_payment_account(p_method text, p_account_id smallint) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_acct pos.payment_accounts;
begin
  if p_method = 'cash' then
    if p_account_id is not null then
      raise exception 'Cash payments don''t go into a bank account.' using hint = 'bad_payment';
    end if;
    return;
  end if;
  if p_method not in ('transfer', 'card', 'online') then
    raise exception 'Unknown payment method "%".', p_method using hint = 'bad_payment';
  end if;
  select * into v_acct from pos.payment_accounts where id = p_account_id and is_active;
  if not found then
    raise exception 'Choose which bank or provider the % went into.', p_method using hint = 'account_required';
  end if;
  if (p_method = 'transfer' and not v_acct.accepts_transfer)
     or (p_method = 'card' and not v_acct.accepts_card)
     or (p_method = 'online' and not v_acct.accepts_online) then
    raise exception '% doesn''t take % payments.', v_acct.name, p_method using hint = 'bad_payment';
  end if;
end $$;

-- ---------- 1. Place order (sales rep) ----------
-- p_lines: [{ "code": "<IMEI or serial>" } | { "item_id": 12, "qty": 2, "floor_id": 1 }, ...]
--          optional "price_tier": "wholesale" on any line.
-- Prices always come from the database, never from the screen.
create function pos.place_order(
  p_floor_id                smallint,
  p_lines                   jsonb,
  p_customer_id             uuid default null,
  p_rep_note                text default null,
  p_discount_request_kobo   bigint default null   -- the discount the customer was promised
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('sales.create');
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
begin
  if not exists (select 1 from pos.floors where id = p_floor_id and is_active) then
    raise exception 'Unknown floor.' using hint = 'bad_floor';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An order needs at least one item.' using hint = 'empty_order';
  end if;

  select (value #>> '{}')::int into v_hold from pos.settings where key = 'order_hold_minutes';

  insert into pos.sales (floor_id, customer_id, sold_by, rep_note, hold_expires_at)
  values (p_floor_id, p_customer_id, v_user, nullif(trim(p_rep_note), ''),
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
      update pos.phone_units set status = 'held', held_by_sale = v_sale.id where id = v_unit.id;
    else
      if v_qty < 1 then
        raise exception 'Quantity must be at least 1.' using hint = 'bad_qty';
      end if;
      v_floor := coalesce((v_line->>'floor_id')::smallint, p_floor_id);
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

-- ---------- 1b. Approving a discount ----------

-- From the boss's or manager's own device: they see "discount requested" and approve it.
create function pos.approve_discount(p_sale_id uuid, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('sales.discount');
begin
  perform pos.record_discount_approval(p_sale_id, v_user, p_amount_kobo, 'own device');
  return jsonb_build_object('sale_id', p_sale_id, 'approved_kobo', p_amount_kobo);
end $$;

-- At the cash desk: the manager or boss types their PIN on the cashier's screen.
-- A wrong PIN doesn't raise an error (so the failed attempt is still counted); it returns ok=false.
create function pos.approve_discount_with_pin(
  p_sale_id     uuid,
  p_approver_id uuid,
  p_pin         text,
  p_amount_kobo bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_permission('sales.checkout');   -- only cashiers' screens ask for PINs
  v_staff pos.staff;
begin
  select * into v_staff from pos.staff where user_id = p_approver_id and is_active for update;
  if not found or v_staff.pin_hash is null then
    return jsonb_build_object('ok', false, 'message', 'That person has no PIN set up.');
  end if;
  if v_staff.pin_locked_until is not null and v_staff.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'message',
      format('Too many wrong PINs. %s''s PIN is locked until %s.', v_staff.display_name,
             to_char(v_staff.pin_locked_until at time zone 'Africa/Lagos', 'HH12:MI am')));
  end if;
  if extensions.crypt(coalesce(p_pin, ''), v_staff.pin_hash) <> v_staff.pin_hash then
    update pos.staff set
      pin_failed_count = pin_failed_count + 1,
      pin_locked_until = case when pin_failed_count + 1 >= 5 then now() + interval '15 minutes' end
    where user_id = p_approver_id;
    insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
    values (v_user, 'pin_failed', 'staff', p_approver_id::text, jsonb_build_object('sale_id', p_sale_id));
    return jsonb_build_object('ok', false, 'message', 'Wrong PIN.');
  end if;

  update pos.staff set pin_failed_count = 0, pin_locked_until = null where user_id = p_approver_id;
  perform pos.record_discount_approval(p_sale_id, p_approver_id, p_amount_kobo, 'PIN at the till');
  return jsonb_build_object('ok', true, 'sale_id', p_sale_id, 'approved_kobo', p_amount_kobo);
end $$;

-- Staff set their own PIN (4 to 6 digits). Only a scrambled copy is stored.
create function pos.set_my_pin(p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from pos.staff where user_id = auth.uid() and is_active) then
    raise exception 'Only active staff can set a PIN.' using hint = 'not_allowed';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'A PIN is 4 to 6 digits.' using hint = 'bad_pin';
  end if;
  update pos.staff set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
                       pin_failed_count = 0, pin_locked_until = null
  where user_id = auth.uid();
end $$;

-- ---------- 2. Checkout (cashier) ----------
-- p_payments: [{ "method": "cash", "amount_kobo": 1000000 },
--              { "method": "transfer", "account_id": 2, "amount_kobo": 500000, "reference": "..." }]
create function pos.checkout(
  p_sale_id       uuid,
  p_payments      jsonb,
  p_discount_kobo bigint default 0,
  p_receipt_note  text default null,
  p_customer_id   uuid default null,
  p_authorised_by uuid default null    -- who agreed the discount (boss or manager)
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('sales.checkout');
  v_sale     pos.sales;
  v_line     pos.sale_lines;
  v_unit     pos.phone_units;
  v_pay      jsonb;
  v_stock    int;
  v_limit    bigint;
  v_amount   bigint;
  v_paid     bigint := 0;
  v_subtotal bigint;
  v_total    bigint;
  v_discount bigint := coalesce(p_discount_kobo, 0);
  v_approver uuid;
  v_quick    bigint;
  v_left     bigint;
  v_lines    int;
  v_i        int := 0;
  v_share    bigint;
  v_items    text;
  v_cashier  text;
begin
  select * into v_sale from pos.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Order not found.' using hint = 'not_found';
  end if;
  if v_sale.status <> 'placed' then
    raise exception 'Order % is already %.', v_sale.receipt_no, v_sale.status using hint = 'wrong_status';
  end if;

  select coalesce(sum(qty * unit_price_kobo), 0), count(*) into v_subtotal, v_stock
  from pos.sale_lines where sale_id = p_sale_id and removed_at is null;
  if v_stock = 0 then
    raise exception 'This order has no items left.' using hint = 'empty_order';
  end if;

  -- Discount: applied straight away by the cashier, who records who authorised it.
  -- Above the quick-discount limit it must already be approved on the order (PIN or own device).
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'The discount must be between ₦0 and the order total.' using hint = 'bad_discount';
  end if;
  if v_discount > 0 then
    perform pos.require_permission('sales.apply_discount');
    if v_sale.discount_approved_kobo is not null and v_discount <= v_sale.discount_approved_kobo then
      v_approver := v_sale.discount_approved_by;
    else
      select (value #>> '{}')::bigint into v_quick from pos.settings where key = 'discount_quick_max_kobo';
      if v_discount > coalesce(v_quick, 0) then
        raise exception 'A discount above % needs a manager''s PIN or approval on their phone.', pos.naira(coalesce(v_quick, 0))
          using hint = 'discount_needs_approval';
      end if;
      v_approver := coalesce(p_authorised_by, case when pos.has_permission('sales.discount') then v_user end);
      if v_approver is null then
        raise exception 'Choose who authorised this discount.' using hint = 'authoriser_required';
      end if;
      if not pos.user_has_permission(v_approver, 'sales.discount') then
        raise exception '% can''t authorise discounts.',
          coalesce((select display_name from pos.staff where user_id = v_approver), 'That person')
          using hint = 'not_allowed';
      end if;
    end if;
  end if;
  v_total := v_subtotal - v_discount;

  -- Payments must add up to the total exactly.
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Add at least one payment.' using hint = 'no_payment';
  end if;
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    v_amount := (v_pay->>'amount_kobo')::bigint;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each payment needs an amount above ₦0.' using hint = 'bad_payment';
    end if;
    perform pos.check_payment_account(v_pay->>'method', (v_pay->>'account_id')::smallint);
    v_paid := v_paid + v_amount;
  end loop;
  if v_paid <> v_total then
    raise exception 'Payments add up to % but the total is %.', pos.naira(v_paid), pos.naira(v_total)
      using hint = 'payment_mismatch';
  end if;

  -- Stock. Rows are locked in a fixed order so two checkouts can't deadlock.
  for v_line in
    select * from pos.sale_lines where sale_id = p_sale_id and removed_at is null order by item_id, floor_id, id
  loop
    if v_line.unit_id is not null then
      select * into v_unit from pos.phone_units where id = v_line.unit_id for update;
      if not (v_unit.status = 'in_stock' or (v_unit.status = 'held' and v_unit.held_by_sale = p_sale_id)) then
        raise exception 'The % in this order is no longer available. Remove it and scan another.', v_line.item_name
          using hint = 'phone_unavailable';
      end if;
      update pos.phone_units set status = 'sold', held_by_sale = null where id = v_unit.id;
    else
      select quantity into v_stock from pos.stock_levels
      where item_id = v_line.item_id and floor_id = v_line.floor_id for update;
      if coalesce(v_stock, 0) < v_line.qty then
        raise exception 'Not enough % in stock (the system shows %). If it''s in your hand, ask a manager to approve it first.',
          v_line.item_name, coalesce(v_stock, 0) using hint = 'insufficient_stock';
      end if;
    end if;
    insert into pos.stock_movements (item_id, floor_id, qty_change, reason, unit_id, ref_type, ref_id, actor_id)
    values (v_line.item_id, v_line.floor_id, -v_line.qty, 'sale', v_line.unit_id, 'sale', p_sale_id::text, v_user);
  end loop;

  insert into pos.sale_payments (sale_id, method, account_id, amount_kobo, reference, received_by)
  select p_sale_id, p->>'method', (p->>'account_id')::smallint, (p->>'amount_kobo')::bigint,
         nullif(trim(p->>'reference'), ''), v_user
  from jsonb_array_elements(p_payments) p;

  update pos.sales set
    status = 'paid', paid_at = now(), checked_out_by = v_user, hold_expires_at = null,
    subtotal_kobo = v_subtotal, discount_kobo = v_discount, total_kobo = v_total,
    receipt_note = nullif(trim(p_receipt_note), ''),
    customer_id = coalesce(p_customer_id, customer_id)
  where id = p_sale_id;

  if v_discount > 0 then
    -- Spread a whole-order discount across the items in proportion to their value, so profit
    -- per product stays accurate. The last item takes any rounding remainder.
    v_left := v_discount;
    select count(*) into v_lines from pos.sale_lines where sale_id = p_sale_id and removed_at is null;
    for v_line in select * from pos.sale_lines where sale_id = p_sale_id and removed_at is null order by id loop
      v_i := v_i + 1;
      v_share := case when v_i = v_lines then v_left
                      else (v_discount * v_line.qty * v_line.unit_price_kobo) / v_subtotal end;
      update pos.sale_lines set line_discount_kobo = v_share where id = v_line.id;
      v_left := v_left - v_share;
    end loop;

    -- Alert the person named as authorising it, and every owner.
    select string_agg(item_name, ', ' order by id) into v_items
    from pos.sale_lines where sale_id = p_sale_id and removed_at is null;
    select display_name into v_cashier from pos.staff where user_id = v_user;
    insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
    select x.uid, 'discount_applied',
           format('%s off %s', pos.naira(v_discount), v_sale.receipt_no),
           format('%s applied %s off %s (%s). Paid %s. Authorised by %s.',
                  coalesce(v_cashier, 'A cashier'), pos.naira(v_discount), v_sale.receipt_no, v_items,
                  pos.naira(v_total), coalesce((select display_name from pos.staff where user_id = v_approver), 'unknown')),
           'sale', p_sale_id::text
    from (select v_approver as uid
          union
          select s.user_id from pos.staff s join pos.roles r on r.id = s.role_id
          where r.is_owner and s.is_active) x
    where x.uid is not null;

    insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
    values (v_user, 'discount_applied', 'sale', p_sale_id::text,
            jsonb_build_object('receipt_no', v_sale.receipt_no, 'discount_kobo', v_discount,
                               'subtotal_kobo', v_subtotal, 'requested_kobo', v_sale.discount_requested_kobo,
                               'requested_by', v_sale.sold_by, 'approved_by', v_approver, 'applied_by', v_user));
  end if;

  return jsonb_build_object('sale_id', p_sale_id, 'receipt_no', v_sale.receipt_no,
                            'total_kobo', v_total, 'discount_kobo', v_discount);
end $$;

-- ---------- 2b. "I didn't approve this discount" ----------
create function pos.dispute_discount(p_sale_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('sales.discount');
  v_sale pos.sales;
  v_name text;
begin
  select * into v_sale from pos.sales where id = p_sale_id;
  if not found or v_sale.discount_kobo = 0 then
    raise exception 'That sale has no discount.' using hint = 'not_found';
  end if;
  select display_name into v_name from pos.staff where user_id = v_user;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'discount_disputed', 'sale', p_sale_id::text,
          jsonb_build_object('receipt_no', v_sale.receipt_no, 'discount_kobo', v_sale.discount_kobo, 'note', p_note));
  insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
  select s.user_id, 'discount_disputed', format('Discount on %s questioned', v_sale.receipt_no),
         format('%s says they didn''t approve the %s discount on %s.%s', coalesce(v_name, 'A manager'),
                pos.naira(v_sale.discount_kobo), v_sale.receipt_no, coalesce(' Note: ' || p_note, '')),
         'sale', p_sale_id::text
  from pos.staff s join pos.roles r on r.id = s.role_id where r.is_owner and s.is_active;
end $$;

-- ---------- 3. Cancel an unpaid order (items simply go back on sale) ----------
create function pos.cancel_order(p_sale_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('sales.cancel');
  v_sale pos.sales;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'Say why the order is being cancelled.' using hint = 'reason_required';
  end if;
  select * into v_sale from pos.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Order not found.' using hint = 'not_found';
  end if;
  if v_sale.status <> 'placed' then
    raise exception 'Order % is already % and can''t be cancelled.', v_sale.receipt_no, v_sale.status
      using hint = 'wrong_status';
  end if;

  update pos.phone_units set status = 'in_stock', held_by_sale = null where held_by_sale = p_sale_id;
  update pos.sales set status = 'cancelled', cancelled_at = now(), cancelled_by = v_user,
                       cancel_reason = trim(p_reason), hold_expires_at = null
  where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id, 'receipt_no', v_sale.receipt_no, 'status', 'cancelled');
end $$;

-- ---------- 4. Remove one wrong item from an unpaid order ----------
create function pos.remove_order_line(p_line_id bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('sales.cancel');
  v_line pos.sale_lines;
  v_sale pos.sales;
  v_subtotal bigint;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'Say why the item is being removed.' using hint = 'reason_required';
  end if;
  select * into v_line from pos.sale_lines where id = p_line_id;
  if not found or v_line.removed_at is not null then
    raise exception 'That item isn''t in the order.' using hint = 'not_found';
  end if;
  select * into v_sale from pos.sales where id = v_line.sale_id for update;
  if v_sale.status <> 'placed' then
    raise exception 'Order % is already %.', v_sale.receipt_no, v_sale.status using hint = 'wrong_status';
  end if;

  update pos.sale_lines set removed_at = now(), removed_by = v_user, removed_reason = trim(p_reason)
  where id = p_line_id;
  if v_line.unit_id is not null then
    update pos.phone_units set status = 'in_stock', held_by_sale = null
    where id = v_line.unit_id and held_by_sale = v_sale.id;
  end if;

  select coalesce(sum(qty * unit_price_kobo), 0) into v_subtotal
  from pos.sale_lines where sale_id = v_sale.id and removed_at is null;
  update pos.sales set subtotal_kobo = v_subtotal, total_kobo = v_subtotal, discount_kobo = 0
  where id = v_sale.id;

  return jsonb_build_object('sale_id', v_sale.id, 'total_kobo', v_subtotal);
end $$;

-- ---------- 5. Return items from a paid sale ----------
-- p_lines: [{ "sale_line_id": 10, "qty": 1, "outcome": "back_in_stock" | "faulty" }]
create function pos.return_sale(
  p_sale_id           uuid,
  p_lines             jsonb,
  p_reason            text,
  p_refund_kobo       bigint default 0,
  p_refund_method     text default null,
  p_refund_account_id smallint default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user      uuid := pos.require_permission('sales.refund');
  v_sale      pos.sales;
  v_return_id uuid;
  v_req       jsonb;
  v_line      pos.sale_lines;
  v_qty       int;
  v_done      int;
  v_outcome   text;
  v_refunded  bigint;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'Say why the items are being returned.' using hint = 'reason_required';
  end if;
  select * into v_sale from pos.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found.' using hint = 'not_found';
  end if;
  if v_sale.status <> 'paid' then
    raise exception 'Only paid sales can be returned. Order % is %.', v_sale.receipt_no, v_sale.status
      using hint = 'wrong_status';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose at least one item to return.' using hint = 'empty_return';
  end if;

  -- Refund: never more than was paid, minus anything already refunded.
  select coalesce(sum(refund_kobo), 0) into v_refunded from pos.returns where sale_id = p_sale_id;
  if coalesce(p_refund_kobo, 0) < 0 or coalesce(p_refund_kobo, 0) > v_sale.total_kobo - v_refunded then
    raise exception 'The refund can be at most % for this sale.', pos.naira(v_sale.total_kobo - v_refunded)
      using hint = 'bad_refund';
  end if;
  if coalesce(p_refund_kobo, 0) > 0 then
    if p_refund_method is null then
      raise exception 'Choose how the refund is paid.' using hint = 'refund_method_required';
    end if;
    perform pos.check_payment_account(p_refund_method, p_refund_account_id);
  end if;

  insert into pos.returns (sale_id, reason, refund_method, refund_account_id, refund_kobo, processed_by)
  values (p_sale_id, trim(p_reason),
          case when coalesce(p_refund_kobo, 0) > 0 then p_refund_method end,
          case when coalesce(p_refund_kobo, 0) > 0 then p_refund_account_id end,
          coalesce(p_refund_kobo, 0), v_user)
  returning id into v_return_id;

  for v_req in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from pos.sale_lines
    where id = (v_req->>'sale_line_id')::bigint and sale_id = p_sale_id and removed_at is null;
    if not found then
      raise exception 'That item isn''t part of sale %.', v_sale.receipt_no using hint = 'not_found';
    end if;
    v_qty     := coalesce((v_req->>'qty')::int, 1);
    v_outcome := v_req->>'outcome';
    select coalesce(sum(qty), 0) into v_done from pos.return_lines where sale_line_id = v_line.id;
    if v_qty < 1 or v_qty > v_line.qty - v_done then
      raise exception 'Only % of the % can still be returned.', v_line.qty - v_done, v_line.item_name
        using hint = 'bad_qty';
    end if;
    if v_outcome is null or v_outcome not in ('back_in_stock', 'faulty') then
      raise exception 'Say whether the % goes back into stock or is faulty.', v_line.item_name
        using hint = 'outcome_required';
    end if;

    insert into pos.return_lines (return_id, sale_line_id, qty, outcome)
    values (v_return_id, v_line.id, v_qty, v_outcome);

    if v_line.unit_id is not null then
      update pos.phone_units
      set status = case when v_outcome = 'back_in_stock' then 'in_stock' else 'faulty' end, held_by_sale = null
      where id = v_line.unit_id;
    end if;
    -- Faulty items stay out of sellable stock; good items go back on the shelf.
    if v_outcome = 'back_in_stock' then
      insert into pos.stock_movements (item_id, floor_id, qty_change, reason, unit_id, ref_type, ref_id, actor_id)
      values (v_line.item_id, v_line.floor_id, v_qty, 'return', v_line.unit_id, 'return', v_return_id::text, v_user);
    end if;
  end loop;

  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'sale_returned', 'sale', p_sale_id::text,
          jsonb_build_object('receipt_no', v_sale.receipt_no, 'return_id', v_return_id,
                             'refund_kobo', coalesce(p_refund_kobo, 0), 'reason', trim(p_reason)));

  return jsonb_build_object('return_id', v_return_id, 'receipt_no', v_sale.receipt_no,
                            'refund_kobo', coalesce(p_refund_kobo, 0));
end $$;

-- ---------- 6. Housekeeping, run on a schedule ----------

-- Phones held by orders that weren't checked out in time go back on sale.
-- The order itself stays in the queue; checkout re-checks each phone.
create function pos.release_expired_holds() returns integer
language sql security definer set search_path = '' as $$
  with released as (
    update pos.phone_units u set status = 'in_stock', held_by_sale = null
    from pos.sales s
    where u.held_by_sale = s.id and s.status = 'placed' and s.hold_expires_at < now()
    returning 1
  )
  select count(*)::int from released;
$$;

-- At the end of the day (Nigerian time), orders still waiting are cancelled.
create function pos.cancel_unfinished_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update pos.phone_units u set status = 'in_stock', held_by_sale = null
  from pos.sales s
  where u.held_by_sale = s.id and s.status = 'placed'
    and (s.placed_at at time zone 'Africa/Lagos')::date < (now() at time zone 'Africa/Lagos')::date;

  update pos.sales set status = 'cancelled', cancelled_at = now(),
                       cancel_reason = 'Not checked out by the end of the day', hold_expires_at = null
  where status = 'placed'
    and (placed_at at time zone 'Africa/Lagos')::date < (now() at time zone 'Africa/Lagos')::date;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------- access ----------
-- Till actions: callable by signed-in staff (each checks its own permission).
-- Housekeeping and helpers: server only.
revoke execute on all functions in schema pos from public, anon;
grant execute on function
  pos.place_order(smallint, jsonb, uuid, text, bigint),
  pos.approve_discount(uuid, bigint),
  pos.approve_discount_with_pin(uuid, uuid, text, bigint),
  pos.set_my_pin(text),
  pos.checkout(uuid, jsonb, bigint, text, uuid, uuid),
  pos.dispute_discount(uuid, text),
  pos.cancel_order(uuid, text),
  pos.remove_order_line(bigint, text),
  pos.return_sale(uuid, jsonb, text, bigint, text, smallint)
to authenticated;
grant execute on all functions in schema pos to service_role;
