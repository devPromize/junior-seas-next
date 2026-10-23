-- The scheduler, and the POS jobs it runs (all times are Nigerian time, UTC+1).
-- Until now the first two jobs (built in step 4) existed but nothing ran them.
create extension if not exists pg_cron;

-- Every 5 minutes: phones held by orders that weren't checked out in 30 minutes go back on sale.
select cron.schedule('pos-release-expired-holds', '*/5 * * * *', $$select pos.release_expired_holds()$$);
-- Just after midnight: orders left waiting from yesterday are cancelled.
select cron.schedule('pos-cancel-unfinished-orders', '5 23 * * *', $$select pos.cancel_unfinished_orders()$$);
-- 8 a.m. daily: supplier bills unpaid after 30 days remind the owner and whoever pays suppliers (weekly per bill).
select cron.schedule('pos-remind-overdue-supplier-bills', '0 7 * * *', $$select pos.remind_overdue_supplier_bills()$$);
