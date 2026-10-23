import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { naira } from '@/lib/pos';
import type { ProductOptions } from '@/lib/products';
import StockTabs from '../../StockTabs';
import AddDocument from './AddDocument';

type Purchase = {
  id: string; ref_no: string | null; received_at: string; supplier_ref: string | null; note: string | null; is_legacy: boolean;
  supplier: { id: number; name: string; phone: string | null } | null; department: string; received_by: string | null;
  total_cost_kobo: number | null; amount_paid_kobo: number | null;
  lines: { item_id: number | null; name: string; qty: number; unit_cost_kobo: number | null; new_price_kobo: number | null; codes: string[] | null }[];
  documents: { id: string; path: string; content_type: string; uploaded_at: string }[];
};

export default async function PurchasePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }>;
}) {
  const [{ id }, { new: justSaved }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [opts, res] = await Promise.all([supabase.rpc('pos_product_options'), supabase.rpc('pos_purchase', { p_id: id })]);
  if (res.error) {
    return <main className="mx-auto max-w-3xl px-4 py-6"><p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{res.error.message}</p></main>;
  }
  const options = opts.data as ProductOptions;
  const p = res.data as Purchase;

  // Short-lived links to the receipt files (the storage bucket is private).
  const signed = p.documents.length
    ? (await supabase.storage.from('purchase-documents').createSignedUrls(p.documents.map((d) => d.path), 60 * 30)).data ?? []
    : [];
  const urlFor = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Stock</h1>
      <StockTabs active="purchases" can={options.can} />
      <Link href="/stock/purchases" className="text-sm font-medium underline">← All purchases</Link>
      {justSaved && <p className="rounded-lg bg-brand-soft px-4 py-3 font-semibold text-brand">Saved. The stock is in.</p>}

      <section className="grid gap-x-6 gap-y-1 rounded-xl border border-line bg-panel p-4 text-sm sm:grid-cols-2">
        <p className="text-xl font-bold sm:col-span-2">{p.ref_no ?? 'Purchase'}</p>
        <p><span className="text-ink-soft">Supplier:</span> {p.supplier?.name ?? '—'}{p.supplier?.phone ? ` · ${p.supplier.phone}` : ''}</p>
        <p><span className="text-ink-soft">Date:</span> {new Date(p.received_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })}</p>
        <p><span className="text-ink-soft">Into:</span> {p.department}</p>
        <p><span className="text-ink-soft">Recorded by:</span> {p.received_by ?? '—'}</p>
        {p.supplier_ref && <p><span className="text-ink-soft">Supplier’s invoice:</span> {p.supplier_ref}</p>}
        {p.note && <p className="sm:col-span-2"><span className="text-ink-soft">Note:</span> {p.note}</p>}
      </section>

      <section className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              {options.can.costs && <th className="px-3 py-2 text-right font-medium">Cost each</th>}
              {options.can.costs && <th className="px-3 py-2 text-right font-medium">Line total</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {p.lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  {l.item_id ? <Link href={`/products/${l.item_id}`} className="font-medium hover:underline">{l.name}</Link> : <span className="font-medium">{l.name}</span>}
                  {l.new_price_kobo != null && <span className="block text-xs text-brand">Selling price set to {naira(l.new_price_kobo)}</span>}
                  {l.codes?.length ? <span className="block font-mono text-xs text-ink-soft">{l.codes.join(', ')}</span> : null}
                </td>
                <td className="tabular px-3 py-2 text-right">{Number(l.qty).toLocaleString()}</td>
                {options.can.costs && <td className="tabular px-3 py-2 text-right">{l.unit_cost_kobo != null ? naira(l.unit_cost_kobo) : '—'}</td>}
                {options.can.costs && <td className="tabular px-3 py-2 text-right">{l.unit_cost_kobo != null ? naira(Math.round(l.qty * l.unit_cost_kobo)) : '—'}</td>}
              </tr>
            ))}
          </tbody>
          {options.can.costs && p.total_cost_kobo != null && (
            <tfoot className="border-t border-line font-bold">
              <tr><td className="px-3 py-2" colSpan={3}>Total</td><td className="tabular px-3 py-2 text-right">{naira(p.total_cost_kobo)}</td></tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <h2 className="font-semibold">Supplier’s receipt</h2>
        {p.documents.length === 0 && <p className="text-sm text-ink-soft">No receipt attached.</p>}
        <div className="flex flex-wrap gap-3">
          {p.documents.map((d) => {
            const url = urlFor(d.path);
            return url ? (
              <a key={d.id} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
                {d.content_type.startsWith('image/')
                  ? <img src={url} alt="Supplier's receipt" className="h-48 w-auto object-contain" />
                  : <span className="flex h-48 w-36 items-center justify-center bg-paper font-bold">Open PDF</span>}
              </a>
            ) : null;
          })}
        </div>
        {options.can.receive && <AddDocument deliveryId={p.id} />}
      </section>
    </main>
  );
}
