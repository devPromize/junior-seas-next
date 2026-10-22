-- The Inventory officer is described as "Receives, transfers and corrects stock" but was never
-- given the permission to move stock between departments.
insert into pos.role_permissions (role_id, permission_code)
select id, 'stock.transfer' from pos.roles where name = 'Inventory officer'
on conflict do nothing;
