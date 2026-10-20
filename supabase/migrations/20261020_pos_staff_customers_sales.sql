-- POS step 3: staff, roles & permissions, customers, and the sales tables
-- (orders, payments, returns), plus an audit log.
-- Tables only. The actions that use them (place order, checkout, cancel, return) come next,
-- as database functions with tests.

-- 0a. Laptops and tablets have serial numbers, not IMEIs. The identifier register now holds
--     both, each with its own format check.
alter table pos.phone_unit_imeis rename to unit_identifiers;
alter table pos.unit_identifiers rename column imei to code;
alter table pos.unit_identifiers drop constraint phone_unit_imeis_imei_check;
alter table pos.unit_identifiers add column kind text not null default 'imei' check (kind in ('imei', 'serial'));
alter table pos.unit_identifiers add constraint unit_identifiers_format check (
  (kind = 'imei'   and code ~ '^[0-9]{14,17}$') or
  (kind = 'serial' and code ~ '^[A-Za-z0-9-]{5,30}$'));

-- 0b. Stock corrections (wrong product, wrong delivery quantity) get their own reason.
alter table pos.stock_movements drop constraint stock_movements_reason_check;
alter table pos.stock_movements add constraint stock_movements_reason_check check (reason in (
  'opening', 'sale', 'sale_cancelled', 'return', 'purchase', 'transfer_out',
  'adjustment', 'correction', 'repair_part', 'online_order'));

-- 0c. Wholesale price per item. Optional: empty means "no wholesale price set" and changes nothing.
alter table pos.items add column wholesale_price_kobo bigint check (wholesale_price_kobo >= 0);
alter table pos.items add column wholesale_min_qty int check (wholesale_min_qty > 0);   -- optional minimum quantity

-- A reusable "this table is append-only" guard.
create function pos.block_changes() returns trigger
language plpgsql as $$
begin
  raise exception '% rows cannot be changed or deleted.', tg_table_name;
end $$;

-- 1. Permissions: each one is a switch. Sensitive ones carry the warning shown to the owner
--    before granting them.
create table pos.permissions (
  code         text primary key,
  label        text not null,
  is_sensitive boolean not null default false,
  warning      text
);

insert into pos.permissions (code, label, is_sensitive, warning) values
  ('sales.create',        'Build sales and capture customers', false, null),
  ('sales.checkout',      'Take payment and complete sales', true,
     'This person can take money and complete sales. Every payment is recorded against their name.'),
  ('sales.discount',      'Give discounts up to their limit', true,
     'They can reduce prices at checkout, up to their discount limit. Every discount is recorded.'),
  ('sales.wholesale',     'Sell at the wholesale price', true,
     'They can sell items at the wholesale price instead of the normal price.'),
  ('sales.cancel',        'Cancel unpaid orders', false, null),
  ('sales.refund',        'Refund or return a paid sale', true,
     'Refunds pay money out of the till. Anyone with this permission can cancel a paid sale and hand back the cash. Every refund is logged.'),
  ('sales.view_own',      'See their own sales', false, null),
  ('sales.view_floor',    'See all sales on the floor they are working on', false, null),
  ('sales.view_all',      'See sales on every floor', true,
     'They will see sales and takings for every floor, not just their own.'),
  ('till.manage',         'Open and close a till', false, null),
  ('stock.receive',       'Receive deliveries', false, null),
  ('stock.transfer',      'Send stock to Store B', true,
     'Stock they send leaves the shop''s count immediately.'),
  ('stock.adjust',        'Correct stock levels', true,
     'They can change stock counts. Every change is logged with who made it and why.'),
  ('stock.approve_found', 'Approve "I have it in hand" at the till', true,
     'They can put items back into stock when the system shows none.'),
  ('products.manage',     'Create and edit products', false, null),
  ('prices.wholesale',    'Set wholesale prices', true,
     'They can set or change the wholesale price of any item.'),
  ('prices.edit',         'Change prices', true,
     'They can change selling prices, including below the minimum price.'),
  ('costs.view',          'See cost prices and profit', true,
     'They will see what the shop pays for stock and how much profit each sale makes.'),
  ('customers.export',    'Export customer lists', true,
     'Customer lists contain personal details protected by Nigerian data protection law.'),
  ('repairs.manage',      'Create and update repair tickets', false, null),
  ('quotes.manage',       'Create quotations', false, null),
  ('reports.view',        'See reports for their floors', false, null),
  ('audit.view',          'See the audit log', false, null),
  ('staff.manage',        'Manage staff, roles and permissions', true,
     'They can give anyone any permission, including themselves.'),
  ('settings.manage',     'Change business settings', true,
     'They can change receipts, payment methods and other business-wide settings.');

-- 2. Roles: named bundles of permissions. The owner role always has everything.
create table pos.roles (
  id                  smallint generated always as identity primary key,
  name                text not null unique,
  description         text,
  discount_limit_kobo bigint not null default 0 check (discount_limit_kobo >= 0),
  is_owner            boolean not null default false,
  created_at          timestamptz not null default now()
);

