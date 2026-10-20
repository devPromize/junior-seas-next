-- POS step 1: floors, catalogue, phone units (IMEIs) and the stock ledger.
-- Lives in its own "pos" schema, which the website and public API can't reach.
-- Money is stored in kobo (naira x 100), like the rest of the platform.

create schema pos;
revoke all on schema pos from public, anon, authenticated;
grant usage on schema pos to service_role;

-- Floors: where stock sits and where sales happen, inside a branch.
create table pos.floors (
  id                  smallint generated always as identity primary key,
  location_id         uuid not null references public.locations(id),
  code                text not null unique,                     -- 'ground', 'first', 'second'
  name                text not null,
  legacy_location_ids int[] not null default '{}',              -- old system's location ids
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

insert into pos.floors (location_id, code, name, legacy_location_ids)
select l.id, f.code, f.name, f.legacy
from public.locations l
cross join (values
  ('ground', 'Ground floor · Accessories',        array[1, 4]),
  ('first',  'First floor · Phones',              array[5]),
  ('second', 'Second floor · Screens & repairs',  array[2])
) as f(code, name, legacy)
where l.slug = 'owerri';

-- Categories used in the shop (separate from the website's marketing categories).
create table pos.categories (
  id            bigint generated always as identity primary key,
  name          text not null,
  parent_id     bigint references pos.categories(id),
  warranty_days int,                                              -- default warranty for items in it
  created_at    timestamptz not null default now(),
  unique (parent_id, name)
);

create table pos.brands (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Items: every product the shop sells. A phone model is one item; its physical
-- phones are rows in phone_units.
create table pos.items (
  id                bigint generated always as identity primary key,
  sku               text not null unique,                        -- barcode / product code
  name              text not null,
  category_id       bigint references pos.categories(id),
  brand_id          bigint references pos.brands(id),
  unit              text not null default 'piece',
  cost_kobo         bigint not null default 0 check (cost_kobo >= 0),
  price_kobo        bigint not null default 0 check (price_kobo >= 0),
  min_price_kobo    bigint check (min_price_kobo >= 0),           -- below this needs a manager
  tracks_imei       boolean not null default false,
  show_online       boolean not null default false,              -- appears on the website
  web_product_id    bigint references public.products(id) on delete set null,
  warranty_days     int,                                         -- overrides the category default
  is_active         boolean not null default true,
  legacy_product_id int unique,                                  -- old system's product id
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index items_category_idx on pos.items (category_id);
create index items_name_idx on pos.items (lower(name));

-- One row per physical phone.
create table pos.phone_units (
  id                  uuid primary key default gen_random_uuid(),
  item_id             bigint not null references pos.items(id),
  floor_id            smallint not null references pos.floors(id),
  status              text not null default 'in_stock'
                      check (status in ('in_stock', 'held', 'sold', 'returned', 'faulty', 'transferred_out')),
  cost_kobo           bigint check (cost_kobo >= 0),
  received_at         timestamptz,
  legacy_variation_id int unique,                                -- old system's variation id
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index phone_units_item_status_idx on pos.phone_units (item_id, status);

-- Every IMEI, globally unique, so the same IMEI can never be on two phones
-- (whether it's a phone's first or second SIM slot).
create table pos.phone_unit_imeis (
  imei    text primary key check (imei ~ '^[0-9]{14,17}$'),
  unit_id uuid not null references pos.phone_units(id) on delete cascade,
  slot    smallint not null check (slot in (1, 2)),
  unique (unit_id, slot)
);

-- The stock ledger: every change to stock is one row. Never edited, never deleted.
create table pos.stock_movements (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references pos.items(id),
  floor_id    smallint not null references pos.floors(id),
  qty_change  int not null check (qty_change <> 0),
  reason      text not null check (reason in (
                'opening', 'sale', 'sale_cancelled', 'return', 'purchase',
                'transfer_out', 'adjustment', 'repair_part', 'online_order')),
  unit_id     uuid references pos.phone_units(id),
  ref_type    text,                                              -- e.g. 'sale', 'purchase'
  ref_id      text,
  note        text,
  actor_id    uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index stock_movements_item_floor_idx on pos.stock_movements (item_id, floor_id);

-- Current stock per item per floor, kept up to date from the ledger automatically.
create table pos.stock_levels (
  item_id    bigint not null references pos.items(id),
  floor_id   smallint not null references pos.floors(id),
  quantity   int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (item_id, floor_id)
);

create function pos.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into pos.stock_levels (item_id, floor_id, quantity, updated_at)
  values (new.item_id, new.floor_id, new.qty_change, now())
  on conflict (item_id, floor_id)
  do update set quantity = pos.stock_levels.quantity + excluded.quantity, updated_at = now();
  return new;
end $$;

create trigger stock_movements_apply
after insert on pos.stock_movements
for each row execute function pos.apply_stock_movement();

-- The ledger is append-only: block edits and deletes outright.
create function pos.block_ledger_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Stock movements cannot be changed or deleted. Record a correcting movement instead.';
end $$;

create trigger stock_movements_append_only
before update or delete on pos.stock_movements
for each row execute function pos.block_ledger_changes();

-- Keep updated_at honest.
create function pos.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger items_touch before update on pos.items
for each row execute function pos.touch_updated_at();
create trigger phone_units_touch before update on pos.phone_units
for each row execute function pos.touch_updated_at();

-- Locked down: row-level security on everything, and only the server key has access for now.
-- Staff access (by role and floor) arrives with the staff & permissions step.
alter table pos.floors           enable row level security;
alter table pos.categories       enable row level security;
alter table pos.brands           enable row level security;
alter table pos.items            enable row level security;
alter table pos.phone_units      enable row level security;
alter table pos.phone_unit_imeis enable row level security;
alter table pos.stock_movements  enable row level security;
alter table pos.stock_levels     enable row level security;

grant select, insert, update, delete on all tables in schema pos to service_role;
grant usage, select on all sequences in schema pos to service_role;
revoke update, delete on pos.stock_movements from service_role;
