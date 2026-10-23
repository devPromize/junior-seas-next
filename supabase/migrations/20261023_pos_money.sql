-- POS step 12: Money (D-038).
--
-- Supplier bills: every purchase is owed until it's paid. Paying is one step (amount, date, how,
-- from which account), checked so nobody pays more than is owed or dates a payment in the
-- future. Anything unpaid after 30 days reminds the owner and anyone who pays suppliers, until
-- it's settled. Purchases from the old system are marked settled: the shop was paying them,
-- the old system just wasn't told.
-- Expenses: recorded in a few taps, with an optional photo of the receipt.
-- Cash-up: at the end of a shift a cashier counts the drawer; the system says what should be
-- there; any difference needs a note and alerts the owner.
-- Alerts: discount and supplier reminders get a place to be read.
-- Scheduled jobs: the scheduler is switched on, running the reminders and the two till jobs
-- from step 4 (release phones held by abandoned orders; cancel unpaid orders at midnight).

-- ---------- permissions ----------
insert into pos.permissions (code, label, warning, is_sensitive) values
  ('money.view', 'See money: takings, expenses and supplier bills',
   'They will see the shop''s takings, what it spends and what it owes suppliers.', true),
  ('suppliers.pay', 'Record payments to suppliers',
   'They can mark supplier bills as paid. Every payment is logged with who recorded it.', true),
  ('expenses.manage', 'Record expenses',
   'Money they record as spent comes out of the day''s takings. Every expense is logged.', true)
on conflict (code) do nothing;
insert into pos.role_permissions (role_id, permission_code)
select r.id, p.code from pos.roles r cross join (values ('money.view'), ('suppliers.pay'), ('expenses.manage')) p(code)
where r.name = 'Manager'
on conflict do nothing;

-- ---------- supplier bills ----------
alter table pos.deliveries add column settled_at timestamptz;      -- marked settled without a payment record
alter table pos.deliveries add column settled_note text;
alter table pos.deliveries add column last_reminded_at timestamptz;

update pos.deliveries set settled_at = now(), settled_note = 'Settled before the switch to the new POS'
where legacy_id is not null and settled_at is null;

create table pos.supplier_payments (
  id          bigint generated always as identity primary key,
  delivery_id uuid not null references pos.deliveries(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  paid_on     date not null,
  method      text not null check (method in ('cash', 'transfer', 'card')),
  account_id  smallint references pos.payment_accounts(id),
  reference   text,
  note        text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  check ((method = 'cash') = (account_id is null))
);
create index supplier_payments_delivery_idx on pos.supplier_payments (delivery_id);
alter table pos.supplier_payments enable row level security;

create function pos.purchase_paid(p_delivery uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_kobo), 0) from pos.supplier_payments where delivery_id = p_delivery;
$$;

-- What's still owed on a purchase (0 once settled).
create function pos.purchase_owed(p_delivery pos.deliveries) returns bigint
language sql stable security definer set search_path = '' as $$
  select case when p_delivery.settled_at is not null then 0
              else greatest(0, p_delivery.total_cost_kobo - pos.purchase_paid(p_delivery.id)) end;
$$;

