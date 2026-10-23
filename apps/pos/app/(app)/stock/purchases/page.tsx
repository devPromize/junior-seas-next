import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { naira } from '@/lib/pos';
import type { ProductOptions } from '@/lib/products';
import StockTabs from '../StockTabs';

const PAGE = 50;
type Row = {
  id: string; ref_no: string | null; received_at: string; supplier: string | null; supplier_ref: string | null;
  department: string; received_by: string | null; total_cost_kobo: number | null; items: number; pieces: number;
  documents: number; is_legacy: boolean;
};

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const s = await searchParams;
  const page = Math.max(1, Number(s.page) || 1);
  const supabase = await createClient();
  const [opts, list] = await Promise.all([
    supabase.rpc('pos_product_options'),
    supabase.rpc('pos_purchases', { p_search: s.q || null, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
  ]);
  const options = opts.data as ProductOptions | null;
  if (!options || list.error) redirect('/stock');
  const rows = (list.data?.rows ?? []) as Row[];
  const total: number = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => `/stock/purchases?${new URLSearchParams({ ...(s.q ? { q: s.q } : {}), page: String(p) })}`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Stock</h1>
      <StockTabs active="purchases" can={options.can} />

      <div className="flex flex-wrap items-center gap-2">
        <form action="/stock/purchases" className="flex min-w-64 flex-1 gap-2">
          <input name="q" defaultValue={s.q} placeholder="PO number, supplier, invoice no. or product"
            className="flex-1 rounded-lg border border-line bg-panel px-3 py-2.5" />
          <button className="rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold">Search</button>
        </form>
        {options.can.receive && (
          <Link href="/stock/purchases/new" className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">New purchase</Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Purchase</th>
              <th className="px-3 py-2 font-medium">Supplier</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 text-right font-medium">Pieces</th>
              {options.can.costs && <th className="px-3 py-2 text-right font-medium">Total</th>}
              <th className="px-3 py-2 font-medium">Recorded by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-paper">
                <td className="whitespace-nowrap px-3 py-2">
                  {new Date(r.received_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/stock/purchases/${r.id}`} className="font-medium hover:underline">{r.ref_no ?? 'No number'}</Link>
                  {r.documents > 0 && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">📎 {r.documents}</span>}
                  {r.supplier_ref && <span className="block text-xs text-ink-soft">Invoice {r.supplier_ref}</span>}
                </td>
                <td className="px-3 py-2">{r.supplier ?? '—'}</td>
                <td className="px-3 py-2 text-ink-soft">{r.department}</td>
                <td className="tabular px-3 py-2 text-right">{Number(r.pieces).toLocaleString()}</td>
                {options.can.costs && <td className="tabular px-3 py-2 text-right font-semibold">{r.total_cost_kobo != null ? naira(r.total_cost_kobo) : '—'}</td>}
                <td className="px-3 py-2 text-ink-soft">{r.received_by ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-soft">No purchases match.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center gap-3">
          {page > 1 && <Link href={link(page - 1)} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">← Newer</Link>}
          <span className="text-sm text-ink-soft">Page {page} of {pages} · {total} purchases</span>
          {page < pages && <Link href={link(page + 1)} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">Older →</Link>}
        </nav>
      )}
    </main>
  );
}
