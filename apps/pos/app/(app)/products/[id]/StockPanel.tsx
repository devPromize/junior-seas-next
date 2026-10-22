'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira } from '@/lib/pos';
import { REASON_LABEL, type Product, type ProductOptions } from '@/lib/products';

const STATUS_LABEL: Record<string, string> = { in_stock: 'In stock', held: 'In an unpaid order', faulty: 'Faulty', missing: 'Missing' };

// Stock per department (with a shelf count), each phone in stock, and the product's history.
export default function StockPanel({ product, can }: { product: Product; can: ProductOptions['can'] }) {
  const router = useRouter();
  const [counting, setCounting] = useState<{ departmentId: number; counted: string; reason: string } | null>(null);
  const [phoneAction, setPhoneAction] = useState<{ code: string; status: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const departmentName = (id: number) => product.stock.find((s) => s.department_id === id)?.department ?? '';

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc(fn, args);
    setBusy(false);
    if (error) return setError(error.message);
    setCounting(null);
    setPhoneAction(null);
    router.refresh();
  }

  const box = 'rounded-xl border border-line bg-panel p-4';
  const field = 'rounded-lg border border-line bg-panel px-3 py-2';
  return (
    <div className="flex flex-col gap-4">
      <section className={box}>
        <h2 className="mb-2 font-semibold">Stock</h2>
        <ul className="flex flex-col divide-y divide-line">
          {product.stock.map((s) => (
            <li key={s.department_id} className="flex flex-col gap-2 py-2">
              <div className="flex items-center justify-between gap-3">
                <span>{s.department}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular text-lg font-bold">{s.qty}</span>
                  {can.adjust && !product.tracks_imei && (
                    <button onClick={() => setCounting({ departmentId: s.department_id, counted: String(s.qty), reason: '' })}
                      className="text-sm font-medium underline">Count</button>
                  )}
                </span>
              </div>
              {counting?.departmentId === s.department_id && (
                <form className="flex flex-wrap gap-2 rounded-lg bg-paper p-2"
                  onSubmit={(e) => { e.preventDefault(); run('pos_count_stock', { p_item_id: product.id, p_floor_id: s.department_id, p_counted: Number(counting.counted), p_reason: counting.reason }); }}>
                  <input autoFocus inputMode="numeric" value={counting.counted} aria-label="Counted on the shelf"
                    onChange={(e) => setCounting({ ...counting, counted: e.target.value.replace(/\D/g, '') })} className={`${field} tabular w-24`} />
                  <input value={counting.reason} placeholder="Why is it different?" onChange={(e) => setCounting({ ...counting, reason: e.target.value })}
                    className={`${field} min-w-40 flex-1`} />
                  <button disabled={busy || counting.counted === '' || !counting.reason.trim()} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">Save count</button>
                  <button type="button" onClick={() => setCounting(null)} className="rounded-lg border border-line px-3 py-2">Cancel</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {product.tracks_imei && (
        <section className={box}>
          <h2 className="mb-2 font-semibold">Phones ({product.phones.filter((p) => p.status === 'in_stock').length} in stock)</h2>
          {product.phones.length === 0 && <p className="text-sm text-ink-soft">None in stock.</p>}
          <ul className="flex max-h-96 flex-col divide-y divide-line overflow-y-auto">
            {product.phones.map((p) => {
              const code = p.codes?.[0] ?? '';
              return (
                <li key={p.unit_id} className="flex flex-col gap-1 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono">{p.codes?.join(' / ')}</span>
                    <span className={p.status === 'in_stock' ? 'text-brand' : 'text-warn'}>{STATUS_LABEL[p.status] ?? p.status}</span>
                    <span className="text-ink-soft">{departmentName(p.department_id)}</span>
                    {p.cost_kobo != null && <span className="tabular text-ink-soft">cost {naira(p.cost_kobo)}</span>}
                    {can.adjust && p.status !== 'held' && (
                      <span className="ml-auto flex gap-2">
                        {(p.status === 'in_stock' ? ['missing', 'faulty'] : ['in_stock']).map((st) => (
                          <button key={st} onClick={() => setPhoneAction({ code, status: st, reason: '' })} className="font-medium underline">
                            {st === 'in_stock' ? 'Back in stock' : st === 'missing' ? 'Missing' : 'Faulty'}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                  {phoneAction?.code === code && (
                    <form className="flex flex-wrap gap-2 rounded-lg bg-paper p-2"
                      onSubmit={(e) => { e.preventDefault(); run('pos_set_phone_status', { p_code: code, p_status: phoneAction.status, p_reason: phoneAction.reason }); }}>
                      <input autoFocus value={phoneAction.reason} placeholder="Why?" onChange={(e) => setPhoneAction({ ...phoneAction, reason: e.target.value })}
                        className={`${field} min-w-40 flex-1`} />
                      <button disabled={busy || !phoneAction.reason.trim()} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">
                        Mark {STATUS_LABEL[phoneAction.status].toLowerCase()}
                      </button>
                      <button type="button" onClick={() => setPhoneAction(null)} className="rounded-lg border border-line px-3 py-2">Cancel</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}

      <section className={box}>
        <h2 className="mb-2 font-semibold">History</h2>
        {product.history.length === 0 && <p className="text-sm text-ink-soft">No stock changes yet.</p>}
        <ul className="flex flex-col divide-y divide-line text-sm">
          {product.history.map((h, i) => (
            <li key={i} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
              <span>
                <span className="font-medium">{REASON_LABEL[h.reason] ?? h.reason}</span>
                <span className="text-ink-soft"> · {h.department}{h.code ? ` · ${h.code}` : ''}{h.by ? ` · ${h.by}` : ''}</span>
                {h.note && <span className="block text-ink-soft">{h.note}</span>}
              </span>
              <span className="text-right">
                <span className={`tabular block font-semibold ${h.qty > 0 ? 'text-brand' : 'text-bad'}`}>{h.qty > 0 ? `+${h.qty}` : h.qty}</span>
                <span className="text-xs text-ink-soft">
                  {new Date(h.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
