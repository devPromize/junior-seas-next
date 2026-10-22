'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { koboToNaira, nairaToKobo, type Product, type ProductOptions } from '@/lib/products';

// Add or edit a product. Fields a person isn't allowed to change are shown but locked.
export default function ProductForm({ options, product }: { options: ProductOptions; product?: Product }) {
  const router = useRouter();
  const isNew = !product;
  const can = options.can;
  const canDetails = can.manage;
  const canPrice = isNew ? can.manage : can.prices;

  const categoryName = (id: number | null | undefined) => options.categories.find((c) => c.id === id)?.name ?? '';
  const brandName = (id: number | null | undefined) => options.brands.find((b) => b.id === id)?.name ?? '';

  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [category, setCategory] = useState(categoryName(product?.category_id));
  const [brand, setBrand] = useState(brandName(product?.brand_id));
  const [price, setPrice] = useState(koboToNaira(product?.price_kobo));
  const [minPrice, setMinPrice] = useState(koboToNaira(product?.min_price_kobo));
  const [wholesale, setWholesale] = useState(koboToNaira(product?.wholesale_price_kobo));
  const [wholesaleQty, setWholesaleQty] = useState(product?.wholesale_min_qty ? String(product.wholesale_min_qty) : '');
  const [cost, setCost] = useState(koboToNaira(product?.cost_kobo));
  const [tracksImei, setTracksImei] = useState(product?.tracks_imei ?? false);
  const [warranty, setWarranty] = useState(product?.warranty_days ? String(product.warranty_days) : '');
  const [showOnline, setShowOnline] = useState(product?.show_online ?? false);
  const [active, setActive] = useState(product?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    // Send only what this person may change; the database checks again anyway.
    const fields: Record<string, unknown> = {};
    if (canDetails) {
      Object.assign(fields, {
        name, sku, tracks_imei: tracksImei, show_online: showOnline, is_active: active,
        warranty_days: warranty ? Number(warranty) : null,
      });
      const cat = options.categories.find((c) => c.name.toLowerCase() === category.trim().toLowerCase());
      if (cat) fields.category_id = cat.id; else if (category.trim()) fields.category_name = category;
      const br = options.brands.find((b) => b.name.toLowerCase() === brand.trim().toLowerCase());
      if (br) fields.brand_id = br.id; else if (brand.trim()) fields.brand_name = brand;
    }
    if (canPrice) Object.assign(fields, { price_kobo: nairaToKobo(price), min_price_kobo: nairaToKobo(minPrice) });
    if (can.wholesale) Object.assign(fields, { wholesale_price_kobo: nairaToKobo(wholesale), wholesale_min_qty: wholesaleQty ? Number(wholesaleQty) : null });
    if (can.costs) fields.cost_kobo = nairaToKobo(cost);

    const { data, error } = await createClient().rpc('pos_save_product', { p_id: product?.id ?? null, p_fields: fields });
    setBusy(false);
    if (error) return setError(error.message);
    if (isNew) return router.push(`/products/${data.id}`);
    setSaved(true);
    router.refresh();
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5 disabled:bg-paper disabled:text-ink-soft';
  const label = 'flex flex-col gap-1 text-sm font-medium';
  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <section className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>
          Name *
          <input required value={name} onChange={(e) => setName(e.target.value)} disabled={!canDetails} className={field} />
        </label>
        <label className={label}>
          Barcode
          <input value={sku} onChange={(e) => setSku(e.target.value)} disabled={!canDetails} placeholder="Leave empty to make one up" className={field} />
        </label>
        <label className={label}>
          Category
          <input list="categories" value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canDetails}
            placeholder="Choose or type a new one" className={field} />
          <datalist id="categories">{options.categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </label>
        <label className={label}>
          Brand
          <input list="brands" value={brand} onChange={(e) => setBrand(e.target.value)} disabled={!canDetails}
            placeholder="Choose or type a new one" className={field} />
          <datalist id="brands">{options.brands.map((b) => <option key={b.id} value={b.name} />)}</datalist>
        </label>
        <label className={label}>
          Warranty (days)
          <input inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value.replace(/\D/g, ''))}
            disabled={!canDetails} placeholder="None" className={field} />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input type="checkbox" checked={tracksImei} onChange={(e) => setTracksImei(e.target.checked)} disabled={!canDetails} className="h-5 w-5" />
          Tracked by IMEI or serial number (phones, laptops, tablets)
        </label>
      </section>

      <section className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
        <label className={label}>
          Selling price, ₦ *
          <input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!canPrice} className={`${field} tabular`} />
        </label>
        <label className={label}>
          Lowest price allowed, ₦
          <input inputMode="decimal" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} disabled={!canPrice} placeholder="No minimum" className={`${field} tabular`} />
        </label>
        {can.wholesale && (
          <>
            <label className={label}>
              Wholesale price, ₦
              <input inputMode="decimal" value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="No wholesale price" className={`${field} tabular`} />
            </label>
            <label className={label}>
              Wholesale from (pieces)
              <input inputMode="numeric" value={wholesaleQty} onChange={(e) => setWholesaleQty(e.target.value.replace(/\D/g, ''))} placeholder="Any quantity" className={`${field} tabular`} />
            </label>
          </>
        )}
        {can.costs && (
          <label className={label}>
            Cost price, ₦
            <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={`${field} tabular`} />
            <span className="font-normal text-ink-soft">Updated automatically when stock is received.</span>
          </label>
        )}
      </section>

      {canDetails && (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
            On sale (untick to hide it from Sell without deleting it)
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={showOnline} onChange={(e) => setShowOnline(e.target.checked)} className="h-5 w-5" />
            Show on the website
          </label>
        </section>
      )}

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      {saved && <p className="rounded-lg bg-brand-soft px-4 py-3 text-brand">Saved.</p>}
      {(canDetails || canPrice || can.wholesale || can.costs) && (
        <button disabled={busy} className="self-start rounded-lg bg-brand px-5 py-3 font-bold text-white disabled:opacity-40">
          {busy ? 'Saving…' : isNew ? 'Add product' : 'Save changes'}
        </button>
      )}
    </form>
  );
}
