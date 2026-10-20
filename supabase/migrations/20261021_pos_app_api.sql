-- POS step 5: customer capture rules, and the entry points the POS app calls.
--
-- The pos schema stays unreachable from the public API. The POS app talks to the database only
-- through the public.pos_* functions below. Each one checks that the caller is active staff
-- (and has the right permission) before doing anything. Website customers who call them get
-- "not staff" and nothing else.

-- ---------- customer capture ----------

-- A customer record always has a name when it has a phone number.
alter table pos.customers add constraint customers_name_with_phone
  check (phone is null or nullif(trim(name), '') is not null);

-- "Customer declined to give details" is recorded on the sale, so reports can show it per rep.
alter table pos.sales add column customer_declined boolean not null default false;

-- Turns "0803 123 4567", "08031234567", "2348031234567" or "+234 803 123 4567" into
-- "+2348031234567". Returns null if it isn't a usable number.
create function pos.normalize_phone(p_phone text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if d = '' then return null; end if;
  if left(trim(p_phone), 1) = '+' and length(d) between 8 and 15 then
    return '+' || d;                                         -- already international
  elsif length(d) = 11 and left(d, 1) = '0' then
    return '+234' || substr(d, 2);                           -- 0803 123 4567
  elsif length(d) = 13 and left(d, 3) = '234' then
    return '+' || d;                                         -- 2348031234567
  elsif length(d) = 10 and left(d, 1) in ('7', '8', '9') then
    return '+234' || d;                                      -- 803 123 4567
  end if;
  return null;
end $$;

-- Any active staff member (any role) may use the POS.
create function pos.require_staff() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using hint = 'not_signed_in';
  end if;
  if not exists (select 1 from pos.staff where user_id = auth.uid() and is_active) then
    raise exception 'This account isn''t set up as staff. Ask the owner to add you.' using hint = 'not_staff';
  end if;
  return auth.uid();
end $$;

-- ---------- entry points for the POS app ----------

-- Who am I, what can I do, and the lists every screen needs.
create function public.pos_me() returns jsonb
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
      'floors', (select jsonb_agg(jsonb_build_object('id', f.id, 'code', f.code, 'name', f.name) order by f.id)
                 from pos.floors f where f.is_active),
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

-- Everything the till needs to search and scan instantly, loaded once and kept on the device.
create function public.pos_catalogue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_staff();
  return jsonb_build_object(
    'loaded_at', now(),
    'items', (select coalesce(jsonb_agg(jsonb_build_array(
                i.id, i.sku, i.name, i.price_kobo, i.wholesale_price_kobo, i.tracks_imei,
                coalesce(c.name, ''), coalesce(b.name, ''))), '[]'::jsonb)
              from pos.items i
              left join pos.categories c on c.id = i.category_id
              left join pos.brands b on b.id = i.brand_id
              where i.is_active),
    'stock', (select coalesce(jsonb_agg(jsonb_build_array(l.item_id, l.floor_id, l.quantity)), '[]'::jsonb)
              from pos.stock_levels l join pos.items i on i.id = l.item_id
              where i.is_active and l.quantity <> 0),
    'units', (select coalesce(jsonb_agg(jsonb_build_array(u.id, u.item_id, u.floor_id, u.status,
                (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = u.id))), '[]'::jsonb)
              from pos.phone_units u
              where u.status in ('in_stock', 'held'))
  );
end $$;

-- Look a customer up by phone number (returns null if they're new).
create function public.pos_find_customer(p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text := pos.normalize_phone(p_phone);
begin
  perform pos.require_staff();
  if v_phone is null then return null; end if;
  return (select jsonb_build_object('id', c.id, 'phone', c.phone, 'name', c.name, 'email', c.email,
                                    'consent_marketing', c.consent_marketing,
                                    'purchases', (select count(*) from pos.sales s where s.customer_id = c.id and s.status = 'paid'))
          from pos.customers c where c.phone = v_phone);
end $$;

-- Create the customer, or update them if the phone number already exists. Phone and name required.
create function public.pos_save_customer(
  p_phone             text,
  p_name              text,
  p_email             text default null,
  p_heard_from        text default null,
  p_consent_marketing boolean default false,
  p_consent_ads       boolean default false,
  p_company_name      text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_permission('sales.create');
  v_phone text := pos.normalize_phone(p_phone);
  v_id    uuid;
begin
  if v_phone is null then
    raise exception 'That phone number doesn''t look right. Check it and try again.' using hint = 'bad_phone';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Add the customer''s name.' using hint = 'name_required';
  end if;
  insert into pos.customers (phone, name, email, heard_from, consent_marketing, consent_ads,
                             consent_updated_at, company_name, created_by)
  values (v_phone, trim(p_name), nullif(trim(lower(p_email)), ''), p_heard_from,
          coalesce(p_consent_marketing, false), coalesce(p_consent_ads, false), now(),
          nullif(trim(p_company_name), ''), v_user)
  on conflict (phone) do update set
    name               = excluded.name,
    email              = coalesce(excluded.email, pos.customers.email),
    heard_from         = coalesce(pos.customers.heard_from, excluded.heard_from),
    consent_marketing  = excluded.consent_marketing,
    consent_ads        = excluded.consent_ads,
    consent_updated_at = now(),
    company_name       = coalesce(excluded.company_name, pos.customers.company_name)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'phone', v_phone, 'name', trim(p_name));
end $$;

-- Place an order. Every order has a customer, or says the customer declined.
create function public.pos_place_order(
  p_floor_id              smallint,
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
  v_res := pos.place_order(p_floor_id, p_lines, p_customer_id, p_rep_note, p_discount_request_kobo);
  if p_customer_id is null then
    update pos.sales set customer_declined = true where id = (v_res->>'sale_id')::uuid;
  end if;
  return v_res;
end $$;

-- The cashier's queue: orders waiting on a floor, with their items.
create function public.pos_order_queue(p_floor_id smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform pos.require_permission('sales.checkout');
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
                  'price_tier', l.price_tier, 'floor_id', l.floor_id,
                  'imei', (select ui.code from pos.unit_identifiers ui where ui.unit_id = l.unit_id and ui.slot = 1))
                  order by l.id)
                from pos.sale_lines l where l.sale_id = s.id and l.removed_at is null)
    ) order by s.placed_at)
    from pos.sales s left join pos.customers c on c.id = s.customer_id
    where s.status = 'placed' and s.floor_id = p_floor_id
  ), '[]'::jsonb);
