-- POS step 13: Customers (D-039).
--
-- A customer list you can act on: who buys, how much, when they were last in, which phones they
-- own (and so who's due an upgrade), and whether they've agreed to hear from us. Each customer has
-- a page with their history, devices, staff notes and their consents. Exports are CRM-ready
-- (HubSpot column names), limited to people allowed to export, and logged, because customer
-- lists are personal data under Nigeria's Data Protection Act.

insert into pos.permissions (code, label, warning, is_sensitive) values
  ('customers.manage', 'See and edit customers',
   'They will see every customer''s phone number, email and what they''ve bought.', true)
on conflict (code) do nothing;
insert into pos.role_permissions (role_id, permission_code)
select id, 'customers.manage' from pos.roles where name = 'Manager'
on conflict do nothing;
update pos.permissions set warning = 'Customer lists contain personal details protected by Nigerian data protection law. Every export is logged.'
where code = 'customers.export';

insert into pos.settings (key, value) values ('upgrade_after_months', '12'), ('lapsed_after_days', '90')
on conflict (key) do nothing;

create table pos.customer_notes (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references pos.customers(id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);
create index customer_notes_customer_idx on pos.customer_notes (customer_id, created_at desc);
alter table pos.customer_notes enable row level security;
create index if not exists sales_customer_idx on pos.sales (customer_id) where customer_id is not null;

-- Each customer's buying, worked out from real sales (not branch transfers or cancelled orders),
-- after refunds.
create view pos.customer_stats as
select c.id as customer_id,
       count(s.id) as purchases,
       coalesce(sum(s.total_kobo - coalesce(r.refunded, 0)), 0) as spent_kobo,
       min(s.paid_at) as first_at,
       max(s.paid_at) as last_at,
       (select count(*) from pos.sale_lines l join pos.sales s2 on s2.id = l.sale_id
        where s2.customer_id = c.id and s2.status = 'paid' and l.unit_id is not null) as phones,
       (select max(s2.paid_at) from pos.sale_lines l join pos.sales s2 on s2.id = l.sale_id
        where s2.customer_id = c.id and s2.status = 'paid' and l.unit_id is not null) as last_phone_at
from pos.customers c
left join pos.sales s on s.customer_id = c.id and s.status = 'paid' and not s.is_branch_transfer
left join lateral (select sum(refund_kobo) as refunded from pos.returns rt where rt.sale_id = s.id) r on true
group by c.id;

-- Segments: everyone, bought a phone, due for an upgrade, haven't been back, best customers,
-- agreed to offers, businesses.
create function pos.customer_in_segment(p_segment text, c pos.customers, st pos.customer_stats) returns boolean
language sql stable set search_path = '' as $$
  select case coalesce(p_segment, 'all')
    when 'all' then true
    when 'phone_buyers' then st.phones > 0
    when 'upgrade_due' then st.last_phone_at < now() - make_interval(months =>
                              coalesce((select (value #>> '{}')::int from pos.settings where key = 'upgrade_after_months'), 12))
    when 'lapsed' then st.last_at < now() - make_interval(days =>
                              coalesce((select (value #>> '{}')::int from pos.settings where key = 'lapsed_after_days'), 90))
    when 'top' then st.spent_kobo > 0
    when 'marketing' then c.consent_marketing
    when 'business' then c.company_name is not null
    else true end;
$$;

create function public.pos_customers(
  p_search  text default null,
  p_segment text default 'all',
  p_limit   int default 50,
  p_offset  int default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q     text := lower(trim(coalesce(p_search, '')));
  v_phone text := pos.normalize_phone(p_search);
begin
  perform pos.require_permission('customers.manage');
  return (
    with matches as (
      select c.*, st.purchases, st.spent_kobo, st.first_at, st.last_at, st.phones, st.last_phone_at
      from pos.customers c join pos.customer_stats st on st.customer_id = c.id
      where pos.customer_in_segment(p_segment, c, st)
        and (v_q = '' or lower(c.name) like '%' || v_q || '%' or c.phone = v_phone
             or lower(coalesce(c.email, '')) like '%' || v_q || '%' or lower(coalesce(c.company_name, '')) like '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from matches),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'name', m.name, 'phone', m.phone, 'email', m.email, 'company', m.company_name,
                 'purchases', m.purchases, 'spent_kobo', m.spent_kobo, 'last_at', m.last_at, 'phones', m.phones,
                 'last_phone_at', m.last_phone_at, 'marketing', m.consent_marketing, 'from_old_system', m.legacy_contact_id is not null))
               from (select * from matches
                     -- best customers by spend; everyone else by most recent visit
                     order by case when p_segment = 'top' then spent_kobo end desc nulls last, last_at desc nulls last, name
                     limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)) m), '[]'::jsonb)
    )
  );
end $$;

-- One customer: details, buying, devices, history and notes.
create function public.pos_customer(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c  pos.customers;
  v_st pos.customer_stats;
begin
  perform pos.require_permission('customers.manage');
  select * into v_c from pos.customers where id = p_id;
  if not found then
    raise exception 'Customer not found.' using hint = 'not_found';
  end if;
  select * into v_st from pos.customer_stats where customer_id = p_id;
  return jsonb_build_object(
    'id', v_c.id, 'name', v_c.name, 'phone', v_c.phone, 'email', v_c.email, 'company', v_c.company_name,
    'industry', v_c.industry, 'heard_from', v_c.heard_from,
    'consent_receipts', v_c.consent_receipts, 'consent_marketing', v_c.consent_marketing, 'consent_ads', v_c.consent_ads,
    'consent_updated_at', v_c.consent_updated_at, 'created_at', v_c.created_at, 'from_old_system', v_c.legacy_contact_id is not null,
    'purchases', v_st.purchases, 'spent_kobo', v_st.spent_kobo, 'first_at', v_st.first_at, 'last_at', v_st.last_at,
    'devices', coalesce((select jsonb_agg(jsonb_build_object(
                  'name', l.item_name, 'codes', (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = l.unit_id),
                  'bought_at', s.paid_at, 'sale_id', s.id, 'receipt_no', s.receipt_no,
                  'returned', exists (select 1 from pos.return_lines rl where rl.sale_line_id = l.id)) order by s.paid_at desc)
                from pos.sale_lines l join pos.sales s on s.id = l.sale_id
                where s.customer_id = p_id and s.status = 'paid' and l.unit_id is not null), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', s.id, 'receipt_no', s.receipt_no, 'at', s.paid_at, 'total_kobo', s.total_kobo,
                  'items', (select string_agg(l.item_name, ', ' order by l.id) from pos.sale_lines l where l.sale_id = s.id and l.removed_at is null),
                  'refunded_kobo', coalesce((select sum(refund_kobo) from pos.returns rt where rt.sale_id = s.id), 0)) order by s.paid_at desc)
                from (select * from pos.sales where customer_id = p_id and status = 'paid' and not is_branch_transfer
                      order by paid_at desc limit 100) s), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'at', n.created_at,
                          'by', (select display_name from pos.staff where user_id = n.created_by)) order by n.created_at desc)
                       from pos.customer_notes n where n.customer_id = p_id), '[]'::jsonb)
  );
end $$;

-- Edit a customer. Only fields present change; consent changes are timestamped and logged.
create function public.pos_update_customer(p_id uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_permission('customers.manage');
  v_old   pos.customers;
  v_new   pos.customers;
  v_phone text;
  v_changed jsonb := '{}';
  v_key   text;
begin
  select * into v_old from pos.customers where id = p_id for update;
  if not found then
    raise exception 'Customer not found.' using hint = 'not_found';
  end if;
  v_new := v_old;

  if p_fields ? 'name' then v_new.name := nullif(trim(p_fields->>'name'), ''); end if;
  if p_fields ? 'phone' then
    v_phone := pos.normalize_phone(p_fields->>'phone');
    if nullif(trim(p_fields->>'phone'), '') is not null and v_phone is null then
      raise exception 'That phone number doesn''t look right. Check it and try again.' using hint = 'bad_phone';
    end if;
    v_new.phone := v_phone;
  end if;
  if p_fields ? 'email' then v_new.email := nullif(lower(trim(p_fields->>'email')), ''); end if;
  if p_fields ? 'company' then v_new.company_name := nullif(trim(p_fields->>'company'), ''); end if;
  if p_fields ? 'industry' then v_new.industry := nullif(trim(p_fields->>'industry'), ''); end if;
  if p_fields ? 'heard_from' then v_new.heard_from := nullif(p_fields->>'heard_from', ''); end if;
  if p_fields ? 'consent_receipts' then v_new.consent_receipts := (p_fields->>'consent_receipts')::boolean; end if;
  if p_fields ? 'consent_marketing' then v_new.consent_marketing := (p_fields->>'consent_marketing')::boolean; end if;
  if p_fields ? 'consent_ads' then v_new.consent_ads := (p_fields->>'consent_ads')::boolean; end if;

  if v_new.name is null then
    raise exception 'A customer needs a name.' using hint = 'name_required';
  end if;
  if v_new.email is not null and v_new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.' using hint = 'bad_email';
  end if;
  if v_new.phone is not null and exists (select 1 from pos.customers where phone = v_new.phone and id <> p_id) then
    raise exception 'Another customer already has the number %: %.', v_new.phone,
      (select name from pos.customers where phone = v_new.phone and id <> p_id) using hint = 'duplicate_phone';
  end if;

  for v_key in select unnest(array['name', 'phone', 'email', 'company_name', 'industry', 'heard_from',
                                   'consent_receipts', 'consent_marketing', 'consent_ads']) loop
    if to_jsonb(v_new)->v_key is distinct from to_jsonb(v_old)->v_key then
      v_changed := v_changed || jsonb_build_object(v_key, jsonb_build_object('from', to_jsonb(v_old)->v_key, 'to', to_jsonb(v_new)->v_key));
    end if;
  end loop;
  if v_changed = '{}' then
    return jsonb_build_object('id', p_id, 'changed', false);
  end if;

  update pos.customers set name = v_new.name, phone = v_new.phone, email = v_new.email, company_name = v_new.company_name,
    industry = v_new.industry, heard_from = v_new.heard_from, consent_receipts = v_new.consent_receipts,
    consent_marketing = v_new.consent_marketing, consent_ads = v_new.consent_ads,
    consent_updated_at = case when v_changed ?| array['consent_receipts', 'consent_marketing', 'consent_ads'] then now() else consent_updated_at end
  where id = p_id;
  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'customer_updated', 'customer', p_id::text, v_changed);
  return jsonb_build_object('id', p_id, 'changed', true);
end $$;

create function public.pos_add_customer_note(p_customer_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('customers.manage');
  v_id   bigint;
begin
  if nullif(trim(p_body), '') is null then
    raise exception 'Write the note first.' using hint = 'empty_note';
  end if;
  insert into pos.customer_notes (customer_id, body, created_by) values (p_customer_id, trim(p_body), v_user) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- A segment of customers for a CRM such as HubSpot. Logged: who exported what, how many.
-- p_marketing_only: only people who agreed to offers (the default, and the right choice for
-- anything promotional).
create function public.pos_export_customers(p_segment text default 'all', p_marketing_only boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_permission('customers.export');
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'First Name', split_part(c.name, ' ', 1),
           'Last Name', nullif(substr(c.name, length(split_part(c.name, ' ', 1)) + 2), ''),
           'Phone Number', c.phone, 'Email', c.email, 'Company Name', c.company_name, 'Industry', c.industry,
           'Lead Source', c.heard_from,
           'Marketing Consent', case when c.consent_marketing then 'Yes' else 'No' end,
           'Ads Consent', case when c.consent_ads then 'Yes' else 'No' end,
           'Consent Updated', c.consent_updated_at,
           'Purchases', st.purchases, 'Total Spent (NGN)', round(st.spent_kobo / 100.0, 2),
           'First Purchase', st.first_at, 'Last Purchase', st.last_at,
           'Phones Bought', st.phones, 'Last Phone Purchase', st.last_phone_at) order by c.name), '[]'::jsonb)
  into v_rows
  from pos.customers c join pos.customer_stats st on st.customer_id = c.id
  where pos.customer_in_segment(p_segment, c, st) and (not p_marketing_only or c.consent_marketing);

  insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_user, 'customers_exported', 'customer', 'segment:' || coalesce(p_segment, 'all'),
          jsonb_build_object('segment', p_segment, 'marketing_only', p_marketing_only, 'rows', jsonb_array_length(v_rows)));
  return v_rows;
end $$;

revoke execute on function pos.customer_in_segment(text, pos.customers, pos.customer_stats) from public, anon;
revoke all on pos.customer_stats from public, anon, authenticated;
revoke execute on function
  public.pos_customers(text, text, int, int), public.pos_customer(uuid), public.pos_update_customer(uuid, jsonb),
  public.pos_add_customer_note(uuid, text), public.pos_export_customers(text, boolean)
from public, anon;
grant execute on function
  public.pos_customers(text, text, int, int), public.pos_customer(uuid), public.pos_update_customer(uuid, jsonb),
  public.pos_add_customer_note(uuid, text), public.pos_export_customers(text, boolean)
to authenticated;