-- Record a payment to a supplier for one purchase.
create function public.pos_pay_supplier(
  p_delivery_id uuid,
  p_amount_kobo bigint,
  p_paid_on     date,
  p_method      text,
  p_account_id  smallint default null,
  p_reference   text default null,
  p_note        text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('suppliers.pay');
  v_d    pos.deliveries;
  v_owed bigint;
begin
  select * into v_d from pos.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Purchase not found.' using hint = 'not_found';
  end if;
  v_owed := pos.purchase_owed(v_d);
  if v_d.total_cost_kobo = 0 then
    raise exception 'This purchase has no cost recorded, so there''s nothing to pay against.' using hint = 'no_cost';
  end if;
  if v_owed = 0 then
    raise exception '% is already fully paid.', coalesce(v_d.ref_no, 'This purchase') using hint = 'already_paid';
  end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'Enter how much was paid.' using hint = 'bad_amount';
  end if;
  if p_amount_kobo > v_owed then
    raise exception 'Only % is owed on %.', pos.naira(v_owed), coalesce(v_d.ref_no, 'this purchase') using hint = 'overpaid';
  end if;
  if p_paid_on is null then
    raise exception 'Enter the date it was paid.' using hint = 'date_required';
  end if;
  if p_paid_on > (now() at time zone 'Africa/Lagos')::date then
    raise exception 'The payment date can''t be in the future.' using hint = 'future_date';
  end if;
  if p_paid_on < (v_d.received_at at time zone 'Africa/Lagos')::date - 60 then
    raise exception 'That date is long before the purchase. Check it.' using hint = 'bad_date';
  end if;
  perform pos.check_payment_account(p_method, p_account_id);

  insert into pos.supplier_payments (delivery_id, amount_kobo, paid_on, method, account_id, reference, note, recorded_by)
  values (p_delivery_id, p_amount_kobo, p_paid_on, p_method, case when p_method = 'cash' then null else p_account_id end,
          nullif(trim(p_reference), ''), nullif(trim(p_note), ''), v_user);
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'supplier_paid', 'delivery', p_delivery_id::text,
          jsonb_build_object('ref_no', v_d.ref_no, 'amount_kobo', p_amount_kobo, 'paid_on', p_paid_on, 'method', p_method));
  return jsonb_build_object('owed_kobo', v_owed - p_amount_kobo);
end $$;

-- Supplier bills: what's owed, oldest first. p_show: 'owing' (default), 'overdue', 'paid', 'all'.
create function public.pos_supplier_bills(p_show text default 'owing', p_supplier bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
begin
  if not (pos.has_permission('money.view') or pos.has_permission('suppliers.pay')) then
    raise exception 'You don''t have permission to see supplier bills.' using hint = 'not_allowed';
  end if;
  return (
    with bills as (
      select d.id, d.ref_no, d.received_at, d.total_cost_kobo, d.settled_at, d.supplier_ref, s.id as supplier_id, s.name as supplier,
             pos.purchase_paid(d.id) as paid, pos.purchase_owed(d) as owed,
             ((now() at time zone 'Africa/Lagos')::date - (d.received_at at time zone 'Africa/Lagos')::date) as age_days
      from pos.deliveries d left join pos.suppliers s on s.id = d.supplier_id
      where d.total_cost_kobo > 0 and (p_supplier is null or d.supplier_id = p_supplier)
    )
    select jsonb_build_object(
      'owing_kobo', (select coalesce(sum(owed), 0) from bills),
      'overdue_kobo', (select coalesce(sum(owed), 0) from bills where owed > 0 and age_days > 30),
      'overdue', (select count(*) from bills where owed > 0 and age_days > 30),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', b.id, 'ref_no', b.ref_no, 'received_at', b.received_at, 'supplier', b.supplier, 'supplier_id', b.supplier_id,
                 'supplier_ref', b.supplier_ref, 'total_kobo', b.total_cost_kobo, 'paid_kobo', b.paid, 'owed_kobo', b.owed,
                 'age_days', b.age_days, 'settled', b.settled_at is not null) order by b.received_at)
               from (select * from bills
                     where case p_show when 'owing' then owed > 0 when 'overdue' then owed > 0 and age_days > 30
                                       when 'paid' then owed = 0 else true end
                     order by received_at limit 300) b), '[]'::jsonb)
    )
  );
end $$;

-- ---------- expenses ----------
create table pos.expense_categories (
  id         smallint generated always as identity primary key,
  name       text not null unique,
  is_active  boolean not null default true
);
insert into pos.expense_categories (name) values
  ('Diesel / fuel'), ('Electricity'), ('Food'), ('Transport'), ('Rent'), ('Salaries'),
  ('Repairs & maintenance'), ('Internet & airtime'), ('Cleaning'), ('Other');
