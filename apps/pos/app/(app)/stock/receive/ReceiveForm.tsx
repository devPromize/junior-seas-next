'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira } from '@/lib/pos';
import { nairaToKobo, type ProductOptions, type ProductRow } from '@/lib/products';
import ProductPicker from '@/components/ProductPicker';

type Line = { key: number; product: ProductRow; qty: string; cost: string; codes: string[]; scan: string };

// Receive a delivery into one department. Phones are scanned one by one (a dual-SIM phone can
// have both IMEIs scanned with "/" between them); everything else is a quantity.
export default function ReceiveForm({ options }: { options: ProductOptions }) {
  const [departmentId, setDepartmentId] = useState(options.departments[0]?.id ?? 0);
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const qtyOf = (l: Line) => (l.product.tracks_imei ? l.codes.length : Number(l.qty) || 0);
  const pieces = lines.reduce((s, l) => s + qtyOf(l), 0);
  const totalCost = lines.reduce((s, l) => s + qtyOf(l) * (nairaToKobo(l.cost) ?? 0), 0);

  function add(p: ProductRow) {
    setDone(null);
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines((ls) => [...ls, { key: Date.now(), product: p, qty: p.tracks_imei ? '' : '1', cost: '', codes: [], scan: '' }]);
  }

  function addCode(l: Line) {
    const code = l.scan.trim();
    if (!code) return;
    if (lines.some((x) => x.codes.includes(code))) return setError(`${code} is already in this delivery.`);
    setError(null);
    update(l.key, { codes: [...l.codes, code], scan: '' });
  }

  async function receive() {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc('pos_receive_stock', {
      p_floor_id: departmentId,
      p_lines: lines.map((l) => ({
        item_id: l.product.id,
        unit_cost_kobo: nairaToKobo(l.cost),
        ...(l.product.tracks_imei ? { codes: l.codes } : { qty: Number(l.qty) }),
      })),
      p_supplier: supplier || null,
      p_supplier_ref: invoice || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    const dept = options.departments.find((d) => d.id === departmentId)?.name;
    setDone(`Received ${data.pieces} piece${data.pieces === 1 ? '' : 's'} into ${dept}${data.total_cost_kobo ? ` · cost ${naira(data.total_cost_kobo)}` : ''}.`);
    setLines([]);
    setInvoice('');
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';
  const ready = lines.length > 0 && lines.every((l) => qtyOf(l) > 0) && !busy;
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Into
          <select value={departmentId} onChange={(e) => setDepartmentId(Number(e.target.value))} className={field}>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Supplier
          <input list="suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Choose or type a new one" className={field} />
          <datalist id="suppliers">{options.suppliers.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Supplier’s invoice no.
          <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Optional" className={field} />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <ProductPicker onPick={add} departmentId={departmentId} placeholder="Search or scan a product to add" />
        {lines.length === 0 && <p className="text-sm text-ink-soft">Add the products in this delivery.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((l) => (
            <li key={l.key} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-48 flex-1 font-medium">{l.product.name}</span>
                {!l.product.tracks_imei && (
                  <label className="flex items-center gap-2 text-sm">
                    Qty
                    <input inputMode="numeric" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value.replace(/\D/g, '') })}
                      className={`${field} tabular w-20`} />
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  Cost each, ₦
                  <input inputMode="decimal" value={l.cost} onChange={(e) => update(l.key, { cost: e.target.value })}
                    placeholder="Optional" className={`${field} tabular w-32`} />
                </label>
                <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-sm text-bad underline">Remove</button>
              </div>
              {l.product.tracks_imei && (
                <div className="flex flex-col gap-2 rounded-lg bg-paper p-3">
                  <input value={l.scan} onChange={(e) => update(l.key, { scan: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCode(l); } }}
                    placeholder="Scan each IMEI or serial, then Enter. Dual-SIM: IMEI 1 / IMEI 2" className={`${field} font-mono`} />
                  <p className="text-sm font-medium">{l.codes.length} scanned</p>
                  <div className="flex flex-wrap gap-2">
                    {l.codes.map((c) => (
                      <button key={c} onClick={() => update(l.key, { codes: l.codes.filter((x) => x !== c) })} title="Remove"
                        className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-xs">{c} ×</button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      {done && <p className="rounded-lg bg-brand-soft px-4 py-3 font-medium text-brand">{done}</p>}
      <button onClick={receive} disabled={!ready} className="self-start rounded-lg bg-brand px-5 py-3 font-bold text-white disabled:opacity-40">
        {busy ? 'Receiving…' : `Receive ${pieces} piece${pieces === 1 ? '' : 's'}${totalCost ? ` · ${naira(totalCost)}` : ''}`}
      </button>
    </div>
  );
}
