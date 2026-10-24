-- POS step 15: account details, payments that need confirming, and per-person permissions (D-041).
--
-- 1. Each payment account carries its bank, account number and account name, and is either the
--    business's own or someone's personal account (e.g. Boss's Access Bank account).
-- 2. Money paid into an account marked "needs confirming" never slows the sale: it completes as
--    normal, and the owner and managers are alerted to confirm it was received. Until someone
--    confirms, it's shown as unconfirmed.
-- 3. Accounts get their own permission ("Manage bank and card accounts"), and the owner can give
--    any permission to one particular person without changing their whole role.

insert into pos.permissions (code, label, warning, is_sensitive) values
  ('accounts.manage', 'Manage bank and card accounts',
   'They can add, change or retire the accounts customers pay into, including account numbers.', true)
on conflict (code) do nothing;

alter table pos.payment_accounts add column bank_name text;
alter table pos.payment_accounts add column account_number text check (account_number ~ '^[0-9]{10}$');
alter table pos.payment_accounts add column account_name text;
alter table pos.payment_accounts add column holder text not null default 'business' check (holder in ('business', 'personal'));
alter table pos.payment_accounts add column needs_confirmation boolean not null default false;

alter table pos.sale_payments add column confirmation text check (confirmation in ('pending', 'confirmed', 'not_received'));
alter table pos.sale_payments add column confirmed_by uuid references auth.users(id);
alter table pos.sale_payments add column confirmed_at timestamptz;
alter table pos.sale_payments add column confirmation_note text;
create index sale_payments_pending_idx on pos.sale_payments (created_at) where confirmation = 'pending';

-- Who hears about a payment that needs confirming: the owner and everyone who sees money.
create function pos.money_watchers() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.user_id from pos.staff s join pos.roles r on r.id = s.role_id
  where s.is_active and (r.is_owner or pos.user_has_permission(s.user_id, 'money.view'));
$$;

-- A payment into an account that needs confirming is marked pending as it's saved...
create function pos.mark_payment_pending() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is not null and new.confirmation is null
     and exists (select 1 from pos.payment_accounts where id = new.account_id and needs_confirmation) then
    new.confirmation := 'pending';
  end if;
  return new;
end $$;
create trigger sale_payments_mark_pending before insert on pos.sale_payments
for each row execute function pos.mark_payment_pending();

-- ...and the owner and managers are told, without holding up the sale.
create function pos.alert_payment_pending() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_receipt text;
  v_account text;
  v_cashier text;
begin
  if new.confirmation = 'pending' then
    select receipt_no into v_receipt from pos.sales where id = new.sale_id;
    select name into v_account from pos.payment_accounts where id = new.account_id;
    select display_name into v_cashier from pos.staff where user_id = new.received_by;
    insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
    select w, 'payment_to_confirm',
           format('Confirm %s paid into %s', pos.naira(new.amount_kobo), v_account),
           format('%s was paid into %s on receipt %s (cashier: %s). Confirm it was received, then mark it in Money.',
                  pos.naira(new.amount_kobo), v_account, coalesce(v_receipt, '—'), coalesce(v_cashier, 'unknown')),
           'payment', new.id::text
    from pos.money_watchers() w;
  end if;
  return new;
end $$;
create trigger sale_payments_alert_pending after insert on pos.sale_payments
for each row execute function pos.alert_payment_pending();

-- ---------- accounts ----------
drop function public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean);
create function public.pos_save_payment_account(
  p_id                 smallint,
  p_name               text,
  p_transfer           boolean,
  p_card               boolean,
  p_online             boolean default false,
  p_is_active          boolean default true,
  p_bank_name          text default null,
  p_account_number     text default null,
  p_account_name       text default null,
  p_holder             text default 'business',
  p_needs_confirmation boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := pos.require_permission('accounts.manage');
  v_id     smallint;
  v_number text := nullif(regexp_replace(coalesce(p_account_number, ''), '\s', '', 'g'), '');
  v_confirm boolean := coalesce(p_needs_confirmation, false) or p_holder = 'personal';
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
                                      bank_name, account_number, account_name, holder, needs_confirmation)
    values (trim(p_name), p_transfer, p_card, p_online, coalesce((select max(sort) from pos.payment_accounts), 0) + 1, true,
            nullif(trim(p_bank_name), ''), v_number, nullif(trim(p_account_name), ''), p_holder, v_confirm)
    returning id into v_id;
  else
    update pos.payment_accounts set name = trim(p_name), accepts_transfer = p_transfer, accepts_card = p_card,
      accepts_online = p_online, is_active = p_is_active, bank_name = nullif(trim(p_bank_name), ''),
      account_number = v_number, account_name = nullif(trim(p_account_name), ''), holder = p_holder,
      needs_confirmation = v_confirm
    where id = p_id returning id into v_id;
  end if;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'payment_account_saved', 'payment_account', v_id::text,
          jsonb_build_object('name', trim(p_name), 'transfer', p_transfer, 'card', p_card, 'online', p_online,
                             'is_active', p_is_active, 'bank', p_bank_name, 'account_number', v_number,
                             'account_name', p_account_name, 'holder', p_holder, 'needs_confirmation', v_confirm));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.pos_payment_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('accounts.manage');
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'id', a.id, 'name', a.name, 'transfer', a.accepts_transfer, 'card', a.accepts_card,
                     'online', a.accepts_online, 'is_active', a.is_active, 'bank_name', a.bank_name,
                     'account_number', a.account_number, 'account_name', a.account_name, 'holder', a.holder,
                     'needs_confirmation', a.needs_confirmation,
                     'used', (select count(*) from pos.sale_payments p where p.account_id = a.id))
                     order by a.is_active desc, a.sort)
                   from pos.payment_accounts a), '[]'::jsonb);