alter table pos.expense_categories enable row level security;

create table pos.expenses (
  id          uuid primary key default gen_random_uuid(),
  ref_no      text not null unique,
  spent_on    date not null,
  category_id smallint not null references pos.expense_categories(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  method      text not null check (method in ('cash', 'transfer', 'card')),
  account_id  smallint references pos.payment_accounts(id),
  floor_id    smallint references pos.floors(id),     -- the department it was for, if any
  description text not null,
  recorded_by uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  check ((method = 'cash') = (account_id is null))
);
create index expenses_spent_on_idx on pos.expenses (spent_on);
alter table pos.expenses enable row level security;

-- Receipt photos for expenses use the same private store as purchases.
alter table pos.purchase_documents add column expense_id uuid references pos.expenses(id);
create or replace function public.pos_can_handle_purchases() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pos.staff where user_id = auth.uid() and is_active)
     and (pos.has_permission('stock.receive') or pos.has_permission('costs.view')
          or pos.has_permission('expenses.manage') or pos.has_permission('money.view'));
$$;

create function public.pos_record_expense(
  p_spent_on     date,
  p_category_id  smallint,
  p_amount_kobo  bigint,
  p_method       text,
  p_description  text,
  p_account_id   smallint default null,
  p_floor_id     smallint default null,
  p_document_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('expenses.manage');
  v_year text := to_char(now() at time zone 'Africa/Lagos', 'YYYY');
  v_ref  text;
  v_id   uuid;
begin
  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'Enter how much was spent.' using hint = 'bad_amount';
  end if;
  if nullif(trim(p_description), '') is null then
    raise exception 'Say what it was for.' using hint = 'description_required';
  end if;
  if not exists (select 1 from pos.expense_categories where id = p_category_id and is_active) then
    raise exception 'Choose what kind of expense it is.' using hint = 'category_required';
  end if;
  if p_spent_on is null or p_spent_on > (now() at time zone 'Africa/Lagos')::date then
    raise exception 'The date can''t be empty or in the future.' using hint = 'bad_date';
  end if;
  if p_spent_on < (now() at time zone 'Africa/Lagos')::date - 31 then
    raise exception 'That''s more than a month ago. Ask the owner to record it.' using hint = 'too_old';
  end if;
  if p_floor_id is not null then
    perform pos.require_department(p_floor_id);
  end if;
  perform pos.check_payment_account(p_method, p_account_id);

  perform pg_advisory_xact_lock(hashtext('pos.expense_no'));
  select 'EX' || v_year || '/' || lpad((coalesce(max(substring(ref_no from '/(\d+)$')::int), 0) + 1)::text, 4, '0') into v_ref
  from pos.expenses where ref_no like 'EX' || v_year || '/%';

  insert into pos.expenses (ref_no, spent_on, category_id, amount_kobo, method, account_id, floor_id, description, recorded_by)
  values (v_ref, p_spent_on, p_category_id, p_amount_kobo, p_method, case when p_method = 'cash' then null else p_account_id end,
          p_floor_id, trim(p_description), v_user)
  returning id into v_id;
  update pos.purchase_documents set expense_id = v_id
  where id = any(coalesce(p_document_ids, '{}')) and delivery_id is null and expense_id is null and uploaded_by = v_user;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'expense_recorded', 'expense', v_id::text,
          jsonb_build_object('ref_no', v_ref, 'amount_kobo', p_amount_kobo, 'category_id', p_category_id, 'method', p_method));
  return jsonb_build_object('id', v_id, 'ref_no', v_ref);
end $$;