end $$;

create function public.pos_checkout(
  p_sale_id uuid, p_payments jsonb, p_discount_kobo bigint default 0,
  p_receipt_note text default null, p_customer_id uuid default null, p_authorised_by uuid default null
) returns jsonb
language sql security definer set search_path = '' as $$
  select pos.checkout(p_sale_id, p_payments, p_discount_kobo, p_receipt_note, p_customer_id, p_authorised_by);
$$;

create function public.pos_cancel_order(p_sale_id uuid, p_reason text) returns jsonb
language sql security definer set search_path = '' as $$
  select pos.cancel_order(p_sale_id, p_reason);
$$;

create function public.pos_remove_order_line(p_line_id bigint, p_reason text) returns jsonb
language sql security definer set search_path = '' as $$
  select pos.remove_order_line(p_line_id, p_reason);
$$;

create function public.pos_approve_discount_with_pin(p_sale_id uuid, p_approver_id uuid, p_pin text, p_amount_kobo bigint)
returns jsonb
language sql security definer set search_path = '' as $$
  select pos.approve_discount_with_pin(p_sale_id, p_approver_id, p_pin, p_amount_kobo);
$$;

create function public.pos_set_my_pin(p_pin text) returns void
language sql security definer set search_path = '' as $$
  select pos.set_my_pin(p_pin);
$$;

-- Only signed-in users can even reach these; each one then checks for staff and permissions.
revoke execute on function
  public.pos_me(), public.pos_catalogue(), public.pos_find_customer(text),
  public.pos_save_customer(text, text, text, text, boolean, boolean, text),
  public.pos_place_order(smallint, jsonb, uuid, boolean, text, bigint),
  public.pos_order_queue(smallint),
  public.pos_checkout(uuid, jsonb, bigint, text, uuid, uuid),
  public.pos_cancel_order(uuid, text), public.pos_remove_order_line(bigint, text),
  public.pos_approve_discount_with_pin(uuid, uuid, text, bigint), public.pos_set_my_pin(text)
from public, anon;
grant execute on function
  public.pos_me(), public.pos_catalogue(), public.pos_find_customer(text),
  public.pos_save_customer(text, text, text, text, boolean, boolean, text),
  public.pos_place_order(smallint, jsonb, uuid, boolean, text, bigint),
  public.pos_order_queue(smallint),
  public.pos_checkout(uuid, jsonb, bigint, text, uuid, uuid),
  public.pos_cancel_order(uuid, text), public.pos_remove_order_line(bigint, text),
  public.pos_approve_discount_with_pin(uuid, uuid, text, bigint), public.pos_set_my_pin(text)
to authenticated;
revoke execute on function pos.normalize_phone(text), pos.require_staff() from public, anon;
