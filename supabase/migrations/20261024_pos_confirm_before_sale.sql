-- POS step 15b: accounts that hold the sale until the money is confirmed (D-042).
--
-- Each account now works one of three ways:
--   * no confirmation (the business's own accounts),
--   * confirmed afterwards (step 15: the sale goes through, someone confirms later),
--   * confirmed BEFORE the sale completes (new): for an account the shop can't see itself, the
--     owner can say "don't let the goods go until someone has checked the money arrived".
-- For the last kind, Complete sale first checks everything as if completing it (stock, amounts,
-- discount) and undoes it, so nothing at the till can fail later. The order then waits in Checkout
-- with its phones held and nothing taken out of stock. "Received" completes the sale in the
-- cashier's name and tells them to hand over the goods; "Not received" puts the order back in the
-- queue to take another payment.

alter table pos.payment_accounts add column confirm_before_sale boolean not null default false;
alter table pos.payment_accounts add constraint payment_accounts_before_sale_is_confirmed
  check (not confirm_before_sale or needs_confirmation);

-- The checkout waiting to be finished: payments, discount, note, customer, authoriser, cashier.
alter table pos.sales add column awaiting_confirmation jsonb;
alter table pos.sales add constraint sales_awaiting_only_when_placed
  check (awaiting_confirmation is null or status = 'placed');

-- A waiting order can't be changed or cancelled underneath the person confirming it.
create function pos.guard_awaiting_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'sales' then
    if old.awaiting_confirmation is not null and new.awaiting_confirmation is not null and new.status <> old.status then
      raise exception 'Order % is waiting for a payment to be confirmed. Stop waiting first.', old.receipt_no using hint = 'awaiting_confirmation';
    end if;
  elsif exists (select 1 from pos.sales where id = new.sale_id and awaiting_confirmation is not null) then
    raise exception 'This order is waiting for a payment to be confirmed. Stop waiting first.' using hint = 'awaiting_confirmation';
  end if;
  return new;
end $$;
create trigger sales_guard_awaiting before update of status on pos.sales
  for each row execute function pos.guard_awaiting_sale();
create trigger sale_lines_guard_awaiting before insert or update on pos.sale_lines
  for each row execute function pos.guard_awaiting_sale();

-- Checkout, done as a given cashier. pos.checkout (signed-in user) is now a thin wrapper, so a held
-- sale can be completed later in the name of the cashier who took the payment.
create function pos.checkout_as(
  p_user uuid, p_sale_id uuid, p_payments jsonb, p_discount_kobo bigint default 0,
  p_receipt_note text default null, p_customer_id uuid default null, p_authorised_by uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := p_user;
  v_sale     pos.sales;
  v_line     pos.sale_lines;
  v_unit     pos.phone_units;
  v_pay      jsonb;
  v_stock    int;
  v_quick    bigint;
  v_amount   bigint;
  v_paid     bigint := 0;
  v_subtotal bigint;
  v_total    bigint;
  v_discount bigint := coalesce(p_discount_kobo, 0);
  v_approver uuid;
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

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'The discount must be between ₦0 and the order total.' using hint = 'bad_discount';
  end if;
  if v_discount > 0 then
    if not pos.user_has_permission(v_user, 'sales.apply_discount') then
      raise exception 'You don''t have permission to do this: %.',
        lower((select label from pos.permissions where code = 'sales.apply_discount')) using hint = 'not_allowed';
    end if;
    if v_sale.discount_approved_kobo is not null and v_discount <= v_sale.discount_approved_kobo then
      v_approver := v_sale.discount_approved_by;
    else
      select (value #>> '{}')::bigint into v_quick from pos.settings where key = 'discount_quick_max_kobo';
      if v_discount > coalesce(v_quick, 0) then
        raise exception 'A discount above % needs a manager''s PIN or approval on their phone.', pos.naira(coalesce(v_quick, 0))
          using hint = 'discount_needs_approval';
      end if;
      v_approver := coalesce(p_authorised_by, case when pos.user_has_permission(v_user, 'sales.discount') then v_user end);
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
    v_left := v_discount;
    select count(*) into v_lines from pos.sale_lines where sale_id = p_sale_id and removed_at is null;
    for v_line in select * from pos.sale_lines where sale_id = p_sale_id and removed_at is null order by id loop
      v_i := v_i + 1;
      v_share := case when v_i = v_lines then v_left
                      else (v_discount * v_line.qty * v_line.unit_price_kobo) / v_subtotal end;
      update pos.sale_lines set line_discount_kobo = v_share where id = v_line.id;
      v_left := v_left - v_share;
    end loop;

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

create or replace function pos.checkout(
  p_sale_id uuid, p_payments jsonb, p_discount_kobo bigint default 0,
  p_receipt_note text default null, p_customer_id uuid default null, p_authorised_by uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return pos.checkout_as(pos.require_permission('sales.checkout'), p_sale_id, p_payments, p_discount_kobo,
                         p_receipt_note, p_customer_id, p_authorised_by);
end $$;

-- When a held sale is confirmed, the payments into the hold-the-sale accounts are recorded as
-- already confirmed by that person, so nobody is asked to confirm them a second time.
create or replace function pos.mark_payment_pending() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_by text := nullif(current_setting('pos.sale_confirmed_by', true), '');
  v_acct pos.payment_accounts;
begin
  if new.account_id is not null and new.confirmation is null then
    select * into v_acct from pos.payment_accounts where id = new.account_id;
    if v_acct.confirm_before_sale and v_by is not null then
      new.confirmation := 'confirmed';
      new.confirmed_by := v_by::uuid;
      new.confirmed_at := now();
    elsif v_acct.needs_confirmation then
      new.confirmation := 'pending';
    end if;
  end if;
  return new;
end $$;

-- Complete sale. Payments into a hold-the-sale account park the order until someone confirms.
create or replace function public.pos_checkout(
  p_sale_id uuid, p_payments jsonb, p_discount_kobo bigint default 0,
  p_receipt_note text default null, p_customer_id uuid default null, p_authorised_by uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('sales.checkout');
  v_sale     pos.sales;
  v_amount   bigint;
  v_accounts text;
  v_cashier  text;
begin
  if not exists (select 1 from pos.sale_lines l
                 where l.sale_id = p_sale_id and l.removed_at is null
                   and l.floor_id = any(pos.user_departments(v_user))) then
    raise exception 'This order has no items from your departments.' using hint = 'no_department_access';
  end if;
  if exists (select 1 from pos.sales where id = p_sale_id and awaiting_confirmation is not null) then
    raise exception 'This order is already waiting for a payment to be confirmed.' using hint = 'awaiting_confirmation';
  end if;

  select sum((p->>'amount_kobo')::bigint), string_agg(distinct a.name, ', ') into v_amount, v_accounts
  from jsonb_array_elements(case when jsonb_typeof(p_payments) = 'array' then p_payments else '[]'::jsonb end) p
  join pos.payment_accounts a on a.id = (p->>'account_id')::smallint and a.confirm_before_sale and a.is_active
  where p->>'method' <> 'cash';
  if v_accounts is null then
    return pos.checkout(p_sale_id, p_payments, p_discount_kobo, p_receipt_note, p_customer_id, p_authorised_by);
  end if;

  -- Do the whole checkout and undo it: any problem (stock, amounts, discount) shows now, at the till.
  begin
    perform pos.checkout(p_sale_id, p_payments, p_discount_kobo, p_receipt_note, p_customer_id, p_authorised_by);
    raise exception 'checked' using errcode = 'PX001';
  exception when sqlstate 'PX001' then null;
  end;

  -- Keep the phones held for as long as it takes (holds that already ran out are taken again).
  update pos.phone_units u set status = 'held', held_by_sale = p_sale_id
  from pos.sale_lines l
  where l.sale_id = p_sale_id and l.removed_at is null and l.unit_id = u.id and u.status = 'in_stock';

  update pos.sales set hold_expires_at = null,
    awaiting_confirmation = jsonb_build_object(
      'payments', p_payments, 'discount_kobo', coalesce(p_discount_kobo, 0), 'receipt_note', p_receipt_note,
      'customer_id', p_customer_id, 'authorised_by', p_authorised_by, 'cashier', v_user, 'at', now(),
      'amount_kobo', v_amount, 'accounts', v_accounts)
  where id = p_sale_id returning * into v_sale;

  select display_name into v_cashier from pos.staff where user_id = v_user;
  insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
  select w, 'sale_awaiting_confirmation',
         format('Sale waiting: confirm %s in %s', pos.naira(v_amount), v_accounts),
         format('%s says the customer paid %s into %s for receipt %s. The goods stay at the till until you confirm in Money → Payments to confirm.',
                coalesce(v_cashier, 'A cashier'), pos.naira(v_amount), v_accounts, v_sale.receipt_no),
         'sale_awaiting', p_sale_id::text
  from pos.money_watchers() w;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'sale_awaiting_confirmation', 'sale', p_sale_id::text, v_sale.awaiting_confirmation);

  return jsonb_build_object('sale_id', p_sale_id, 'receipt_no', v_sale.receipt_no, 'awaiting', true,
                            'amount_kobo', v_amount, 'accounts', v_accounts);
end $$;

-- "Received" completes the sale in the cashier's name; "Not received" sends it back to the queue.
create function public.pos_confirm_sale_payment(p_sale_id uuid, p_received boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
  v_sale pos.sales;
  v_a    jsonb;
  v_cash uuid;
  v_hold int;
  v_name text;
  v_res  jsonb;
begin
  if not (pos.has_permission('money.view') or pos.has_permission('accounts.manage')) then
    raise exception 'You don''t have permission to confirm payments.' using hint = 'not_allowed';
  end if;
  select * into v_sale from pos.sales where id = p_sale_id for update;
  if not found or v_sale.awaiting_confirmation is null then
    raise exception 'That sale isn''t waiting for a payment to be confirmed.' using hint = 'not_found';
  end if;
  if not p_received and nullif(trim(p_note), '') is null then
    raise exception 'Say what happened (e.g. "Boss checked, nothing came in").' using hint = 'note_required';
  end if;
  v_a := v_sale.awaiting_confirmation;
  v_cash := (v_a->>'cashier')::uuid;
  select display_name into v_name from pos.staff where user_id = v_user;

  if p_received then
    if not pos.user_has_permission(v_cash, 'sales.checkout') then
      raise exception '% can no longer take payments, so the sale can''t be completed in their name. Mark it not received and check it out again.',
        coalesce((select display_name from pos.staff where user_id = v_cash), 'The cashier') using hint = 'cashier_not_allowed';
    end if;
    update pos.sales set awaiting_confirmation = null where id = p_sale_id;
    perform set_config('pos.sale_confirmed_by', v_user::text, true);
    v_res := pos.checkout_as(v_cash, p_sale_id, v_a->'payments', (v_a->>'discount_kobo')::bigint, v_a->>'receipt_note',
                             (v_a->>'customer_id')::uuid, (v_a->>'authorised_by')::uuid);
    perform set_config('pos.sale_confirmed_by', '', true);
    insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
    values (v_cash, 'sale_payment_confirmed', format('Confirmed: hand over the goods for %s', v_sale.receipt_no),
            format('%s confirmed the %s paid into %s. The sale is complete; print or send the receipt.',
                   coalesce(v_name, 'Someone'), pos.naira((v_a->>'amount_kobo')::bigint), v_a->>'accounts'),
            'sale', p_sale_id::text);
  else
    select (value #>> '{}')::int into v_hold from pos.settings where key = 'order_hold_minutes';
    update pos.sales set awaiting_confirmation = null, hold_expires_at = now() + make_interval(mins => coalesce(v_hold, 30))
    where id = p_sale_id;
    insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
    select x.uid, 'sale_payment_not_received', format('%s NOT received: %s is back in Checkout', pos.naira((v_a->>'amount_kobo')::bigint), v_sale.receipt_no),
           format('%s marked the %s into %s as not received. Don''t hand over the goods; take another payment or cancel the order. Note: %s',
                  coalesce(v_name, 'Someone'), pos.naira((v_a->>'amount_kobo')::bigint), v_a->>'accounts', trim(p_note)),
           'sale', p_sale_id::text
    from (select v_cash as uid
          union select s.user_id from pos.staff s join pos.roles r on r.id = s.role_id where r.is_owner and s.is_active) x;
  end if;

  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, case when p_received then 'sale_payment_confirmed' else 'sale_payment_not_received' end, 'sale', p_sale_id::text,
          v_a || jsonb_build_object('note', nullif(trim(p_note), '')));
  return jsonb_build_object('sale_id', p_sale_id, 'receipt_no', v_sale.receipt_no, 'completed', p_received);
end $$;

-- The cashier takes the order back, e.g. the customer decided to pay cash instead.
create function public.pos_stop_waiting(p_sale_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('sales.checkout');
  v_sale pos.sales;
  v_hold int;
begin
  select * into v_sale from pos.sales where id = p_sale_id for update;
  if not found or v_sale.awaiting_confirmation is null then
    raise exception 'That order isn''t waiting for a confirmation.' using hint = 'not_found';
  end if;
  if not exists (select 1 from pos.sale_lines l where l.sale_id = p_sale_id and l.removed_at is null
                   and l.floor_id = any(pos.user_departments(v_user))) then
    raise exception 'This order has no items from your departments.' using hint = 'no_department_access';
  end if;
  select (value #>> '{}')::int into v_hold from pos.settings where key = 'order_hold_minutes';
  update pos.sales set awaiting_confirmation = null, hold_expires_at = now() + make_interval(mins => coalesce(v_hold, 30))
  where id = p_sale_id;
  insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
  select w, 'sale_awaiting_withdrawn', format('No need to confirm %s any more', v_sale.receipt_no),
         format('%s took order %s back to take a different payment. Nothing to check for it now.',
                coalesce((select display_name from pos.staff where user_id = v_user), 'The cashier'), v_sale.receipt_no),
         'sale_awaiting', p_sale_id::text
  from pos.money_watchers() w;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'sale_awaiting_withdrawn', 'sale', p_sale_id::text, v_sale.awaiting_confirmation);
  return jsonb_build_object('sale_id', p_sale_id);
end $$;

-- Orders waiting for a confirmation keep their hold and aren't cancelled at the end of the day.
create or replace function pos.cancel_unfinished_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update pos.phone_units u set status = 'in_stock', held_by_sale = null
  from pos.sales s
  where u.held_by_sale = s.id and s.status = 'placed' and s.awaiting_confirmation is null
    and (s.placed_at at time zone 'Africa/Lagos')::date < (now() at time zone 'Africa/Lagos')::date;

  update pos.sales set status = 'cancelled', cancelled_at = now(),
                       cancel_reason = 'Not checked out by the end of the day', hold_expires_at = null
  where status = 'placed' and awaiting_confirmation is null
    and (placed_at at time zone 'Africa/Lagos')::date < (now() at time zone 'Africa/Lagos')::date;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Accounts: the new option.
drop function public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean, text, text, text, text, boolean);
create function public.pos_save_payment_account(
  p_id smallint, p_name text, p_transfer boolean, p_card boolean, p_online boolean default false,
  p_is_active boolean default true, p_bank_name text default null, p_account_number text default null,
  p_account_name text default null, p_holder text default 'business', p_needs_confirmation boolean default false,
  p_confirm_before_sale boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user    uuid := pos.require_permission('accounts.manage');
  v_id      smallint;
  v_number  text := nullif(regexp_replace(coalesce(p_account_number, ''), '\s', '', 'g'), '');
  v_before  boolean := coalesce(p_confirm_before_sale, false);
  v_confirm boolean := coalesce(p_needs_confirmation, false) or p_holder = 'personal' or v_before;
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'Give the account a name (e.g. Moniepoint).' using hint = 'name_required';
  end if;
  if not (p_transfer or p_card or p_online) then
    raise exception 'Tick what this account takes: transfers, cards or online payments.' using hint = 'nothing_accepted';
  end if;
  if p_holder not in ('business', 'personal') then
    raise exception 'Say whose account it is.' using hint = 'bad_holder';
  end if;
  if v_number is not null and v_number !~ '^[0-9]{10}$' then
    raise exception 'A Nigerian account number has 10 digits.' using hint = 'bad_account_number';
  end if;
  if exists (select 1 from pos.payment_accounts where lower(name) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'There''s already an account called %.', trim(p_name) using hint = 'duplicate_name';
  end if;
  if p_id is null then
    insert into pos.payment_accounts (name, accepts_transfer, accepts_card, accepts_online, sort, is_active,
                                      bank_name, account_number, account_name, holder, needs_confirmation, confirm_before_sale)
    values (trim(p_name), p_transfer, p_card, p_online, coalesce((select max(sort) from pos.payment_accounts), 0) + 1, true,
            nullif(trim(p_bank_name), ''), v_number, nullif(trim(p_account_name), ''), p_holder, v_confirm, v_before)
    returning id into v_id;
  else
    update pos.payment_accounts set name = trim(p_name), accepts_transfer = p_transfer, accepts_card = p_card,
      accepts_online = p_online, is_active = p_is_active, bank_name = nullif(trim(p_bank_name), ''),
      account_number = v_number, account_name = nullif(trim(p_account_name), ''), holder = p_holder,
      needs_confirmation = v_confirm, confirm_before_sale = v_before
    where id = p_id returning id into v_id;
  end if;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'payment_account_saved', 'payment_account', v_id::text,
          jsonb_build_object('name', trim(p_name), 'transfer', p_transfer, 'card', p_card, 'online', p_online,
                             'is_active', p_is_active, 'bank', p_bank_name, 'account_number', v_number,
                             'account_name', p_account_name, 'holder', p_holder, 'needs_confirmation', v_confirm,
                             'confirm_before_sale', v_before));
  return jsonb_build_object('id', v_id);
end $$;

revoke execute on function pos.checkout_as(uuid, uuid, jsonb, bigint, text, uuid, uuid), pos.guard_awaiting_sale()
from public, anon, authenticated;
revoke execute on function
  public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean, text, text, text, text, boolean, boolean),
  public.pos_confirm_sale_payment(uuid, boolean, text), public.pos_stop_waiting(uuid)
from public, anon;
grant execute on function
  public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean, text, text, text, text, boolean, boolean),
  public.pos_confirm_sale_payment(uuid, boolean, text), public.pos_stop_waiting(uuid)
to authenticated;