create function public.pos_expenses(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
  v_all  boolean := pos.has_permission('money.view');
begin
  if not (v_all or pos.has_permission('expenses.manage')) then
    raise exception 'You don''t have permission to see expenses.' using hint = 'not_allowed';
  end if;
  return jsonb_build_object(
    'categories', (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id) from pos.expense_categories where is_active),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
               'id', e.id, 'ref_no', e.ref_no, 'spent_on', e.spent_on, 'category', c.name, 'amount_kobo', e.amount_kobo,
               'method', e.method, 'account', a.name, 'department', f.name, 'description', e.description,
               'recorded_by', st.display_name,
               'documents', (select count(*) from pos.purchase_documents pd where pd.expense_id = e.id))
               order by e.spent_on desc, e.created_at desc)
             from pos.expenses e join pos.expense_categories c on c.id = e.category_id
             left join pos.payment_accounts a on a.id = e.account_id left join pos.floors f on f.id = e.floor_id
             left join pos.staff st on st.user_id = e.recorded_by
             where (p_from is null or e.spent_on >= p_from) and (p_to is null or e.spent_on <= p_to)
               and (v_all or e.recorded_by = v_user)), '[]'::jsonb)
  );
end $$;

-- ---------- cash-up ----------
create table pos.cash_ups (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id),
  period_start       timestamptz not null,
  period_end         timestamptz not null,
  float_kobo         bigint not null default 0 check (float_kobo >= 0),
  expected_cash_kobo bigint not null,
  counted_cash_kobo  bigint not null check (counted_cash_kobo >= 0),
  difference_kobo    bigint not null,
  by_account         jsonb not null default '[]',
  note               text,
  created_at         timestamptz not null default now()
);
create index cash_ups_user_idx on pos.cash_ups (user_id, period_end desc);
alter table pos.cash_ups enable row level security;

