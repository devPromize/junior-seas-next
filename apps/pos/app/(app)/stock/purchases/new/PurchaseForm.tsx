'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira, type PaymentAccount } from '@/lib/pos';
import { nairaToKobo, type ProductOptions, type ProductRow } from '@/lib/products';
import ProductPicker from '@/components/ProductPicker';
import NewProductInline from '@/components/NewProductInline';
import PhoneScanner from '@/components/PhoneScanner';
import SupplierPicker, { type Supplier } from '@/components/SupplierPicker';
import DocumentUploader, { type UploadedDoc } from '@/components/DocumentUploader';

type Line = { key: number; product: ProductRow; qty: string; cost: string; price: string; wholesale: string; codes: string[] };

// Record a purchase: supplier, department, the items (phones scanned by IMEI), their cost, and
// optionally new selling and wholesale prices, as staff did on the old system. Photos or a PDF
// of the supplier's receipt can be attached.
export default function PurchaseForm({
  options, accounts, canPay,
}: { options: ProductOptions; accounts: PaymentAccount[]; canPay: boolean }) {
  const router = useRouter();
  const [paid, setPaid] = useState<'not_yet' | 'in_full'>('not_yet');
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer'>('transfer');
  const [payAccount, setPayAccount] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState(options.departments[0]?.id ?? 0);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [creating, setCreating] = useState<string | null>(null);   // what was typed, for a brand-new product
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const qtyOf = (l: Line) => (l.product.tracks_imei ? l.codes.length : Number(l.qty) || 0);
  const pieces = lines.reduce((s, l) => s + qtyOf(l), 0);
  const totalCost = lines.reduce((s, l) => s + qtyOf(l) * (nairaToKobo(l.cost) ?? 0), 0);

  function add(p: ProductRow, cost = '', wholesale = '') {
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines((ls) => [...ls, { key: Date.now(), product: p, qty: p.tracks_imei ? '' : '1', cost, price: '', wholesale, codes: [] }]);
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
        new_wholesale_kobo: options.can.wholesale ? nairaToKobo(l.wholesale) : null,
        ...(l.product.tracks_imei ? { codes: l.codes } : { qty: Number(l.qty) }),
      })),
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    // Paid on the spot: record the payment too. If that fails the purchase is still saved, and
    // its page shows what's owed with a "Record payment" form.
    if (canPay && paid === 'in_full' && data.total_cost_kobo > 0) {
      await createClient().rpc('pos_pay_supplier', {
        p_delivery_id: data.delivery_id, p_amount_kobo: data.total_cost_kobo,
        p_paid_on: new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }),
        p_method: payMethod, p_account_id: payMethod === 'cash' ? null : payAccount,
      });
    }
    setBusy(false);
    router.push(`/stock/purchases/${data.delivery_id}?new=1`);
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';
  const missingCost = lines.some((l) => !(nairaToKobo(l.cost) ?? 0));
  const ready = lines.length > 0 && lines.every((l) => qtyOf(l) > 0) && !missingCost
    && (paid === 'not_yet' || payMethod === 'cash' || payAccount) && !busy;
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
        <ProductPicker onPick={(p) => add(p)} departmentId={departmentId} placeholder="Search or scan a product to add"
          onCreate={options.can.manage ? (typed) => setCreating(typed) : undefined} />
        {creating != null && (
          <NewProductInline typed={creating} options={options} onCancel={() => setCreating(null)}
            onCreated={(p, cost) => { add(p, cost); setCreating(null); }}
            onUseExisting={(p) => { add(p); setCreating(null); }} />
        )}
        {lines.length === 0 && <p className="text-sm text-ink-soft">Add the products on the supplier’s receipt.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((l) => (
            <li key={l.key} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-48 flex-1 font-medium">
                  {l.product.name}
                  <span className="block text-xs font-normal text-ink-soft">
                    selling at {naira(nairaToKobo(l.price) ?? l.product.price_kobo)}
                    {(() => {
                      const cost = nairaToKobo(l.cost) ?? 0;
                      const sell = nairaToKobo(l.price) ?? l.product.price_kobo;
                      if (!cost || !sell) return null;
                      const m = Math.round(((sell - cost) / sell) * 100);
                      return <span className={m < 0 ? 'font-semibold text-bad' : ''}> · {m < 0 ? 'below cost!' : `margin ${m}%`}</span>;
                    })()}
                  </span>
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
                    placeholder="Required" className={`${field} tabular w-28 ${l.cost ? '' : 'border-warn'}`} />
                </label>
                {options.can.prices && (
                  <label className="flex items-center gap-2 text-sm">
                    New selling price, ₦
                    <input inputMode="decimal" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })}
                      placeholder="Keep" className={`${field} tabular w-28`} />
                  </label>
                )}
                {options.can.wholesale && (
                  <label className="flex items-center gap-2 text-sm">
                    Wholesale, ₦
                    <input inputMode="decimal" value={l.wholesale} onChange={(e) => update(l.key, { wholesale: e.target.value })}
                      placeholder={l.product.wholesale_price_kobo != null ? String(l.product.wholesale_price_kobo / 100) : 'None'}
                      className={`${field} tabular w-28`} />
                  </label>
                )}
                <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-sm text-bad underline">Remove</button>
              </div>
              {l.product.tracks_imei && (
                <PhoneScanner codes={l.codes} onChange={(codes) => update(l.key, { codes })}
                  takenElsewhere={(code) => lines.some((x) => x.key !== l.key && x.codes.some((c) => c.split('/').includes(code)))} />
              )}
            </li>
          ))}
        </ul>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={field} />
      </section>

      {canPay && lines.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-4">
          <span className="font-semibold">Has the supplier been paid?</span>
          <div className="flex overflow-hidden rounded-lg border border-line text-sm">
            {([['not_yet', 'Not yet'], ['in_full', 'Paid in full']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPaid(k)}
                className={`px-3 py-2 font-medium ${paid === k ? 'bg-brand text-white' : 'bg-panel'}`}>{label}</button>
            ))}
          </div>
          {paid === 'in_full' && (
            <>
              <div className="flex overflow-hidden rounded-lg border border-line text-sm">
                {(['transfer', 'cash'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => { setPayMethod(m); setPayAccount(null); }}
                    className={`px-3 py-2 font-medium capitalize ${payMethod === m ? 'bg-brand text-white' : 'bg-panel'}`}>{m}</button>
                ))}
              </div>
              {payMethod === 'transfer' && (
                <select value={payAccount ?? ''} onChange={(e) => setPayAccount(Number(e.target.value) || null)} className={field}>
                  <option value="">From which account?</option>
                  {accounts.filter((a) => a.transfer).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </>
          )}
          {paid === 'not_yet' && <span className="text-sm text-ink-soft">It’ll show under Money → Supplier bills until it’s paid.</span>}
        </section>
      )}

      {missingCost && lines.length > 0 && <p className="text-sm text-warn">Enter the cost of each item: it’s how we know what’s owed and what each sale makes.</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      <button onClick={save} disabled={!ready} className="self-start rounded-lg bg-brand px-5 py-3 font-bold text-white disabled:opacity-40">
        {busy ? 'Saving…' : `Save purchase · ${pieces} piece${pieces === 1 ? '' : 's'}${totalCost ? ` · ${naira(totalCost)}` : ''}`}
      </button>
    </div>
  );
}
