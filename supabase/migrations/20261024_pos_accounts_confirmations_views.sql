-- The till sees each account's number and name (to read out to customers) and which accounts
-- need confirming; Money > Today shows what's still unconfirmed.

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
                             'holder', a.holder, 'needs_confirmation', a.needs_confirmation,
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
