'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ProductOptions, ProductRow } from '@/lib/products';
import ProductPicker from '@/components/ProductPicker';

type Line = { key: number; product: ProductRow; qty: string } | { key: number; code: string };

// Move stock from one department to another: phones by scanning their IMEI, other products by
// quantity. The move is recorded on both sides.
export default function MoveForm({ options }: { options: ProductOptions }) {
  const [from, setFrom] = useState(options.departments[0].id);
  const [to, setTo] = useState(options.departments[1].id);
  const [lines, setLines] = useState<Line[]>([]);
  const [scan, setScan] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const name = (id: number) => options.departments.find((d) => d.id === id)?.name ?? '';

  function addProduct(p: ProductRow) {
    setDone(null);
    if (p.tracks_imei) return setError(`Scan the IMEI of each ${p.name} you’re moving.`);
    setError(null);
    if (lines.some((l) => 'product' in l && l.product.id === p.id)) return;
    setLines((ls) => [...ls, { key: Date.now(), product: p, qty: '1' }]);
  }
  function addCode() {
    const code = scan.trim();
    if (!code) return;
    setDone(null);
    if (!lines.some((l) => 'code' in l && l.code === code)) setLines((ls) => [...ls, { key: Date.now(), code }]);
    setScan('');
  }

  async function move() {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc('pos_move_stock', {
      p_from: from, p_to: to, p_note: note || null,
      p_lines: lines.map((l) => ('code' in l ? { code: l.code } : { item_id: l.product.id, qty: Number(l.qty) })),
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(`Moved ${data.pieces} piece${data.pieces === 1 ? '' : 's'} from ${name(from)} to ${name(to)}.`);
    setLines([]);
    setNote('');
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';
  const ready = lines.length > 0 && from !== to && lines.every((l) => 'code' in l || Number(l.qty) > 0) && !busy;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          From
          <select value={from} className={field} onChange={(e) => {
            const id = Number(e.target.value);
            setFrom(id);
            if (to === id) setTo(options.departments.find((d) => d.id !== id)!.id);
            setLines([]);
          }}>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <span className="pb-3 text-xl">→</span>
        <label className="flex flex-col gap-1 text-sm font-medium">
          To
          <select value={to} onChange={(e) => setTo(Number(e.target.value))} className={field}>
            {options.departments.filter((d) => d.id !== from).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </section>

      <section className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
        <ProductPicker onPick={addProduct} departmentId={from} placeholder="Search a product to move" />
        <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCode(); } }}
          placeholder="Or scan a phone’s IMEI, then Enter" className={`${field} font-mono`} />
        <ul className="flex flex-col divide-y divide-line sm:col-span-2">
          {lines.map((l) => (
            <li key={l.key} className="flex flex-wrap items-center gap-3 py-2">
              {'code' in l ? (
                <span className="flex-1 font-mono">Phone {l.code}</span>
              ) : (
                <>
                  <span className="min-w-48 flex-1 font-medium">
                    {l.product.name}
                    <span className="block text-xs font-normal text-ink-soft">{l.product.by_department[String(from)] ?? 0} in {name(from)}</span>
                  </span>
                  <input inputMode="numeric" value={l.qty} aria-label="Quantity"
                    onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...l, qty: e.target.value.replace(/\D/g, '') } : x)))}
                    className={`${field} tabular w-20`} />
                </>
              )}
              <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-sm text-bad underline">Remove</button>
            </li>
          ))}
        </ul>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${field} sm:col-span-2`} />
      </section>

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      {done && <p className="rounded-lg bg-brand-soft px-4 py-3 font-medium text-brand">{done}</p>}
      <button onClick={move} disabled={!ready} className="self-start rounded-lg bg-brand px-5 py-3 font-bold text-white disabled:opacity-40">
        {busy ? 'Moving…' : `Move to ${name(to)}`}
      </button>
    </div>
  );
}
