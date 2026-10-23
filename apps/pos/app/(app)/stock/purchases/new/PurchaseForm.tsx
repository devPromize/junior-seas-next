'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira } from '@/lib/pos';
import { nairaToKobo, type ProductOptions, type ProductRow } from '@/lib/products';
import ProductPicker from '@/components/ProductPicker';
import SupplierPicker, { type Supplier } from '@/components/SupplierPicker';
import DocumentUploader, { type UploadedDoc } from '@/components/DocumentUploader';

type Line = { key: number; product: ProductRow; qty: string; cost: string; price: string; codes: string[]; scan: string };

// Record a purchase: supplier, department, the items (phones scanned by IMEI), their cost, and
// optionally a new selling price, as staff did on the old system. Photos or a PDF of the
// supplier's receipt can be attached.
export default function PurchaseForm({ options }: { options: ProductOptions }) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState(options.departments[0]?.id ?? 0);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const qtyOf = (l: Line) => (l.product.tracks_imei ? l.codes.length : Number(l.qty) || 0);
  const pieces = lines.reduce((s, l) => s + qtyOf(l), 0);
  const totalCost = lines.reduce((s, l) => s + qtyOf(l) * (nairaToKobo(l.cost) ?? 0), 0);

  function add(p: ProductRow) {
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines((ls) => [...ls, { key: Date.now(), product: p, qty: p.tracks_imei ? '' : '1', cost: '', price: '', codes: [], scan: '' }]);
  }
  function addCode(l: Line) {
    const code = l.scan.trim();
    if (!code) return;
    if (lines.some((x) => x.codes.includes(code))) return setError(`${code} is already in this purchase.`);
    setError(null);
    update(l.key, { codes: [...l.codes, code], scan: '' });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc('pos_record_purchase', {
      p_floor_id: departmentId,
      p_supplier_id: supplier?.id ?? null,
      p_supplier_ref: invoice || null,
      p_note: note || null,
      p_document_ids: docs.map((d) => d.id),
      p_lines: lines.map((l) => ({
        item_id: l.product.id,
        unit_cost_kobo: nairaToKobo(l.cost),
        new_price_kobo: options.can.prices ? nairaToKobo(l.price) : null,
        ...(l.product.tracks_imei ? { codes: l.codes } : { qty: Number(l.qty) }),
      })),
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.push(`/stock/purchases/${data.delivery_id}?new=1`);
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';
  const ready = lines.length > 0 && lines.every((l) => qtyOf(l) > 0) && !busy;
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Supplier
          <SupplierPicker suppliers={options.suppliers} value={supplier} onChange={setSupplier} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Into department
          <select value={departmentId} onChange={(e) => setDepartmentId(Number(e.target.value))} className={field}>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Supplier’s invoice / receipt no.
          <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Optional" className={field} />
        </label>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <DocumentUploader onUploaded={(d) => setDocs((ds) => [...ds, d])} />
          {docs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {docs.map((d) => (
                <span key={d.id} className="flex items-center gap-2 rounded-lg border border-line bg-paper p-1 pr-3 text-xs">
                  {d.preview ? <img src={d.preview} alt="" className="h-12 w-12 rounded object-cover" /> : <span className="px-2 font-bold">PDF</span>}
                  {d.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <ProductPicker onPick={add} departmentId={departmentId} placeholder="Search or scan a product to add" />
        {lines.length === 0 && <p className="text-sm text-ink-soft">Add the products on the supplier’s receipt.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((l) => (
            <li key={l.key} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-48 flex-1 font-medium">
                  {l.product.name}
                  <span className="block text-xs font-normal text-ink-soft">selling at {naira(l.product.price_kobo)}</span>
                </span>
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
                    placeholder="Optional" className={`${field} tabular w-28`} />
                </label>
                {options.can.prices && (
                  <label className="flex items-center gap-2 text-sm">
                    New selling price, ₦
                    <input inputMode="decimal" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })}
                      placeholder="Keep" className={`${field} tabular w-28`} />
                  </label>
                )}
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
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={field} />
      </section>

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      <button onClick={save} disabled={!ready} className="self-start rounded-lg bg-brand px-5 py-3 font-bold text-white disabled:opacity-40">
        {busy ? 'Saving…' : `Save purchase · ${pieces} piece${pieces === 1 ? '' : 's'}${totalCost ? ` · ${naira(totalCost)}` : ''}`}
      </button>
    </div>
  );
}
