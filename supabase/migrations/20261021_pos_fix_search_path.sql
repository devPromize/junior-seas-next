-- Hardening: pin the search path on the three small trigger helpers, as the Supabase
-- security check recommends, so they can't be tricked into using look-alike objects.
alter function pos.block_ledger_changes() set search_path = '';
alter function pos.block_changes() set search_path = '';
alter function pos.touch_updated_at() set search_path = '';