-- What this person handled since their last cash-up (or since the start of today):
-- cash in from sales, cash out for refunds, expenses and supplier payments, and what went
-- into each bank or card account.
create function pos.cash_up_figures(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamptz := coalesce(
    (select max(period_end) from pos.cash_ups where user_id = p_user
      and period_end >= (now() at time zone 'Africa/Lagos')::date::timestamp at time zone 'Africa/Lagos'),
    (now() at time zone 'Africa/Lagos')::date::timestamp at time zone 'Africa/Lagos');
  v_sales_cash bigint;
  v_refunds    bigint;
  v_expenses   bigint;
  v_suppliers  bigint;
begin
  select coalesce(sum(amount_kobo), 0) into v_sales_cash from pos.sale_payments
  where received_by = p_user and method = 'cash' and created_at >= v_start;
  select coalesce(sum(refund_kobo), 0) into v_refunds from pos.returns
  where processed_by = p_user and refund_method = 'cash' and created_at >= v_start;
  select coalesce(sum(amount_kobo), 0) into v_expenses from pos.expenses
  where recorded_by = p_user and method = 'cash' and created_at >= v_start;
  select coalesce(sum(amount_kobo), 0) into v_suppliers from pos.supplier_payments
  where recorded_by = p_user and method = 'cash' and recorded_at >= v_start;
  return jsonb_build_object(
    'since', v_start, 'sales_cash_kobo', v_sales_cash, 'refunds_cash_kobo', v_refunds,
    'expenses_cash_kobo', v_expenses, 'suppliers_cash_kobo', v_suppliers,
    'cash_in_kobo', v_sales_cash - v_refunds - v_expenses - v_suppliers,
    'sales', (select count(distinct sale_id) from pos.sale_payments where received_by = p_user and created_at >= v_start),
    'by_account', coalesce((select jsonb_agg(jsonb_build_object('method', p.method, 'account', a.name, 'amount_kobo', p.total) order by a.name, p.method)
                            from (select method, account_id, sum(amount_kobo) total from pos.sale_payments
                                  where received_by = p_user and method <> 'cash' and created_at >= v_start group by 1, 2) p
                            left join pos.payment_accounts a on a.id = p.account_id), '[]'::jsonb)
  );
end $$;

create function public.pos_cash_up_preview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('till.manage');
begin
  return pos.cash_up_figures(v_user) || jsonb_build_object(
    'default_float_kobo', coalesce((select (value #>> '{}')::bigint from pos.settings where key = 'till_float_kobo'), 0));
end $$;

create function public.pos_cash_up(p_counted_kobo bigint, p_float_kobo bigint default 0, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('till.manage');
  v_fig      jsonb := pos.cash_up_figures(auth.uid());
  v_expected bigint;
  v_diff     bigint;
  v_id       uuid;
  v_name     text;
begin
  if p_counted_kobo is null or p_counted_kobo < 0 then
    raise exception 'Enter the cash you counted.' using hint = 'bad_amount';
  end if;
  if coalesce(p_float_kobo, 0) < 0 then
    raise exception 'The float can''t be negative.' using hint = 'bad_float';
  end if;
  v_expected := coalesce(p_float_kobo, 0) + (v_fig->>'cash_in_kobo')::bigint;
  v_diff := p_counted_kobo - v_expected;
  if v_diff <> 0 and nullif(trim(p_note), '') is null then
    raise exception 'The drawer is % %. Say why before closing.', pos.naira(abs(v_diff)),
      case when v_diff < 0 then 'short' else 'over' end using hint = 'note_required';
  end if;

  insert into pos.cash_ups (user_id, period_start, period_end, float_kobo, expected_cash_kobo, counted_cash_kobo,
                            difference_kobo, by_account, note)
  values (v_user, (v_fig->>'since')::timestamptz, now(), coalesce(p_float_kobo, 0), v_expected, p_counted_kobo,
          v_diff, v_fig->'by_account', nullif(trim(p_note), ''))
  returning id into v_id;

  if v_diff <> 0 then
    select display_name into v_name from pos.staff where user_id = v_user;
    insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
    select s.user_id, 'cash_up_difference',
           format('Cash-up %s %s', case when v_diff < 0 then 'short' else 'over' end, pos.naira(abs(v_diff))),
           format('%s counted %s; the system expected %s. Their note: %s', coalesce(v_name, 'A cashier'),
                  pos.naira(p_counted_kobo), pos.naira(v_expected), trim(p_note)),
           'cash_up', v_id::text
    from pos.staff s join pos.roles r on r.id = s.role_id where r.is_owner and s.is_active;
  end if;
  return jsonb_build_object('id', v_id, 'expected_kobo', v_expected, 'difference_kobo', v_diff);
end $$;

-- ---------- the money overview ----------
create function public.pos_money_overview(p_day date default null) returns jsonb
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
    'takings', coalesce((select jsonb_agg(jsonb_build_object('method', x.method, 'account', a.name, 'amount_kobo', x.total)
                                          order by x.method, a.name)
                         from (select p.method, p.account_id, sum(p.amount_kobo) total
                               from pos.sale_payments p join pos.sales s on s.id = p.sale_id
                               where s.source <> 'legacy' and p.created_at >= v_start and p.created_at < v_end group by 1, 2) x
                         left join pos.payment_accounts a on a.id = x.account_id), '[]'::jsonb),
    'takings_kobo', (select coalesce(sum(p.amount_kobo), 0) from pos.sale_payments p join pos.sales s on s.id = p.sale_id
                     where s.source <> 'legacy' and p.created_at >= v_start and p.created_at < v_end),
    'refunds_kobo', (select coalesce(sum(refund_kobo), 0) from pos.returns where created_at >= v_start and created_at < v_end),
    'expenses_kobo', (select coalesce(sum(amount_kobo), 0) from pos.expenses where spent_on = v_day),
    'supplier_payments_kobo', (select coalesce(sum(amount_kobo), 0) from pos.supplier_payments where paid_on = v_day),
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

-- ---------- payment accounts ----------
create function public.pos_save_payment_account(p_id smallint, p_name text, p_transfer boolean, p_card boolean,
                                                p_online boolean default false, p_is_active boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('settings.manage');
  v_id   smallint;
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'Give the account a name (e.g. Moniepoint).' using hint = 'name_required';
  end if;
  if not (p_transfer or p_card or p_online) then
    raise exception 'Tick what this account takes: transfers, cards or online payments.' using hint = 'nothing_accepted';
  end if;
  if exists (select 1 from pos.payment_accounts where lower(name) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'There''s already an account called %.', trim(p_name) using hint = 'duplicate_name';
  end if;
  if p_id is null then
    insert into pos.payment_accounts (name, accepts_transfer, accepts_card, accepts_online, sort, is_active)
    values (trim(p_name), p_transfer, p_card, p_online, coalesce((select max(sort) from pos.payment_accounts), 0) + 1, true)
    returning id into v_id;
  else
    update pos.payment_accounts set name = trim(p_name), accepts_transfer = p_transfer, accepts_card = p_card,
      accepts_online = p_online, is_active = p_is_active where id = p_id returning id into v_id;
  end if;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'payment_account_saved', 'payment_account', v_id::text,
          jsonb_build_object('name', trim(p_name), 'transfer', p_transfer, 'card', p_card, 'online', p_online, 'is_active', p_is_active));
  return jsonb_build_object('id', v_id);
end $$;

create function public.pos_payment_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('settings.manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'transfer', accepts_transfer, 'card', accepts_card,
                                                       'online', accepts_online, 'is_active', is_active) order by is_active desc, sort)
                   from pos.payment_accounts), '[]'::jsonb);
end $$;

-- ---------- alerts ----------
create function public.pos_alerts(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
                                                       'entity', n.entity, 'entity_id', n.entity_id, 'at', n.created_at,
                                                       'read', n.read_at is not null) order by n.created_at desc)
                   from (select * from pos.notifications where recipient_id = v_user order by created_at desc
                         limit greatest(1, least(p_limit, 200))) n), '[]'::jsonb);
end $$;

create function public.pos_mark_alerts_read() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update pos.notifications set read_at = now() where recipient_id = pos.require_staff() and read_at is null;
end $$;

-- pos_me gains the unread alert count, for the sidebar.
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
      'settings', (select jsonb_object_agg(key, value) from pos.settings),
      'unread_alerts', (select count(*) from pos.notifications where recipient_id = v_user and read_at is null)
    )
    from pos.staff s join pos.roles r on r.id = s.role_id
    where s.user_id = v_user
  );
