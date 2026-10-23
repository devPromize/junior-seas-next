-- The old system ended up with 253 product names used more than once (1,242 records; one phone
-- model 29 times), because a new product was created per delivery instead of picking the
-- existing one. From now on a product can't be added (or renamed) to a name already on sale.
-- The existing duplicates are left for the merge tool.
create function pos.refuse_duplicate_item_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active and exists (select 1 from pos.items i where lower(i.name) = lower(new.name) and i.is_active and i.id <> new.id) then
    raise exception 'A product called % already exists. Search for it and use that one.', new.name using hint = 'duplicate_name';
  end if;
  return new;
end $$;

create trigger items_no_duplicate_names
before insert or update of name, is_active on pos.items
for each row execute function pos.refuse_duplicate_item_name();

-- Only check when a product is added, renamed or brought back on sale, so the existing
-- duplicates can still have their prices edited until they're merged.
drop trigger items_no_duplicate_names on pos.items;
create trigger items_no_duplicate_names_insert
before insert on pos.items
for each row execute function pos.refuse_duplicate_item_name();
create trigger items_no_duplicate_names_update
before update of name, is_active on pos.items
for each row when (old.name is distinct from new.name or (new.is_active and not old.is_active))
execute function pos.refuse_duplicate_item_name();