create table pos.role_permissions (
  role_id         smallint not null references pos.roles(id) on delete cascade,
  permission_code text not null references pos.permissions(code),
  primary key (role_id, permission_code)
);

insert into pos.roles (name, description, discount_limit_kobo, is_owner) values
  ('Owner',             'Everything, every floor', 0, true),
  ('Manager',           'Runs the floor: approvals, stock, returns', 2000000, false),
  ('Cashier',           'The one person per floor who handles money', 0, false),
  ('Sales rep',         'Builds sales and sends them to the cashier', 0, false),
  ('Inventory officer', 'Receives, transfers and corrects stock', 0, false),
  ('Auditor',           'Reads everything, changes nothing', 0, false),
  ('Technician',        'Works repair tickets', 0, false);

insert into pos.role_permissions (role_id, permission_code)
select r.id, p.code
from pos.roles r
join (values
  ('Manager', array['sales.create','sales.checkout','sales.discount','sales.wholesale','sales.cancel','sales.refund',
                    'sales.view_floor','till.manage','stock.receive','stock.transfer','stock.adjust',
                    'stock.approve_found','products.manage','prices.wholesale','repairs.manage','quotes.manage','reports.view']),
  ('Cashier', array['sales.create','sales.checkout','sales.cancel','sales.view_floor',
                    'till.manage','repairs.manage','quotes.manage']),
  ('Sales rep', array['sales.create','sales.view_own','quotes.manage']),
  ('Inventory officer', array['stock.receive','stock.adjust','products.manage','prices.wholesale','reports.view']),
  ('Auditor', array['sales.view_all','costs.view','reports.view','audit.view']),
  ('Technician', array['sales.create','repairs.manage'])
) as m(role_name, perms) on m.role_name = r.name
cross join lateral unnest(m.perms) as perm(code)
join pos.permissions p on p.code = perm.code;

-- 3. Staff: a login (Supabase Auth user) plus a role and a quick-switch PIN.
--    Staff aren't tied to a floor: people move between floors. The floor someone is working on
--    comes from the till or device they're using that day.
create table pos.staff (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null,
  phone               text,
  role_id             smallint not null references pos.roles(id),
  discount_limit_kobo bigint check (discount_limit_kobo >= 0),   -- overrides the role's limit
  pin_hash            text,                                      -- never the PIN itself
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Per-person changes to their role's permissions: add any number of extra permissions, or
-- remove some, for this one person only. Permanent, or until a set date.
create table pos.staff_permission_overrides (
  user_id         uuid not null references pos.staff(user_id) on delete cascade,
  permission_code text not null references pos.permissions(code),
  granted         boolean not null,
  expires_at      timestamptz,
  reason          text,
  set_by          uuid references auth.users(id),
  set_at          timestamptz not null default now(),
  primary key (user_id, permission_code)
);

-- Does the signed-in person have this permission right now?
create function pos.has_permission(p_code text) returns boolean
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
    where s.user_id = auth.uid()), false);
$$;

-- 4. Customers: built to feed the CRM. Phone first, everything else optional.
create table pos.customers (
  id                 uuid primary key default gen_random_uuid(),
  phone              text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),    -- e.g. +2348031234567
  name               text,
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  heard_from         text check (heard_from in ('instagram','facebook','tiktok','whatsapp','google',
                                                'referral','walked_past','returning','other')),
  consent_receipts   boolean not null default true,    -- receipts by WhatsApp / email
  consent_marketing  boolean not null default false,   -- offers and follow-ups
  consent_ads        boolean not null default false,   -- may be included in ad audiences
  consent_updated_at timestamptz,
  company_name       text,                             -- business buyers
  industry           text,
  profile_id         uuid references public.profiles(id) on delete set null,   -- website account
  legacy_contact_id  text unique,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index customers_name_idx on pos.customers (lower(name));

-- 5. Payments are a method (cash, transfer, card, online) plus the account the money went into.
--    Accounts are the banks and providers in use right now; the owner can add or retire them.
create table pos.payment_accounts (
  id              smallint generated always as identity primary key,
  name            text not null unique,
  accepts_transfer boolean not null default true,
  accepts_card    boolean not null default true,
  accepts_online  boolean not null default false,
  is_active       boolean not null default true,
  sort            smallint not null default 0
);

insert into pos.payment_accounts (name, accepts_transfer, accepts_card, accepts_online, sort) values
  ('Nombank',  true,  true,  false, 1),
  ('OPay',     true,  true,  false, 2),
  ('Paystack', false, false, true,  3);

-- 6. Sales. A rep places the order; a cashier checks it out (or cancels it).
create sequence pos.receipt_seq;

