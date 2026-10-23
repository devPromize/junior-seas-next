'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira } from '@/lib/pos';
import { nairaToKobo, type ProductOptions, type ProductRow } from '@/lib/products';

// Add a product the shop has never stocked, without leaving the purchase. Just what's needed
// to sell it: name, category, brand, phone or not, and the selling price. Everything else
// can be filled in later on the product's page. The cost goes on the purchase line.
export default function NewProductInline({
  typed, options, onCreated, onCancel,
}: {
  typed: string; options: ProductOptions;
  onCreated: (product: ProductRow, cost: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(typed.toUpperCase());
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [tracksImei, setTracksImei] = useState(false);
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costKobo = nairaToKobo(cost) ?? 0;
  const priceKobo = nairaToKobo(price) ?? 0;
  const margin = costKobo > 0 && priceKobo > 0 ? Math.round(((priceKobo - costKobo) / priceKobo) * 100) : null;

  async function create() {
    setBusy(true);
    setError(null);
    const fields: Record<string, unknown> = { name, price_kobo: priceKobo, tracks_imei: tracksImei, sku: barcode || null };
    const cat = options.categories.find((c) => c.name.toLowerCase() === category.trim().toLowerCase());
    if (cat) fields.category_id = cat.id; else if (category.trim()) fields.category_name = category;
    const br = options.brands.find((b) => b.name.toLowerCase() === brand.trim().toLowerCase());
    if (br) fields.brand_id = br.id; else if (brand.trim()) fields.brand_name = brand;
    if (options.can.costs && costKobo) fields.cost_kobo = costKobo;
    const { data, error } = await createClient().rpc('pos_save_product', { p_id: null, p_fields: fields });
    setBusy(false);
    if (error) return setError(error.message);
    onCreated({
      id: data.id, sku: data.sku, name: name.trim().toUpperCase(), category: category || null, brand: brand || null,
      price_kobo: priceKobo, wholesale_price_kobo: null, cost_kobo: null, tracks_imei: tracksImei,
      is_active: true, show_online: false, stock: 0, by_department: {},
    }, cost);
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2';
  const label = 'flex flex-col gap-1 text-sm font-medium';
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand bg-brand-soft/40 p-4">
      <p className="font-semibold">New product</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>Name *
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className={label}>Category
          <input list="np-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Choose or type a new one" className={field} />
          <datalist id="np-categories">{options.categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </label>
        <label className={label}>Brand
          <input list="np-brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Choose or type a new one" className={field} />
          <datalist id="np-brands">{options.brands.map((b) => <option key={b.id} value={b.name} />)}</datalist>
        </label>
        <label className={label}>Cost each, ₦ *
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={`${field} tabular`} />
        </label>
        <label className={label}>Selling price, ₦ *
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} tabular`} />
          {margin != null && (
            <span className={`font-normal ${margin < 0 ? 'text-bad' : 'text-ink-soft'}`}>
              {margin < 0 ? 'Selling below cost!' : `Margin ${margin}% (${naira(priceKobo - costKobo)} each)`}
            </span>
          )}
        </label>
        <label className={label}>Barcode on the box
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan it, or leave empty" className={field} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input type="checkbox" checked={tracksImei} onChange={(e) => setTracksImei(e.target.checked)} className="h-5 w-5" />
          Phone, laptop or tablet (tracked by IMEI or serial)
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button onClick={create} disabled={busy || !name.trim() || !costKobo || !priceKobo}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">
          {busy ? 'Adding…' : 'Add product to this purchase'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-line bg-panel px-4 py-2">Cancel</button>
      </div>
    </div>
  );
}
