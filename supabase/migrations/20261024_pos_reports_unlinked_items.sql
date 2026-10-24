-- Reports fix (D-043): 832 old-system sale lines are for products that were deleted in the old
-- system, so they have no product here. The first version of the report dropped them (about 4.5%
-- of sales value). They now count, under the name printed on the sale, with no cost.

drop function pos.report_lines(timestamptz, timestamptz, smallint[]);
create function pos.report_lines(p_start timestamptz, p_end timestamptz, p_deps smallint[])
returns table (sale_id uuid, local_at timestamp, source text, floor_id smallint, item_id bigint, item_name text,
               qty integer, net_kobo bigint, cost_kobo bigint, cost_estimated boolean, seller text, category_id bigint)
language sql stable security definer set search_path = '' as $$
  select s.id, s.paid_at at time zone 'Africa/Lagos', s.source, l.floor_id, l.item_id,
         coalesce(i.name, nullif(trim(l.item_name), ''), 'Unnamed item'), l.qty,
         l.qty * l.unit_price_kobo - coalesce(l.line_discount_kobo, 0),
         coalesce(l.unit_cost_kobo, u.cost_kobo, i.cost_kobo) * l.qty,
         l.unit_cost_kobo is null and u.cost_kobo is null,
         coalesce(st.display_name, initcap(nullif(trim(s.sold_by_name), '')), 'Not recorded'),
         coalesce(c.parent_id, c.id)
  from pos.sales s
  join pos.sale_lines l on l.sale_id = s.id and l.removed_at is null
  left join pos.items i on i.id = l.item_id
  left join pos.phone_units u on u.id = l.unit_id
  left join pos.staff st on st.user_id = s.sold_by
  left join pos.categories c on c.id = i.category_id
  where s.status = 'paid' and not s.is_branch_transfer
    and s.paid_at >= p_start and s.paid_at < p_end
    and l.floor_id = any(p_deps);
$$;
revoke execute on function pos.report_lines(timestamptz, timestamptz, smallint[]) from public, anon, authenticated;

-- The product ranking groups deleted old-system products by the name on the sale.
create or replace function public.pos_report(p_from date, p_to date, p_department smallint default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user  uuid := pos.require_permission('reports.view');
  v_mine  smallint[] := pos.user_departments(v_user);
  v_deps  smallint[];
  v_costs boolean := pos.has_permission('costs.view');
  v_days  int;
  v_start timestamptz;
  v_end   timestamptz;
  v_grain text;
  v_all   boolean;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a start date on or before the end date.' using hint = 'bad_range';
  end if;
  if p_department is not null and not (p_department = any(v_mine)) then
    raise exception 'You don''t have access to that department.' using hint = 'no_department_access';
  end if;
  v_deps := case when p_department is null then v_mine else array[p_department] end;
  -- Payment methods can't be split by department, so they're shown only for the whole shop.
  v_all := p_department is null and not exists (select 1 from pos.floors f where f.is_active and not (f.id = any(v_mine)));
  v_days := p_to - p_from + 1;
  v_start := p_from::timestamp at time zone 'Africa/Lagos';
  v_end := (p_to + 1)::timestamp at time zone 'Africa/Lagos';
  v_grain := case when v_days <= 62 then 'day' else 'month' end;

  return (
    with l as materialized (select * from pos.report_lines(v_start, v_end, v_deps))
    select jsonb_build_object(
      'from', p_from, 'to', p_to, 'days', v_days, 'grain', v_grain, 'costs', v_costs,
      'departments', (select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.id)
                      from pos.floors f where f.id = any(v_mine)),
      'summary', pos.report_summary(v_start, v_end, v_deps, v_costs),
      'previous', pos.report_summary(v_start - make_interval(days => v_days), v_start, v_deps, v_costs),
      'by_period', coalesce((select jsonb_agg(jsonb_build_object('period', p, 'net_kobo', net, 'sales', n,
                                'profit_kobo', case when v_costs then profit end) order by p)
                             from (select date_trunc(v_grain, local_at)::date p, sum(net_kobo) net, count(distinct sale_id) n,
                                          sum(net_kobo - cost_kobo) filter (where cost_kobo is not null) profit
                                   from l group by 1) x), '[]'::jsonb),
      'by_department', coalesce((select jsonb_agg(jsonb_build_object('name', f.name, 'net_kobo', net, 'sales', n, 'items', q,
                                    'profit_kobo', case when v_costs then profit end) order by net desc)
                                 from (select floor_id, sum(net_kobo) net, count(distinct sale_id) n, sum(qty) q,
                                              sum(net_kobo - cost_kobo) filter (where cost_kobo is not null) profit
                                       from l group by 1) x join pos.floors f on f.id = x.floor_id), '[]'::jsonb),
      'by_staff', coalesce((select jsonb_agg(jsonb_build_object('name', seller, 'net_kobo', net, 'sales', n,
                               'avg_sale_kobo', round(net::numeric / n), 'profit_kobo', case when v_costs then profit end) order by net desc)
                            from (select seller, sum(net_kobo) net, count(distinct sale_id) n,
                                         sum(net_kobo - cost_kobo) filter (where cost_kobo is not null) profit
                                  from l group by 1) x), '[]'::jsonb),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(c.name, 'No category'), 'net_kobo', net, 'items', q,
                                  'profit_kobo', case when v_costs then profit end) order by net desc)
                               from (select category_id, sum(net_kobo) net, sum(qty) q,
                                            sum(net_kobo - cost_kobo) filter (where cost_kobo is not null) profit
                                     from l group by 1) x left join pos.categories c on c.id = x.category_id), '[]'::jsonb),
      'top_products', coalesce((select jsonb_agg(jsonb_build_object('id', item_id, 'name', item_name, 'net_kobo', net, 'items', q,
                                   'profit_kobo', case when v_costs then profit end,
                                   'margin_pct', case when v_costs and net_costed > 0 then round(100.0 * profit / net_costed, 1) end) order by net desc)
                                from (select item_id, item_name, sum(net_kobo) net, sum(qty) q,
                                             sum(net_kobo - cost_kobo) filter (where cost_kobo is not null) profit,
                                             sum(net_kobo) filter (where cost_kobo is not null) net_costed
                                      from l group by 1, 2 order by 3 desc limit 25) x), '[]'::jsonb),
      'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'net_kobo', net, 'sales', n) order by h)
                           from (select extract(hour from local_at)::int h, sum(net_kobo) net, count(distinct sale_id) n
                                 from l group by 1) x), '[]'::jsonb),
      'by_payment', case when v_all then coalesce((
                      select jsonb_agg(jsonb_build_object('method', method, 'account', account, 'amount_kobo', amount, 'payments', n) order by amount desc)
                      from (select p.method, a.name account, sum(p.amount_kobo) amount, count(*) n
                            from pos.sale_payments p join pos.sales s on s.id = p.sale_id
                            left join pos.payment_accounts a on a.id = p.account_id
                            where s.status = 'paid' and not s.is_branch_transfer and s.paid_at >= v_start and s.paid_at < v_end
                            group by 1, 2) x), '[]'::jsonb) end
    )
  );
end $$;
