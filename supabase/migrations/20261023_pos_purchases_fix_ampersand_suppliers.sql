-- Supplier names with "&" were stored as "&amp;" on the old purchases, so 12 purchases didn't
-- find their supplier during the import.
update pos.deliveries d set supplier_id = (
  select s.id from pos.suppliers s
  where pos.supplier_key(s.name) = pos.supplier_key(replace(coalesce(nullif(trim(r.payload->>'supplier_business_name'), ''), r.payload->>'name'), '&amp;', '&'))
  order by s.id limit 1)
from pos_import.raw_rows r
where r.entity = 'purchases' and (r.payload->>'id')::int = d.legacy_id and d.supplier_id is null;
