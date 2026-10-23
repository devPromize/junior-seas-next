import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can, naira } from '@/lib/pos';
import PaySupplierForm from '@/components/PaySupplierForm';
import MoneyTabs from '../MoneyTabs';

type Bill = {
  id: string; ref_no: string | null; received_at: string; supplier: string | null; supplier_ref: string | null;
  total_kobo: number; paid_kobo: number; owed_kobo: number; age_days: number; settled: boolean;
};
const SHOW: Record<string, string> = { owing: 'Owing', overdue: 'Over 30 days', paid: 'Paid', all: 'All' };

// What we owe suppliers, oldest first, with a payment form on each unpaid bill.
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'money.view') && !can(me, 'suppliers.pay')) redirect('/money');
  const show = (await searchParams).show ?? 'owing';
  const { data, error } = await (await createClient()).rpc('pos_supplier_bills', { p_show: show });
  const rows = (data?.rows ?? []) as Bill[];
  const canPay = can(me, 'suppliers.pay');

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <MoneyTabs me={me} active="bills" />
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-sm text-ink-soft">Owed to suppliers</p>
          <p className="tabular text-2xl font-bold">{naira(data?.owing_kobo ?? 0)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${data?.overdue ? 'border-warn bg-warn-soft' : 'border-line bg-panel'}`}>
          <p className="text-sm text-ink-soft">Unpaid after 30 days</p>
          <p className="tabular text-2xl font-bold">{naira(data?.overdue_kobo ?? 0)} <span className="text-base font-medium">({data?.overdue ?? 0})</span></p>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2">
        {Object.entries(SHOW).map(([k, label]) => (
          <Link key={k} href={`/money/bills?show=${k}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${k === show ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-panel'}`}>
            {label}
          </Link>
        ))}
      </nav>

      <ul className="flex flex-col gap-2">
        {rows.map((b) => (
          <li key={b.id} className={`flex flex-col gap-2 rounded-xl border bg-panel p-4 ${b.owed_kobo > 0 && b.age_days > 30 ? 'border-warn' : 'border-line'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <Link href={`/stock/purchases/${b.id}`} className="font-semibold hover:underline">{b.ref_no ?? 'Purchase'}</Link>
                <span className="text-ink-soft"> · {b.supplier ?? 'No supplier'}{b.supplier_ref ? ` · invoice ${b.supplier_ref}` : ''}</span>
              </span>
              <span className="text-sm text-ink-soft">
                {new Date(b.received_at).toLocaleDateString('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' })} · {b.age_days} day{b.age_days === 1 ? '' : 's'} ago
              </span>
            </div>
            <div className="flex flex-wrap gap-x-6 text-sm">
              <span>Total <b className="tabular">{naira(b.total_kobo)}</b></span>
              <span>Paid <b className="tabular">{naira(b.paid_kobo)}</b></span>
              <span className={b.owed_kobo > 0 ? 'text-bad' : 'text-brand'}>
                {b.settled ? 'Settled before the new POS' : b.owed_kobo > 0 ? <>Owed <b className="tabular">{naira(b.owed_kobo)}</b></> : 'Paid in full'}
              </span>
            </div>
            {canPay && b.owed_kobo > 0 && <PaySupplierForm deliveryId={b.id} owedKobo={b.owed_kobo} accounts={me.payment_accounts} compact />}
          </li>
        ))}
        {rows.length === 0 && <li className="rounded-xl border border-line bg-panel p-6 text-center text-ink-soft">Nothing here.</li>}
      </ul>
    </main>
  );
}
