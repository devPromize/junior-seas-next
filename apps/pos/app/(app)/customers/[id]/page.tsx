import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can, naira } from '@/lib/pos';
import CustomerEditor from './CustomerEditor';
import NoteForm from './NoteForm';

export type Customer = {
  id: string; name: string; phone: string | null; email: string | null; company: string | null; industry: string | null;
  heard_from: string | null; consent_receipts: boolean; consent_marketing: boolean; consent_ads: boolean;
  consent_updated_at: string | null; created_at: string; from_old_system: boolean;
  purchases: number; spent_kobo: number; first_at: string | null; last_at: string | null;
  devices: { name: string; codes: string[] | null; bought_at: string; sale_id: string; receipt_no: string; returned: boolean }[];
  sales: { id: string; receipt_no: string; at: string; total_kobo: number; items: string | null; refunded_kobo: number }[];
  notes: { id: number; body: string; at: string; by: string | null }[];
};
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const monthsSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / (30.44 * 24 * 3600 * 1000));

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  const { id } = await params;
  const { data, error } = await (await createClient()).rpc('pos_customer', { p_id: id });
  if (error) return <main className="mx-auto max-w-3xl px-4 py-6"><p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p></main>;
  const c = data as Customer;
  const wa = c.phone?.replace(/\D/g, '');

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <Link href="/customers" className="text-sm font-medium underline">← Customers</Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        {c.consent_marketing
          ? <span className="rounded-full bg-brand-soft px-3 py-1 text-sm text-brand">Agreed to offers</span>
          : <span className="rounded-full bg-paper px-3 py-1 text-sm text-ink-soft">No offers</span>}
        {c.from_old_system && <span className="text-sm text-ink-soft">From the old system</span>}
        {c.phone && (
          <span className="ml-auto flex gap-2">
            <a href={`tel:${c.phone}`} className="rounded-lg border border-line bg-panel px-3 py-2 font-semibold">Call</a>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-panel px-3 py-2 font-semibold">WhatsApp</a>
          </span>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Spent (after returns)" value={naira(c.spent_kobo)} />
        <Stat label="Visits" value={String(c.purchases)} />
        <Stat label="First visit" value={date(c.first_at)} />
        <Stat label="Last visit" value={date(c.last_at)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="mb-2 font-semibold">Phones they own</h2>
            {c.devices.length === 0 && <p className="text-sm text-ink-soft">No phones bought from us yet.</p>}
            <ul className="flex flex-col divide-y divide-line text-sm">
              {c.devices.map((d, i) => (
                <li key={i} className="py-2">
                  <span className="font-medium">{d.name}</span>{d.returned && <span className="text-warn"> · returned</span>}
                  <span className="block text-ink-soft">
                    {d.codes?.join(' / ')} · bought {date(d.bought_at)} ({monthsSince(d.bought_at)} months ago) ·{' '}
                    <Link href={`/sales/${d.sale_id}`} className="underline">receipt {d.receipt_no}</Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="mb-2 font-semibold">Purchases</h2>
            {c.sales.length === 0 && <p className="text-sm text-ink-soft">Nothing bought yet.</p>}
            <ul className="flex flex-col divide-y divide-line text-sm">
              {c.sales.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <Link href={`/sales/${s.id}`} className="font-medium hover:underline">{date(s.at)} · {s.receipt_no}</Link>
                    <span className="block text-ink-soft">{s.items}</span>
                  </span>
                  <span className="tabular text-right font-semibold">
                    {naira(s.total_kobo)}
                    {s.refunded_kobo > 0 && <span className="block text-xs font-normal text-warn">−{naira(s.refunded_kobo)} returned</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <CustomerEditor customer={c} />
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
            <h2 className="font-semibold">Notes</h2>
            {can(me, 'customers.manage') && <NoteForm customerId={c.id} />}
            {c.notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-paper p-3 text-sm">
                <p>{n.body}</p>
                <p className="text-xs text-ink-soft">{n.by ?? '—'} · {date(n.at)}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="tabular mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
