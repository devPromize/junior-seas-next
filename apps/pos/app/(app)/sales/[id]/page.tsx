import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { naira } from '@/lib/pos';
import ReturnForm from './ReturnForm';

export type Sale = {
  id: string; receipt_no: string; status: string; source: string; placed_at: string; paid_at: string | null;
  cancelled_at: string | null; cancel_reason: string | null; unpaid_in_old_system: boolean;
  sold_by: string | null; checked_out_by: string | null; customer: { name: string; phone: string | null } | null;
  subtotal_kobo: number; discount_kobo: number; total_kobo: number; note: string | null;
  lines: { id: number; item_id: number | null; name: string; qty: number; unit_price_kobo: number; discount_kobo: number;
           price_tier: string; department: string; codes: string[] | null; returned: number }[];
  payments: { method: string; account: string | null; amount_kobo: number }[];
  returns: { id: string; at: string; reason: string; refund_kobo: number; refund_method: string | null; account: string | null;
             by: string | null; items: { name: string; qty: number; outcome: string }[] | null }[];
  refunded_kobo: number; can_return: boolean;
};

const METHOD: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', card: 'Card', online: 'Online' };
const when = (iso: string) => new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' });

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  const { id } = await params;
  const { data, error } = await (await createClient()).rpc('pos_sale', { p_id: id });
  if (error) {
    return <main className="mx-auto max-w-3xl px-4 py-6"><p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p></main>;
  }
  const s = data as Sale;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <Link href="/sales" className="text-sm font-medium underline">← Sales</Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Receipt {s.receipt_no}</h1>
        {s.source === 'legacy' && <span className="rounded-full bg-paper px-3 py-1 text-sm text-ink-soft">From the old system</span>}
        {s.status === 'paid' && (
          <Link href={`/receipt/${s.id}`} className="ml-auto rounded-lg border border-line bg-panel px-4 py-2 font-semibold">Print or send receipt</Link>
        )}
      </header>

      {s.status === 'cancelled' && (
        <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">
          Cancelled {s.cancelled_at ? when(s.cancelled_at) : ''}{s.cancel_reason ? `: ${s.cancel_reason}` : ''}. Nothing was paid.
        </p>
      )}
      {s.unpaid_in_old_system && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn">The old system shows this sale as not fully paid.</p>
      )}

      <section className="grid gap-x-6 gap-y-1 rounded-xl border border-line bg-panel p-4 text-sm sm:grid-cols-2">
        <p><span className="text-ink-soft">Date:</span> {when(s.paid_at ?? s.placed_at)}</p>
        <p><span className="text-ink-soft">Customer:</span> {s.customer ? `${s.customer.name}${s.customer.phone ? ` · ${s.customer.phone}` : ''}` : 'Walk-in'}</p>
        <p><span className="text-ink-soft">Sold by:</span> {s.sold_by ?? '—'}</p>
        <p><span className="text-ink-soft">Cashier:</span> {s.checked_out_by ?? '—'}</p>
        {s.note && <p className="sm:col-span-2"><span className="text-ink-soft">Note:</span> {s.note}</p>}
      </section>

      <section className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  {l.item_id ? <Link href={`/products/${l.item_id}`} className="font-medium hover:underline">{l.name}</Link> : <span className="font-medium">{l.name}</span>}
                  <span className="block text-xs text-ink-soft">
                    {l.department}{l.codes?.length ? ` · ${l.codes.join(' / ')}` : ''}{l.price_tier === 'wholesale' ? ' · wholesale' : ''}
                  </span>
                  {l.returned > 0 && <span className="block text-xs font-medium text-warn">{l.returned} returned</span>}
                </td>
                <td className="tabular px-3 py-2 text-right">{l.qty}</td>
                <td className="tabular px-3 py-2 text-right">{naira(l.unit_price_kobo)}</td>
                <td className="tabular px-3 py-2 text-right">{naira(l.qty * l.unit_price_kobo - l.discount_kobo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line">
            {s.discount_kobo > 0 && <tr><td colSpan={3} className="px-3 py-1">Discount</td><td className="tabular px-3 py-1 text-right">-{naira(s.discount_kobo)}</td></tr>}
            <tr className="font-bold"><td colSpan={3} className="px-3 py-2">Total</td><td className="tabular px-3 py-2 text-right">{naira(s.total_kobo)}</td></tr>
            {s.payments.map((p, i) => (
              <tr key={i} className="text-ink-soft">
                <td colSpan={3} className="px-3 py-1">{METHOD[p.method] ?? p.method}{p.account ? ` (${p.account})` : ''}</td>
                <td className="tabular px-3 py-1 text-right">{naira(p.amount_kobo)}</td>
              </tr>
            ))}
            {s.refunded_kobo > 0 && <tr className="font-semibold text-warn"><td colSpan={3} className="px-3 py-1">Refunded</td><td className="tabular px-3 py-1 text-right">-{naira(s.refunded_kobo)}</td></tr>}
          </tfoot>
        </table>
      </section>

      {s.returns.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Returns</h2>
          {s.returns.map((r) => (
            <div key={r.id} className="rounded-lg bg-paper p-3 text-sm">
              <p className="font-medium">
                {when(r.at)}{r.by ? ` · ${r.by}` : ''} · refunded {naira(r.refund_kobo)}
                {r.refund_method ? ` by ${METHOD[r.refund_method] ?? r.refund_method}${r.account ? ` (${r.account})` : ''}` : ''}
              </p>
              <p className="text-ink-soft">{r.reason}</p>
              {r.items?.map((i, k) => (
                <p key={k}>{i.qty} × {i.name}: {i.outcome === 'faulty' ? 'faulty, kept out of stock' : 'back in stock'}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      {s.can_return && <ReturnForm sale={s} accounts={me.payment_accounts} />}
    </main>
  );
}
