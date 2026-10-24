-- POS step 15b, read side (D-042): held sales show in the Checkout queue, on Payments to confirm
-- and on Money > Today; accounts report whether they hold the sale.

create or replace function public.pos_order_queue() returns jsonb
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
      'awaiting', case when s.awaiting_confirmation is null then null else jsonb_build_object(
                    'amount_kobo', s.awaiting_confirmation->'amount_kobo', 'accounts', s.awaiting_confirmation->'accounts',
                    'at', s.awaiting_confirmation->'at',
                    'cashier', (select display_name from pos.staff where user_id = (s.awaiting_confirmation->>'cashier')::uuid)) end,
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

create or replace function public.pos_payments_to_confirm() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (pos.has_permission('money.view') or pos.has_permission('accounts.manage')) then
    raise exception 'You don''t have permission to confirm payments.' using hint = 'not_allowed';
  end if;
  return jsonb_build_object(
    -- Sales held at the till until someone confirms: these come first.
    'awaiting', coalesce((select jsonb_agg(x order by x->>'at') from (
                 select jsonb_build_object('sale_id', s.id, 'receipt_no', s.receipt_no, 'at', s.awaiting_confirmation->'at',
                          'amount_kobo', s.awaiting_confirmation->'amount_kobo', 'total_kobo', s.subtotal_kobo - coalesce((s.awaiting_confirmation->>'discount_kobo')::bigint, 0),
                          'customer', (select name from pos.customers where id = coalesce((s.awaiting_confirmation->>'customer_id')::uuid, s.customer_id)),
                          'cashier', (select display_name from pos.staff where user_id = (s.awaiting_confirmation->>'cashier')::uuid),
                          'items', (select string_agg(l.item_name, ', ' order by l.id) from pos.sale_lines l where l.sale_id = s.id and l.removed_at is null),
                          'payments', (select jsonb_agg(jsonb_build_object('method', p->>'method', 'amount_kobo', (p->>'amount_kobo')::bigint,
                                          'account', a.name, 'bank_name', a.bank_name, 'account_number', a.account_number,
                                          'check', coalesce(a.confirm_before_sale, false)))
                                       from jsonb_array_elements(s.awaiting_confirmation->'payments') p
                                       left join pos.payment_accounts a on a.id = (p->>'account_id')::smallint)) as x
                 from pos.sales s where s.awaiting_confirmation is not null and s.status = 'placed') q), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(x order by x->>'at') from (
                 select jsonb_build_object('id', p.id, 'at', p.created_at, 'amount_kobo', p.amount_kobo, 'method', p.method,
                          'account', a.name, 'bank_name', a.bank_name, 'account_number', a.account_number,
                          'sale_id', s.id, 'receipt_no', s.receipt_no,
                          'customer', (select name from pos.customers where id = s.customer_id),
                          'cashier', (select display_name from pos.staff where user_id = p.received_by)) as x
                 from pos.sale_payments p join pos.payment_accounts a on a.id = p.account_id join pos.sales s on s.id = p.sale_id
                 where p.confirmation = 'pending') q), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x order by x->>'confirmed_at' desc) from (
                 select jsonb_build_object('id', p.id, 'at', p.created_at, 'amount_kobo', p.amount_kobo, 'account', a.name,
                          'receipt_no', s.receipt_no, 'sale_id', s.id, 'confirmation', p.confirmation,
                          'confirmed_at', p.confirmed_at, 'note', p.confirmation_note,
                          'by', (select display_name from pos.staff where user_id = p.confirmed_by)) as x
                 from pos.sale_payments p join pos.payment_accounts a on a.id = p.account_id join pos.sales s on s.id = p.sale_id
                 where p.confirmation in ('confirmed', 'not_received') and p.confirmed_at > now() - interval '30 days'
                 order by p.confirmed_at desc limit 50) q), '[]'::jsonb)
  );
end $$;

