-- POS step 8: checkout from the queue, and the receipt.
--
-- The checkout logic itself (payments must add up, stock, discounts, alerts) is pos.checkout
-- from step 4. This adds the department check, the receipt, and the business details printed
-- on it (editable later in Settings).

insert into pos.settings (key, value) values
  ('business', jsonb_build_object(
     'name', 'Junior Seas Tech',
     'address', '20 Urata/Mann Street, off Wetheral Road, Owerri, Imo State',
     'phones', '0803 505 7225 · 0810 616 5292',
     'receipt_footer', 'Thank you for shopping with us.'))
on conflict (key) do nothing;

-- A cashier checks out orders that include their departments (the same orders their queue shows).
create or replace function public.pos_checkout(
  p_sale_id uuid, p_payments jsonb, p_discount_kobo bigint default 0,
  p_receipt_note text default null, p_customer_id uuid default null, p_authorised_by uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pos.sale_lines l
                 where l.sale_id = p_sale_id and l.removed_at is null
                   and l.floor_id = any(pos.user_departments(pos.require_permission('sales.checkout')))) then
    raise exception 'This order has no items from your departments.' using hint = 'no_department_access';
  end if;
  return pos.checkout(p_sale_id, p_payments, p_discount_kobo, p_receipt_note, p_customer_id, p_authorised_by);
end $$;

-- Everything printed on a receipt. One receipt per order, whichever departments the items came
-- from. Anyone who sold it, or can see one of its departments, can open it.
create function public.pos_receipt(p_sale_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := pos.require_staff();
  v_sale pos.sales;
begin
  select * into v_sale from pos.sales where id = p_sale_id;
  if not found then
    raise exception 'Receipt not found.' using hint = 'not_found';
  end if;
  if v_sale.sold_by <> v_user and not exists (
       select 1 from pos.sale_lines l where l.sale_id = p_sale_id and l.floor_id = any(pos.user_departments(v_user))) then
    raise exception 'You don''t have access to this receipt.' using hint = 'not_allowed';
  end if;

  return jsonb_build_object(
    'business', (select value from pos.settings where key = 'business'),
    'sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'status', v_sale.status,
    'placed_at', v_sale.placed_at, 'paid_at', v_sale.paid_at,
    'sold_by', (select display_name from pos.staff where user_id = v_sale.sold_by),
    'checked_out_by', (select display_name from pos.staff where user_id = v_sale.checked_out_by),
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone) from pos.customers c where c.id = v_sale.customer_id),
    'lines', (select jsonb_agg(jsonb_build_object(
                'name', l.item_name, 'qty', l.qty, 'unit_price_kobo', l.unit_price_kobo,
                'discount_kobo', coalesce(l.line_discount_kobo, 0), 'price_tier', l.price_tier,
                'codes', (select jsonb_agg(ui.code order by ui.slot) from pos.unit_identifiers ui where ui.unit_id = l.unit_id),
                'warranty_days', i.warranty_days) order by l.id)
              from pos.sale_lines l join pos.items i on i.id = l.item_id
              where l.sale_id = p_sale_id and l.removed_at is null),
    'subtotal_kobo', v_sale.subtotal_kobo, 'discount_kobo', v_sale.discount_kobo, 'total_kobo', v_sale.total_kobo,
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                  'method', p.method, 'account', a.name, 'amount_kobo', p.amount_kobo) order by p.id)
                from pos.sale_payments p left join pos.payment_accounts a on a.id = p.account_id
                where p.sale_id = p_sale_id), '[]'::jsonb),
    'note', v_sale.receipt_note
  );
end $$;

revoke execute on function public.pos_receipt(uuid) from public, anon;
grant execute on function public.pos_receipt(uuid) to authenticated;
