import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can, naira } from '@/lib/pos';
import MoneyTabs from '../MoneyTabs';
import ConfirmButtons from './ConfirmButtons';

type Pending = {
  id: number; at: string; amount_kobo: number; method: string; account: string; bank_name: string | null; account_number: string | null;
  sale_id: string; receipt_no: string; customer: string | null; cashier: string | null;
};
type Waiting = {
  sale_id: string; receipt_no: string; at: string; amount_kobo: number; total_kobo: number;
  customer: string | null; cashier: string | null; items: string | null;
  payments: { method: string; amount_kobo: number; account: string | null; bank_name: string | null; account_number: string | null; check: boolean }[];
};
type Decided = {
  id: number; at: string; amount_kobo: number; account: string; receipt_no: string; sale_id: string;
  confirmation: 'confirmed' | 'not_received'; confirmed_at: string; note: string | null; by: string | null;
};
const when = (iso: string) => new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

// Money paid into accounts the shop can't see itself (e.g. Boss's personal account). Each sale
// went through straight away; this is where someone confirms the money really arrived.
export default async function ConfirmPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'money.view') && !can(me, 'accounts.manage')) redirect('/money');
  const { data, error } = await (await createClient()).rpc('pos_payments_to_confirm');
  const waiting = (data?.awaiting ?? []) as Waiting[];
  const pending = (data?.pending ?? []) as Pending[];
  const recent = (data?.recent ?? []) as Decided[];
  const total = pending.reduce((s, p) => s + p.amount_kobo, 0);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <MoneyTabs me={me} active="confirm" />
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}
      {waiting.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Customers waiting at the till ({waiting.length})</h2>
          <p className="text-sm text-ink-soft">
            These sales haven’t gone through yet. Check the account, then confirm: the sale completes and the cashier is told to hand over the goods.
          </p>
          {waiting.map((w) => (
            <div key={w.sale_id} className="flex flex-col gap-2 rounded-xl border-2 border-bad bg-panel p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular">{naira(w.amount_kobo)}</span>
                <span className="text-sm text-ink-soft">waiting since {when(w.at)}</span>
              </div>
              <ul className="text-sm">
                {w.payments.map((p, i) => (
                  <li key={i} className={p.check ? 'font-semibold' : 'text-ink-soft'}>
                    {naira(p.amount_kobo)} {p.method}{p.account ? ` into ${p.account}` : ''}
                    {p.account_number ? ` (${p.bank_name ?? ''} ${p.account_number})` : ''}{p.check ? ' ← check this' : ''}
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                Receipt {w.receipt_no} · {naira(w.total_kobo)} in all{w.customer ? ` · ${w.customer}` : ''} · cashier {w.cashier ?? '—'}
                {w.items && <span className="block text-ink-soft">{w.items}</span>}
              </p>
              <ConfirmButtons saleId={w.sale_id} />
            </div>
          ))}
        </section>
      )}

      <p className="text-ink-soft">
        Payments into accounts marked “confirm after the sale”. The sale has already gone through. Check with the account holder
        (e.g. Boss), then mark each one.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{pending.length ? `${pending.length} waiting · ${naira(total)}` : 'Nothing waiting to be confirmed'}</h2>
        {pending.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-warn bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-lg font-bold tabular">{naira(p.amount_kobo)}</span>
              <span className="text-sm text-ink-soft">{when(p.at)}</span>
            </div>
            <p className="text-sm">
              Into <b>{p.account}</b>{p.account_number ? ` (${p.bank_name ?? ''} ${p.account_number})` : ''} ·{' '}
              <Link href={`/sales/${p.sale_id}`} className="underline">receipt {p.receipt_no}</Link>
              {p.customer ? ` · ${p.customer}` : ''} · cashier {p.cashier ?? '—'}
            </p>
            <ConfirmButtons paymentId={p.id} />
          </div>
        ))}
      </section>

      {recent.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Confirmed in the last 30 days</h2>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {recent.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {naira(d.amount_kobo)} into {d.account} · <Link href={`/sales/${d.sale_id}`} className="underline">{d.receipt_no}</Link>
                  {d.note && <span className="block text-ink-soft">“{d.note}”</span>}
                </span>
                <span className={d.confirmation === 'confirmed' ? 'text-brand' : 'font-semibold text-bad'}>
                  {d.confirmation === 'confirmed' ? 'Received ✓' : 'Not received ✗'} · {d.by ?? '—'}, {when(d.confirmed_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