create or replace function public.pos_money_overview(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_day   date := coalesce(p_day, (now() at time zone 'Africa/Lagos')::date);
  v_start timestamptz;
  v_end   timestamptz;
begin
  perform pos.require_permission('money.view');
  v_start := v_day::timestamp at time zone 'Africa/Lagos';
  v_end := (v_day + 1)::timestamp at time zone 'Africa/Lagos';
  return jsonb_build_object(
    'day', v_day,
    'takings', coalesce((select jsonb_agg(jsonb_build_object('method', x.method, 'account', a.name, 'amount_kobo', x.total, 'unconfirmed_kobo', x.unconfirmed)
                                          order by x.method, a.name)
                         from (select p.method, p.account_id, sum(p.amount_kobo) total,
                                      sum(p.amount_kobo) filter (where p.confirmation = 'pending') unconfirmed
                               from pos.sale_payments p join pos.sales s on s.id = p.sale_id
                               where s.source <> 'legacy' and p.created_at >= v_start and p.created_at < v_end group by 1, 2) x
                         left join pos.payment_accounts a on a.id = x.account_id), '[]'::jsonb),
    'takings_kobo', (select coalesce(sum(p.amount_kobo), 0) from pos.sale_payments p join pos.sales s on s.id = p.sale_id
                     where s.source <> 'legacy' and p.created_at >= v_start and p.created_at < v_end),
    'refunds_kobo', (select coalesce(sum(refund_kobo), 0) from pos.returns where created_at >= v_start and created_at < v_end),
    'expenses_kobo', (select coalesce(sum(amount_kobo), 0) from pos.expenses where spent_on = v_day),
    'supplier_payments_kobo', (select coalesce(sum(amount_kobo), 0) from pos.supplier_payments where paid_on = v_day),
    'unconfirmed_kobo', (select coalesce(sum(amount_kobo), 0) from pos.sale_payments where confirmation = 'pending'),
    'to_confirm', (select count(*) from pos.sale_payments where confirmation = 'pending'),
    'sales_waiting', (select count(*) from pos.sales where awaiting_confirmation is not null and status = 'placed'),
    'owing_kobo', (select coalesce(sum(pos.purchase_owed(d)), 0) from pos.deliveries d),
    'overdue', (select count(*) from pos.deliveries d where pos.purchase_owed(d) > 0
                  and d.received_at < now() - interval '30 days'),
    'cash_ups', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', c.id, 'by', st.display_name, 'at', c.period_end, 'expected_kobo', c.expected_cash_kobo,
                    'counted_kobo', c.counted_cash_kobo, 'difference_kobo', c.difference_kobo, 'note', c.note) order by c.period_end)
                  from pos.cash_ups c left join pos.staff st on st.user_id = c.user_id
                  where c.period_end >= v_start and c.period_end < v_end), '[]'::jsonb)
  );
end $$;

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
                             'bank_name', a.bank_name, 'account_number', a.account_number, 'account_name', a.account_name,
                             'holder', a.holder, 'needs_confirmation', a.needs_confirmation, 'confirm_before_sale', a.confirm_before_sale,
                             'transfer', a.accepts_transfer, 'card', a.accepts_card, 'online', a.accepts_online) order by a.sort)
                           from pos.payment_accounts a where a.is_active),
      'authorisers', (select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', x.display_name) order by x.display_name)
                      from pos.staff x where x.is_active and pos.user_has_permission(x.user_id, 'sales.discount')),
      'settings', (select jsonb_object_agg(key, value) from pos.settings),
      'unread_alerts', (select count(*) from pos.notifications where recipient_id = v_user and read_at is null)
    )
    from pos.staff s join pos.roles r on r.id = s.role_id
    where s.user_id = v_user
  );
end $$;

create or replace function public.pos_payment_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('accounts.manage');
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'id', a.id, 'name', a.name, 'transfer', a.accepts_transfer, 'card', a.accepts_card,
                     'online', a.accepts_online, 'is_active', a.is_active, 'bank_name', a.bank_name,
                     'account_number', a.account_number, 'account_name', a.account_name, 'holder', a.holder,
                     'needs_confirmation', a.needs_confirmation, 'confirm_before_sale', a.confirm_before_sale,
                     'used', (select count(*) from pos.sale_payments p where p.account_id = a.id))
                     order by a.is_active desc, a.sort)
                   from pos.payment_accounts a), '[]'::jsonb);
end $$;
