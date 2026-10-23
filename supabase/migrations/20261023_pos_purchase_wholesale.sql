-- Purchases can set a new wholesale price per line, as well as the selling price. Needs
-- "Set wholesale prices"; must stay below the selling price; logged like every price change.
alter table pos.delivery_lines add column new_wholesale_kobo bigint check (new_wholesale_kobo >= 0);

create or replace function public.pos_record_purchase(
  p_floor_id     smallint,
  p_lines        jsonb,
  p_supplier_id  bigint default null,
  p_supplier_ref text default null,
  p_note         text default null,
  p_document_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := pos.require_permission('stock.receive');
  v_delivery uuid;
  v_ref      text;
  v_line     jsonb;
  v_item     pos.items;
  v_qty      int;
  v_cost     bigint;
  v_price    bigint;
  v_whole    bigint;
  v_entry    text;
  v_codes    text[];
  v_code     text;
  v_slot     int;
  v_unit     uuid;
  v_units    int := 0;
  v_pieces   int := 0;
  v_total    bigint := 0;
  v_seen     text[] := '{}';
  v_where    text;
begin
  perform pos.require_department(p_floor_id);
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one product to the purchase.' using hint = 'empty_delivery';
  end if;
  if p_supplier_id is not null and not exists (select 1 from pos.suppliers where id = p_supplier_id) then
    raise exception 'Unknown supplier.' using hint = 'bad_supplier';
  end if;

  v_ref := pos.next_purchase_no();
  insert into pos.deliveries (floor_id, supplier_id, supplier_ref, note, received_by, ref_no)
  values (p_floor_id, p_supplier_id, nullif(trim(p_supplier_ref), ''), nullif(trim(p_note), ''), v_user, v_ref)
  returning id into v_delivery;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from pos.items where id = (v_line->>'item_id')::bigint;
    if not found then
      raise exception 'One of the products in this purchase doesn''t exist.' using hint = 'bad_item';
    end if;
    v_cost := nullif((v_line->>'unit_cost_kobo')::bigint, 0);
    if v_cost is not null and v_cost < 0 then
      raise exception 'Cost can''t be negative.' using hint = 'bad_cost';
    end if;
    v_price := (v_line->>'new_price_kobo')::bigint;
    if v_price is not null and v_price <> v_item.price_kobo then
      if not pos.has_permission('prices.edit') then
        raise exception 'You don''t have permission to change prices (%).', v_item.name using hint = 'not_allowed';
      end if;
      if v_price < 0 then
        raise exception 'Price can''t be negative.' using hint = 'bad_price';
      end if;
    else
      v_price := null;
    end if;

    v_whole := (v_line->>'new_wholesale_kobo')::bigint;
    if v_whole is not null and v_whole is distinct from v_item.wholesale_price_kobo then
      if not pos.has_permission('prices.wholesale') then
        raise exception 'You don''t have permission to set wholesale prices (%).', v_item.name using hint = 'not_allowed';
      end if;
      if v_whole > coalesce(v_price, v_item.price_kobo) then
        raise exception 'The wholesale price of % should be lower than its selling price.', v_item.name using hint = 'bad_wholesale';
      end if;
    else
      v_whole := null;
    end if;

    if v_item.tracks_imei then
      if jsonb_typeof(v_line->'codes') is distinct from 'array' or jsonb_array_length(v_line->'codes') = 0 then
        raise exception 'Scan the IMEI or serial number of each % received.', v_item.name using hint = 'imei_required';
      end if;
      v_qty := 0;
      for v_entry in select jsonb_array_elements_text(v_line->'codes') loop
        v_codes := array(select trim(c) from regexp_split_to_table(v_entry, '[/,\s]+') c where trim(c) <> '');
        if cardinality(v_codes) = 0 then continue; end if;
        if cardinality(v_codes) > 2 then
          raise exception 'A phone has at most two IMEIs (got "%").', v_entry using hint = 'bad_imei';
        end if;
        insert into pos.phone_units (item_id, floor_id, status, cost_kobo, received_at)
        values (v_item.id, p_floor_id, 'in_stock', v_cost, now()) returning id into v_unit;
        v_slot := 0;
        foreach v_code in array v_codes loop
          v_slot := v_slot + 1;
          if v_code = any(v_seen) then
            raise exception '% is in this purchase twice.', v_code using hint = 'duplicate_imei';
          end if;
          v_where := null;
          select format('%s (%s)', i.name, replace(u.status, '_', ' ')) into v_where
          from pos.unit_identifiers ui join pos.phone_units u on u.id = ui.unit_id join pos.items i on i.id = u.item_id
          where ui.code = v_code;
          if v_where is not null then
            raise exception '% is already in the system: %.', v_code, v_where using hint = 'duplicate_imei';
          end if;
          if pos.identifier_kind(v_code) = 'serial' and v_code !~ '^[A-Za-z0-9-]{5,30}$' then
            raise exception '"%" doesn''t look like an IMEI (14 to 17 digits) or a serial number.', v_code using hint = 'bad_imei';
          end if;
          insert into pos.unit_identifiers (code, unit_id, slot, kind) values (v_code, v_unit, v_slot, pos.identifier_kind(v_code));
          v_seen := v_seen || v_code;
        end loop;
        insert into pos.stock_movements (item_id, floor_id, qty_change, reason, unit_id, ref_type, ref_id, actor_id)
        values (v_item.id, p_floor_id, 1, 'purchase', v_unit, 'delivery', v_delivery::text, v_user);
        v_qty := v_qty + 1;
      end loop;
      v_units := v_units + v_qty;
    else
      v_qty := (v_line->>'qty')::int;
      if v_qty is null or v_qty < 1 then
        raise exception 'Enter how many % were received.', v_item.name using hint = 'bad_qty';
      end if;
      insert into pos.stock_movements (item_id, floor_id, qty_change, reason, ref_type, ref_id, actor_id)
      values (v_item.id, p_floor_id, v_qty, 'purchase', 'delivery', v_delivery::text, v_user);
    end if;

    insert into pos.delivery_lines (delivery_id, item_id, item_name, qty, unit_cost_kobo, new_price_kobo, new_wholesale_kobo)
    values (v_delivery, v_item.id, v_item.name, v_qty, v_cost, v_price, v_whole);
    if v_whole is not null then
      update pos.items set wholesale_price_kobo = v_whole where id = v_item.id;
      insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
      values (v_user, 'product_updated', 'item', v_item.id::text,
              jsonb_build_object('wholesale_price_kobo', jsonb_build_object('from', v_item.wholesale_price_kobo, 'to', v_whole), 'purchase', v_ref));
    end if;
    if v_cost is not null then
      update pos.items set cost_kobo = v_cost where id = v_item.id;   -- the latest cost
    end if;
    if v_price is not null then
      update pos.items set price_kobo = v_price where id = v_item.id;
      insert into pos.audit_log (actor_id, action, entity, entity_id, detail)
      values (v_user, 'product_updated', 'item', v_item.id::text,
              jsonb_build_object('price_kobo', jsonb_build_object('from', v_item.price_kobo, 'to', v_price), 'purchase', v_ref));
    end if;
    v_pieces := v_pieces + v_qty;
    v_total := v_total + v_qty * coalesce(v_cost, 0);
  end loop;

  update pos.deliveries set total_cost_kobo = v_total where id = v_delivery;
  update pos.purchase_documents set delivery_id = v_delivery
  where id = any(coalesce(p_document_ids, '{}')) and delivery_id is null and uploaded_by = v_user;

  return jsonb_build_object('delivery_id', v_delivery, 'ref_no', v_ref, 'pieces', v_pieces, 'phones', v_units,
                            'total_cost_kobo', v_total);
end $$;