end $$;

-- ---------- reminders: supplier bills unpaid after 30 days ----------
-- Sent to the owner and everyone who records supplier payments; repeated weekly until settled.
create function pos.remind_overdue_supplier_bills() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_d     record;
  v_count int := 0;
begin
  for v_d in
    select d.*, s.name as supplier_name, pos.purchase_owed(d) as owed
    from pos.deliveries d left join pos.suppliers s on s.id = d.supplier_id
    where d.settled_at is null and d.received_at < now() - interval '30 days'
      and (d.last_reminded_at is null or d.last_reminded_at < now() - interval '7 days')
  loop
    continue when v_d.owed = 0;
    insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
    select st.user_id, 'supplier_overdue',
           format('%s unpaid after %s days', coalesce(v_d.ref_no, 'A purchase'),
                  (now()::date - v_d.received_at::date)),
           format('%s still shows %s owed to %s. If it''s been paid, record the payment with the date it was paid.',
                  coalesce(v_d.ref_no, 'This purchase'), pos.naira(v_d.owed), coalesce(v_d.supplier_name, 'the supplier')),
           'delivery', v_d.id::text
    from pos.staff st join pos.roles r on r.id = st.role_id
    where st.is_active and (r.is_owner or pos.user_has_permission(st.user_id, 'suppliers.pay'));
    update pos.deliveries set last_reminded_at = now() where id = v_d.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- pos_purchase shows payments and what's owed.
