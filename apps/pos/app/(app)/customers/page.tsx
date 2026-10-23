import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can, naira } from '@/lib/pos';
import ExportButton from './ExportButton';
import AddCustomer from './AddCustomer';

const PAGE = 50;
const SEGMENTS: Record<string, { label: string; hint: string }> = {
  all: { label: 'Everyone', hint: '' },
  phone_buyers: { label: 'Bought a phone', hint: 'Customers who have bought at least one phone.' },
  upgrade_due: { label: 'Due for an upgrade', hint: 'Their last phone was bought over a year ago.' },
  lapsed: { label: 'Haven’t been back', hint: 'No purchase in the last 90 days.' },
  top: { label: 'Best customers', hint: 'Sorted by how much they’ve spent.' },
  marketing: { label: 'Agreed to offers', hint: 'Only these can be sent promotions.' },
  business: { label: 'Businesses', hint: 'Customers buying for a company.' },
};
type Row = {
  id: string; name: string; phone: string | null; email: string | null; company: string | null; purchases: number; spent_kobo: number;
  last_at: string | null; phones: number; last_phone_at: string | null; marketing: boolean; from_old_system: boolean;
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; page?: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'customers.manage')) redirect('/');
  const s = await searchParams;
  const segment = s.segment && SEGMENTS[s.segment] ? s.segment : 'all';
  const page = Math.max(1, Number(s.page) || 1);
  const { data, error } = await (await createClient()).rpc('pos_customers', {
    p_search: s.q || null, p_segment: segment, p_limit: PAGE, p_offset: (page - 1) * PAGE,
  });
  const rows = (data?.rows ?? []) as Row[];
  const total: number = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (patch: Record<string, string>) =>
    `/customers?${new URLSearchParams(Object.entries({ ...s, segment, ...patch }).filter(([, v]) => v) as [string, string][])}`;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Customers</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          {can(me, 'sales.create') && <AddCustomer />}
          {can(me, 'customers.export') && <ExportButton segment={segment} />}
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {Object.entries(SEGMENTS).map(([k, v]) => (
          <Link key={k} href={link({ segment: k, page: '' })}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${k === segment ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-panel'}`}>
            {v.label}
          </Link>
        ))}
      </nav>
      <form action="/customers" className="flex gap-2">
        <input type="hidden" name="segment" value={segment} />
        <input name="q" defaultValue={s.q} placeholder="Name, phone number, email or company" className="min-w-64 flex-1 rounded-lg border border-line bg-panel px-3 py-2.5" />
        <button className="rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold">Search</button>
      </form>
      <p className="text-ink-soft">{total.toLocaleString()} customer{total === 1 ? '' : 's'}{SEGMENTS[segment].hint ? ` · ${SEGMENTS[segment].hint}` : ''}</p>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 text-right font-medium">Visits</th>
              <th className="px-3 py-2 text-right font-medium">Spent</th>
              <th className="px-3 py-2 font-medium">Last visit</th>
              <th className="px-3 py-2 font-medium">Phones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-paper">
                <td className="px-3 py-2">
                  <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  {c.marketing && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">Offers OK</span>}
                  <span className="block text-xs text-ink-soft">{[c.phone, c.company, c.email].filter(Boolean).join(' · ') || 'No contact details'}</span>
                </td>
                <td className="tabular px-3 py-2 text-right">{c.purchases}</td>
                <td className="tabular px-3 py-2 text-right font-semibold">{naira(c.spent_kobo)}</td>
                <td className="px-3 py-2">{date(c.last_at)}</td>
                <td className="px-3 py-2 text-ink-soft">{c.phones ? `${c.phones} · last ${date(c.last_phone_at)}` : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-soft">No customers match.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center gap-3">
          {page > 1 && <Link href={link({ page: String(page - 1) })} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">← Previous</Link>}
          <span className="text-sm text-ink-soft">Page {page} of {pages}</span>
          {page < pages && <Link href={link({ page: String(page + 1) })} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">Next →</Link>}
        </nav>
      )}
    </main>
  );
}
