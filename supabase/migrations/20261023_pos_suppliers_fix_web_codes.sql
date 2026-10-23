-- Supplier names from the old system still had web codes in them ("GOD&#039;SWILL COMM").
update pos.suppliers set name = replace(replace(replace(name, '&#039;', ''''), '&amp;', '&'), '&quot;', '"')
where name ~ '&(#039|amp|quot);';
