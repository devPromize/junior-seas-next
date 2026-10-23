import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { naira } from '@/lib/pos';

const PAGE = 50;
const RANGES: Record<string, { label: string; days: number | null }> = {
  today: { label: 'Today', days: 0 },
  '7': { label: 'Last 7 days', days: 6 },
  '30': { label: 'Last 30 days', days: 29 },
  all: { label: 'All time', days: null },
};
type Search = { q?: string; range?: string; status?: string; page?: string };
type Row = {
  id: string; receipt_no: string; at: string; status: string; source: string; customer: string | null; sold_by: string | null;
  cashier: string | null; total_kobo: number; refunded_kobo: number; unpaid: boolean; items: number; methods: string | null;
};
type Lookup = {
  item_id: number; name: string; codes: string[]; status: string; department: string; received_at: string | null;
  purchase: { id: string; ref_no: string | null; supplier: string | null } | null;
  sale: { id: string; receipt_no: string; paid_at: string; price_kobo: number; sold_by: string | null;
          customer: { name: string; phone: string | null } | null; can_open: boolean } | null;
  warranty_days: number | null; warranty_until: string | null;
};

const lagosToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const STATUS: Record<string, string> = { in_stock: 'In stock', held: 'In an unpaid order', sold: 'Sold', faulty: 'Faulty', missing: 'Missing', returned: 'Returned' };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { me } = await getMe();
  if (!me) return null;
  const s = await searchParams;
  const q = (s.q ?? '').trim();
  // Searching for something specific looks through all time; browsing defaults to the last 7 days.
  const range = s.range ?? (q ? 'all' : '7');
  const days = RANGES[range]?.days ?? null;
  const page = Math.max(1, Number(s.page) || 1);
  const from = days == null ? null : (() => { const d = lagosToday(); d.setDate(d.getDate() - days); return isoDate(d); })();
  const looksLikeImei = /^[0-9]{14,17}$/.test(q) || /^[A-Za-z0-9-]{8,30}$/.test(q) && /\d/.test(q) && /[A-Za-z]/.test(q);

  const supabase = await createClient();
  const [list, lookup] = await Promise.all([
    supabase.rpc('pos_sales', { p_search: q || null, p_from: from, p_status: s.status || 'all', p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    looksLikeImei ? supabase.rpc('pos_lookup_imei', { p_code: q }) : Promise.resolve({ data: null }),
  ]);
  if (list.error?.code === 'P0001' && list.error.message.startsWith('You don')) redirect('/');
  const rows = (list.data?.rows ?? []) as Row[];
  const total: number = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const phone = lookup.data as Lookup | null;
  const link = (patch: Partial<Search>) =>
    `/sales?${new URLSearchParams(Object.entries({ ...s, range, ...patch }).filter(([, v]) => v) as [string, string][])}`;
  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Sales</h1>

      <form action="/sales" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Receipt no., customer, phone number, IMEI or product" className={`${field} min-w-64 flex-1`} />
        <select name="range" defaultValue={range} className={field}>
          {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="status" defaultValue={s.status ?? 'all'} className={field}>
          <option value="all">All sales</option>
          <option value="paid">Paid</option>
          <option value="returned">With a return</option>
          <option value="cancelled">Cancelled orders</option>
          <option value="unpaid">Unpaid (old system)</option>
        </select>
        <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Search</button>
      </form>

      {phone && (
        <section className="flex flex-col gap-1 rounded-xl border border-brand bg-brand-soft p-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Phone lookup</p>
          <p className="text-lg font-bold">{phone.name}</p>
          <p className="font-mono text-sm">{phone.codes.join(' / ')}</p>
          <p>{STATUS[phone.status] ?? phone.status} · {phone.department}</p>
          {phone.sale ? (
            <p>
              Sold {new Date(phone.sale.paid_at).toLocaleDateString('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' })} for {naira(phone.sale.price_kobo)}
              {phone.sale.customer ? ` to ${phone.sale.customer.name}` : ''}{phone.sale.sold_by ? ` by ${phone.sale.sold_by}` : ''} ·{' '}
              {phone.sale.can_open ? <Link href={`/sales/${phone.sale.id}`} className="font-semibold underline">receipt {phone.sale.receipt_no}</Link> : `receipt ${phone.sale.receipt_no}`}
            </p>
          ) : <p>Not sold yet.</p>}
          {phone.sale && (
            <p className="font-semibold">
              {phone.warranty_until
                ? new Date(phone.warranty_until) >= lagosToday()
                  ? `Under warranty until ${new Date(phone.warranty_until).toLocaleDateString('en-NG', { dateStyle: 'medium' })}`
                  : `Warranty ended ${new Date(phone.warranty_until).toLocaleDateString('en-NG', { dateStyle: 'medium' })}`
                : 'No warranty period is set for this product.'}
            </p>
          )}
          {phone.purchase && <p className="text-sm text-ink-soft">Bought in on {phone.purchase.ref_no}{phone.purchase.supplier ? ` from ${phone.purchase.supplier}` : ''}</p>}
        </section>
      )}

      <p className="text-ink-soft">
        {total.toLocaleString()} sale{total === 1 ? '' : 's'} · {naira(list.data?.value_kobo ?? 0)} after returns
      </p>

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Receipt</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Sold by</th>
              <th className="px-3 py-2 text-right font-medium">Items</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Paid by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-paper">
                <td className="whitespace-nowrap px-3 py-2">
                  {new Date(r.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/sales/${r.id}`} className="font-medium hover:underline">{r.receipt_no}</Link>
                  {r.status === 'cancelled' && <Badge tone="bad">Cancelled</Badge>}
                  {r.status === 'placed' && <Badge tone="warn">Waiting at checkout</Badge>}
                  {r.refunded_kobo > 0 && <Badge tone="warn">Returned {naira(r.refunded_kobo)}</Badge>}
                  {r.unpaid && <Badge tone="warn">Unpaid (old system)</Badge>}
                  {r.source === 'legacy' && <span className="block text-xs text-ink-soft">old system</span>}
                </td>
                <td className="px-3 py-2">{r.customer ?? <span className="text-ink-soft">Walk-in</span>}</td>
                <td className="px-3 py-2 text-ink-soft">{r.sold_by ?? '—'}</td>
                <td className="tabular px-3 py-2 text-right">{r.items}</td>
                <td className="tabular px-3 py-2 text-right font-semibold">{naira(r.total_kobo)}</td>
                <td className="px-3 py-2 capitalize text-ink-soft">{r.methods ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-soft">No sales match.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center gap-3">
          {page > 1 && <Link href={link({ page: String(page - 1) })} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">← Newer</Link>}
          <span className="text-sm text-ink-soft">Page {page} of {pages}</span>
          {page < pages && <Link href={link({ page: String(page + 1) })} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">Older →</Link>}
        </nav>
      )}
    </main>
  );
}

function Badge({ tone, children }: { tone: 'bad' | 'warn'; children: React.ReactNode }) {
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn'}`}>
      {children}
    </span>
  );
}
