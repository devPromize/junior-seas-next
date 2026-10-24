import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can, naira } from '@/lib/pos';
import MoneyTabs, { moneyTabsFor } from './MoneyTabs';

type Overview = {
  day: string;
  takings: { method: string; account: string | null; amount_kobo: number; unconfirmed_kobo: number | null }[];
  takings_kobo: number; refunds_kobo: number; expenses_kobo: number; supplier_payments_kobo: number;
  owing_kobo: number; overdue: number; unconfirmed_kobo: number; to_confirm: number;
  cash_ups: { id: string; by: string | null; at: string; expected_kobo: number; counted_kobo: number; difference_kobo: number; note: string | null }[];
};
const METHOD: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', card: 'Card', online: 'Online' };

// A day's money at a glance: what came in and through which account, what went out, what we owe.
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'money.view')) redirect(moneyTabsFor(me)[0]?.href ?? '/');
  const { day } = await searchParams;
  const { data, error } = await (await createClient()).rpc('pos_money_overview', { p_day: day || null });
  const o = data as Overview | null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <MoneyTabs me={me} active="overview" />
      <form action="/money" className="flex items-center gap-2">
        <input type="date" name="day" defaultValue={o?.day} className="rounded-lg border border-line bg-panel px-3 py-2" />
        <button className="rounded-lg border border-line bg-panel px-4 py-2 font-semibold">Show</button>
      </form>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}

      {o && (
        <>
          {o.to_confirm > 0 && (
            <Link href="/money/confirm" className="rounded-lg bg-warn-soft px-4 py-3 font-medium text-warn">
              {o.to_confirm} payment{o.to_confirm === 1 ? '' : 's'} ({naira(o.unconfirmed_kobo)}) into accounts like Boss’s still need confirming →
            </Link>
          )}
          {o.overdue > 0 && (
            <Link href="/money/bills?show=overdue" className="rounded-lg bg-warn-soft px-4 py-3 font-medium text-warn">
              {o.overdue} supplier bill{o.overdue === 1 ? ' is' : 's are'} unpaid after 30 days. Check and record the payments →
            </Link>
          )}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Taken in" value={naira(o.takings_kobo)} />
            <Stat label="Refunded" value={naira(o.refunds_kobo)} />
            <Stat label="Expenses" value={naira(o.expenses_kobo)} />
            <Stat label="Paid to suppliers" value={naira(o.supplier_payments_kobo)} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-4">
              <h2 className="mb-2 font-semibold">Taken in, by account</h2>
              {o.takings.length === 0 && <p className="text-sm text-ink-soft">No payments taken on this day.</p>}
              <ul className="flex flex-col divide-y divide-line text-sm">
                {o.takings.map((t, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span>
                      {METHOD[t.method] ?? t.method}{t.account ? ` · ${t.account}` : ''}
                      {t.unconfirmed_kobo ? <span className="block text-xs text-warn">{naira(t.unconfirmed_kobo)} not confirmed yet</span> : null}
                    </span>
                    <span className="tabular font-semibold">{naira(t.amount_kobo)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-soft">Check each account against its bank app at the end of the day.</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <h2 className="mb-2 font-semibold">Cash-ups</h2>
              {o.cash_ups.length === 0 && <p className="text-sm text-ink-soft">No cash-ups on this day yet.</p>}
              <ul className="flex flex-col divide-y divide-line text-sm">
                {o.cash_ups.map((c) => (
                  <li key={c.id} className="flex flex-col py-2">
                    <span className="flex justify-between">
                      <span>{c.by ?? '—'} · {new Date(c.at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}</span>
                      <span className={`tabular font-semibold ${c.difference_kobo === 0 ? 'text-brand' : 'text-bad'}`}>
                        {c.difference_kobo === 0 ? 'Balanced' : `${c.difference_kobo < 0 ? 'Short' : 'Over'} ${naira(Math.abs(c.difference_kobo))}`}
                      </span>
                    </span>
                    <span className="text-ink-soft">Counted {naira(c.counted_kobo)}, expected {naira(c.expected_kobo)}{c.note ? ` · “${c.note}”` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <Link href="/money/bills" className="rounded-xl border border-line bg-panel p-4 hover:bg-paper">
            <span className="text-sm text-ink-soft">Owed to suppliers, all purchases</span>
            <span className="tabular block text-2xl font-bold">{naira(o.owing_kobo)}</span>
          </Link>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