create or replace function public.pos_purchase(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_deps  smallint[] := pos.user_departments(pos.require_purchase_access());
  v_costs boolean := pos.has_permission('costs.view') or pos.has_permission('money.view');
  v_d     pos.deliveries;
begin
  select * into v_d from pos.deliveries where id = p_id;
  if not found or not v_d.floor_id = any(v_deps) then
    raise exception 'Purchase not found.' using hint = 'not_found';
  end if;
  return jsonb_build_object(
    'id', v_d.id, 'ref_no', v_d.ref_no, 'received_at', v_d.received_at, 'supplier_ref', v_d.supplier_ref,
    'note', v_d.note, 'is_legacy', v_d.legacy_id is not null,
    'supplier', (select jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) from pos.suppliers s where s.id = v_d.supplier_id),
    'department', (select name from pos.floors where id = v_d.floor_id),
    'received_by', coalesce((select display_name from pos.staff where user_id = v_d.received_by), v_d.received_by_name),
    'total_cost_kobo', case when v_costs then v_d.total_cost_kobo end,
    'owed_kobo', case when v_costs or pos.has_permission('suppliers.pay') then pos.purchase_owed(v_d) end,
    'settled_note', case when v_d.settled_at is not null then v_d.settled_note end,
    'payments', case when v_costs or pos.has_permission('suppliers.pay') then coalesce((select jsonb_agg(jsonb_build_object(
                  'amount_kobo', p.amount_kobo, 'paid_on', p.paid_on, 'method', p.method, 'account', a.name,
                  'reference', p.reference, 'by', st.display_name) order by p.paid_on, p.id)
                from pos.supplier_payments p left join pos.payment_accounts a on a.id = p.account_id
                left join pos.staff st on st.user_id = p.recorded_by where p.delivery_id = v_d.id), '[]'::jsonb) end,
    'can_pay', pos.has_permission('suppliers.pay') and pos.purchase_owed(v_d) > 0,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                'item_id', l.item_id, 'name', coalesce(i.name, l.item_name), 'qty', l.qty,
                'unit_cost_kobo', case when v_costs then l.unit_cost_kobo end, 'new_price_kobo', l.new_price_kobo,
                'codes', (select jsonb_agg(ui.code order by ui.code) from pos.stock_movements m
                          join pos.unit_identifiers ui on ui.unit_id = m.unit_id and ui.slot = 1
                          where m.ref_type = 'delivery' and m.ref_id = v_d.id::text and m.item_id = l.item_id))
                order by l.id)
              from pos.delivery_lines l left join pos.items i on i.id = l.item_id where l.delivery_id = v_d.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', pd.id, 'path', pd.path, 'content_type', pd.content_type,
                             'uploaded_at', pd.uploaded_at) order by pd.uploaded_at)
                           from pos.purchase_documents pd where pd.delivery_id = v_d.id), '[]'::jsonb)
  );
end $$;

revoke execute on function pos.purchase_paid(uuid), pos.purchase_owed(pos.deliveries), pos.cash_up_figures(uuid),
  pos.remind_overdue_supplier_bills() from public, anon;
revoke execute on function
  public.pos_pay_supplier(uuid, bigint, date, text, smallint, text, text), public.pos_supplier_bills(text, bigint),
  public.pos_record_expense(date, smallint, bigint, text, text, smallint, smallint, uuid[]), public.pos_expenses(date, date),
  public.pos_cash_up_preview(), public.pos_cash_up(bigint, bigint, text), public.pos_money_overview(date),
  public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean), public.pos_payment_accounts(),
  public.pos_alerts(int), public.pos_mark_alerts_read()
from public, anon;
grant execute on function
  public.pos_pay_supplier(uuid, bigint, date, text, smallint, text, text), public.pos_supplier_bills(text, bigint),
  public.pos_record_expense(date, smallint, bigint, text, text, smallint, smallint, uuid[]), public.pos_expenses(date, date),
  public.pos_cash_up_preview(), public.pos_cash_up(bigint, bigint, text), public.pos_money_overview(date),
  public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean), public.pos_payment_accounts(),
  public.pos_alerts(int), public.pos_mark_alerts_read()
to authenticated;