create table pos.sales (
  id                uuid primary key default gen_random_uuid(),
  receipt_no        text not null unique default ('JS-' || lpad(nextval('pos.receipt_seq')::text, 7, '0')),
  floor_id          smallint not null references pos.floors(id),
  status            text not null default 'placed' check (status in ('placed', 'paid', 'cancelled')),
  source            text not null default 'pos' check (source in ('pos', 'legacy', 'web')),
  customer_id       uuid references pos.customers(id),
  sold_by           uuid references auth.users(id),
  checked_out_by    uuid references auth.users(id),
  rep_note          text,                  -- note from the rep to the cashier
  receipt_note      text,                  -- the optional notes block on the receipt
  subtotal_kobo     bigint not null default 0 check (subtotal_kobo >= 0),
  discount_kobo     bigint not null default 0 check (discount_kobo >= 0),
  total_kobo        bigint not null default 0 check (total_kobo >= 0),
  placed_at         timestamptz not null default now(),
  hold_expires_at   timestamptz,           -- phones in the order are held until this time
  paid_at           timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      uuid references auth.users(id),
  cancel_reason     text,
  legacy_invoice_no text unique,
  check (total_kobo = subtotal_kobo - discount_kobo),
  check (status <> 'paid' or paid_at is not null),
  check (status <> 'paid' or source = 'legacy' or checked_out_by is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);
create index sales_floor_status_idx on pos.sales (floor_id, status, placed_at desc);
create index sales_customer_idx on pos.sales (customer_id);
create index sales_paid_at_idx on pos.sales (paid_at);

create table pos.sale_lines (
  id                 bigint generated always as identity primary key,
  sale_id            uuid not null references pos.sales(id) on delete cascade,
  item_id            bigint references pos.items(id),       -- empty only for old sales of removed products
  item_name          text not null,                         -- name at the time of sale
  unit_id            uuid references pos.phone_units(id),   -- the exact phone, if it has an IMEI
  floor_id           smallint not null references pos.floors(id),   -- stock comes from this floor
  qty                int not null check (qty > 0),
  unit_price_kobo    bigint not null check (unit_price_kobo >= 0),
  price_tier         text not null default 'retail' check (price_tier in ('retail', 'wholesale')),
  unit_cost_kobo     bigint check (unit_cost_kobo >= 0),    -- captured at sale time, for profit
  line_discount_kobo bigint not null default 0 check (line_discount_kobo >= 0),
  removed_at         timestamptz,                           -- cashier removed a wrong item
  removed_by         uuid references auth.users(id),
  removed_reason     text,
  check (unit_id is null or qty = 1)
);
create index sale_lines_sale_idx on pos.sale_lines (sale_id);
create index sale_lines_unit_idx on pos.sale_lines (unit_id);
create index sale_lines_item_idx on pos.sale_lines (item_id);

create table pos.sale_payments (
  id          bigint generated always as identity primary key,
  sale_id     uuid not null references pos.sales(id),
  method      text not null check (method in ('cash', 'transfer', 'card', 'online')),
  account_id  smallint references pos.payment_accounts(id),   -- which bank or provider; empty for cash
  amount_kobo bigint not null check (amount_kobo > 0),
  reference   text,                         -- transfer or card reference
  received_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index sale_payments_sale_idx on pos.sale_payments (sale_id);

-- 7. Returns of paid sales.
create table pos.returns (
  id                 uuid primary key default gen_random_uuid(),
  sale_id            uuid not null references pos.sales(id),
  reason             text not null,
  refund_method      text check (refund_method in ('cash', 'transfer', 'card', 'online')),
  refund_account_id  smallint references pos.payment_accounts(id),
  refund_kobo        bigint not null default 0 check (refund_kobo >= 0),
  processed_by       uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  legacy_id          text unique
);

create table pos.return_lines (
  id           bigint generated always as identity primary key,
  return_id    uuid not null references pos.returns(id) on delete cascade,
  sale_line_id bigint not null references pos.sale_lines(id),
  qty          int not null check (qty > 0),
  outcome      text not null check (outcome in ('back_in_stock', 'faulty'))   -- faulty items don't go back on sale
);

-- 8. Audit log: discounts over the limit, refunds, overrides, permission changes, corrections.
create table pos.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor_id  uuid references auth.users(id),
  action    text not null,
  entity    text,
  entity_id text,
  detail    jsonb
);
create index audit_log_at_idx on pos.audit_log (at desc);

create trigger audit_log_append_only
before update or delete on pos.audit_log
for each row execute function pos.block_changes();

create trigger staff_touch before update on pos.staff
for each row execute function pos.touch_updated_at();
create trigger customers_touch before update on pos.customers
for each row execute function pos.touch_updated_at();

-- 9. Locked down, as before: row-level security on, server key only. Staff access comes
--    through the POS actions in the next step.
alter table pos.permissions                enable row level security;
alter table pos.roles                      enable row level security;
alter table pos.role_permissions           enable row level security;
alter table pos.staff                      enable row level security;
alter table pos.staff_permission_overrides enable row level security;
alter table pos.customers                  enable row level security;
alter table pos.payment_accounts           enable row level security;
alter table pos.sales                      enable row level security;
alter table pos.sale_lines                 enable row level security;
alter table pos.sale_payments              enable row level security;
alter table pos.returns                    enable row level security;
alter table pos.return_lines               enable row level security;
alter table pos.audit_log                  enable row level security;

grant select, insert, update, delete on all tables in schema pos to service_role;
grant usage, select on all sequences in schema pos to service_role;
revoke update, delete on pos.stock_movements, pos.audit_log from service_role;
revoke execute on function pos.has_permission(text) from public, anon;