end $$;

-- ---------- confirming payments ----------
create function public.pos_payments_to_confirm() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (pos.has_permission('money.view') or pos.has_permission('accounts.manage')) then
    raise exception 'You don''t have permission to confirm payments.' using hint = 'not_allowed';
  end if;
  return jsonb_build_object(
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

create function public.pos_confirm_payment(p_payment_id bigint, p_received boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
  v_p    pos.sale_payments;
  v_name text;
begin
  if not (pos.has_permission('money.view') or pos.has_permission('accounts.manage')) then
    raise exception 'You don''t have permission to confirm payments.' using hint = 'not_allowed';
  end if;
  select * into v_p from pos.sale_payments where id = p_payment_id for update;
  if not found or v_p.confirmation is null then
    raise exception 'That payment doesn''t need confirming.' using hint = 'not_found';
  end if;
  if not p_received and nullif(trim(p_note), '') is null then
    raise exception 'Say what happened (e.g. "Boss checked, nothing came in").' using hint = 'note_required';
  end if;
  update pos.sale_payments set confirmation = case when p_received then 'confirmed' else 'not_received' end,
    confirmed_by = v_user, confirmed_at = now(), confirmation_note = nullif(trim(p_note), '')
  where id = p_payment_id;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, case when p_received then 'payment_confirmed' else 'payment_not_received' end, 'payment', p_payment_id::text,
          jsonb_build_object('amount_kobo', v_p.amount_kobo, 'account_id', v_p.account_id, 'sale_id', v_p.sale_id, 'note', p_note));
  if not p_received then
    select display_name into v_name from pos.staff where user_id = v_user;
    insert into pos.notifications (recipient_id, kind, title, body, entity, entity_id)
    select s.user_id, 'payment_not_received',
           format('%s NOT received', pos.naira(v_p.amount_kobo)),
           format('%s marked a %s payment on receipt %s as not received. Note: %s', coalesce(v_name, 'Someone'),
                  pos.naira(v_p.amount_kobo), (select receipt_no from pos.sales where id = v_p.sale_id), trim(p_note)),
           'sale', v_p.sale_id::text
    from pos.staff s join pos.roles r on r.id = s.role_id where r.is_owner and s.is_active;
  end if;
  return jsonb_build_object('id', p_payment_id, 'confirmation', case when p_received then 'confirmed' else 'not_received' end);
end $$;

-- ---------- per-person permissions ----------
-- Everything this person can do, where it comes from (their role, or a change just for them),
-- so the owner can give or take away one permission without changing their role.
create function public.pos_staff_permissions(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role smallint := (select role_id from pos.staff where user_id = p_user);
begin
  perform pos.require_permission('staff.manage');
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'code', p.code, 'label', p.label, 'warning', p.warning, 'sensitive', p.is_sensitive,
                     'from_role', exists (select 1 from pos.role_permissions rp where rp.role_id = v_role and rp.permission_code = p.code),
                     'override', (select o.granted from pos.staff_permission_overrides o where o.user_id = p_user and o.permission_code = p.code
                                    and (o.expires_at is null or o.expires_at > now())),
                     'effective', pos.user_has_permission(p_user, p.code)) order by p.label)
                   from pos.permissions p), '[]'::jsonb);
end $$;

-- p_granted: true = give, false = take away, null = back to what the role gives. Owner only.
create function public.pos_set_staff_permission(p_user uuid, p_code text, p_granted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := pos.require_staff();
begin
  if not exists (select 1 from pos.staff s join pos.roles r on r.id = s.role_id where s.user_id = v_me and r.is_owner) then
    raise exception 'Only the owner can give or take away individual permissions.' using hint = 'not_allowed';
  end if;
  if exists (select 1 from pos.staff s join pos.roles r on r.id = s.role_id where s.user_id = p_user and r.is_owner) then
    raise exception 'The owner already has every permission.' using hint = 'owner';
  end if;
  if not exists (select 1 from pos.permissions where code = p_code) then
    raise exception 'Unknown permission.' using hint = 'bad_permission';
  end if;
  if p_granted is null then
    delete from pos.staff_permission_overrides where user_id = p_user and permission_code = p_code;
  else
    insert into pos.staff_permission_overrides (user_id, permission_code, granted, set_by, set_at)
    values (p_user, p_code, p_granted, v_me, now())
    on conflict (user_id, permission_code) do update set granted = excluded.granted, set_by = v_me, set_at = now(), expires_at = null;
  end if;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_me, 'permission_changed', 'staff', p_user::text, jsonb_build_object('permission', p_code, 'granted', p_granted));
  return jsonb_build_object('effective', pos.user_has_permission(p_user, p_code));
end $$;

revoke execute on function pos.money_watchers() from public, anon, authenticated;
revoke execute on function
  public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean, text, text, text, text, boolean),
  public.pos_payments_to_confirm(), public.pos_confirm_payment(bigint, boolean, text),
  public.pos_staff_permissions(uuid), public.pos_set_staff_permission(uuid, text, boolean)
from public, anon;
grant execute on function
  public.pos_save_payment_account(smallint, text, boolean, boolean, boolean, boolean, text, text, text, text, boolean),
  public.pos_payments_to_confirm(), public.pos_confirm_payment(bigint, boolean, text),
  public.pos_staff_permissions(uuid), public.pos_set_staff_permission(uuid, text, boolean)
to authenticated;
