'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira } from '@/lib/pos';
import { nairaToKobo } from '@/lib/products';

export type Copy = {
  id: number; sku: string; price_kobo: number; wholesale_price_kobo: number | null; cost_kobo: number | null; tracks_imei: boolean;
  stock: number; sold: number; last_sold: string | null; last_bought: string | null; category: string | null; brand: string | null;
};
export type Group = { name: string; stock: number; suggested_keep: number; same_price: boolean; mixed_imei: boolean; copies: Copy[] };

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');

// One product saved several times: pick the copy to keep and the price, then merge.
export default function DuplicateGroup({ group: g, canPrice }: { group: Group; canPrice: boolean }) {
  const router = useRouter();
  const [keep, setKeep] = useState(g.suggested_keep);
  const kept = g.copies.find((c) => c.id === keep)!;
  const prices = [...new Set(g.copies.map((c) => c.price_kobo))].sort((a, b) => b - a);
  const [price, setPrice] = useState<string>(String(kept.price_kobo));
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mergeable = g.copies.filter((c) => c.id !== keep && c.tracks_imei === kept.tracks_imei);
  const left = g.copies.filter((c) => c.id !== keep && c.tracks_imei !== kept.tracks_imei);
  const chosenPrice = price === 'custom' ? nairaToKobo(custom) : Number(price);

  async function merge() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_merge_products', {
      p_keep: keep, p_merge: mergeable.map((c) => c.id),
      p_price_kobo: canPrice && chosenPrice !== kept.price_kobo ? chosenPrice : null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    router.refresh();
  }

  if (done) return <p className="rounded-xl border border-brand bg-brand-soft p-4 font-semibold text-brand">{g.name}: merged into one.</p>;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{g.name}</h3>
        <span className="text-sm text-ink-soft">{g.copies.length} copies · {g.stock} in stock altogether</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-ink-soft">
            <tr>
              <th className="py-1 pr-2 font-medium">Keep</th>
              <th className="py-1 pr-2 font-medium">Barcode</th>
              <th className="py-1 pr-2 text-right font-medium">Price</th>
              <th className="py-1 pr-2 text-right font-medium">In stock</th>
              <th className="py-1 pr-2 text-right font-medium">Sold</th>
              <th className="py-1 pr-2 font-medium">Last sold</th>
              <th className="py-1 font-medium">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {g.copies.map((c) => (
              <tr key={c.id} className={c.id === keep ? 'bg-brand-soft' : ''}>
                <td className="py-1.5 pr-2">
                  <input type="radio" name={`keep-${g.name}`} checked={c.id === keep}
                    onChange={() => { setKeep(c.id); setPrice(String(c.price_kobo)); }} className="h-4 w-4" />
                </td>
                <td className="py-1.5 pr-2">
                  <Link href={`/products/${c.id}`} className="font-mono hover:underline">{c.sku}</Link>
                  {c.id === g.suggested_keep && <span className="ml-1 text-xs text-brand">suggested</span>}
                  {c.tracks_imei !== kept.tracks_imei && <span className="block text-xs text-bad">{c.tracks_imei ? 'tracked by IMEI' : 'not tracked by IMEI'}: can’t merge</span>}
                </td>
                <td className="tabular py-1.5 pr-2 text-right">{naira(c.price_kobo)}</td>
                <td className="tabular py-1.5 pr-2 text-right">{c.stock}</td>
                <td className="tabular py-1.5 pr-2 text-right">{c.sold}</td>
                <td className="py-1.5 pr-2">{date(c.last_sold)}</td>
                <td className="py-1.5 text-ink-soft">{c.category ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canPrice && prices.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Selling price after merging:</span>
          {prices.map((p) => (
            <button key={p} type="button" onClick={() => setPrice(String(p))}
              className={`rounded-full border px-3 py-1 ${price === String(p) ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line'}`}>
              {naira(p)}
            </button>
          ))}
          <button type="button" onClick={() => setPrice('custom')}
            className={`rounded-full border px-3 py-1 ${price === 'custom' ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line'}`}>Other</button>
          {price === 'custom' && (
            <input autoFocus inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="₦"
              className="tabular w-28 rounded-lg border border-line px-3 py-1" />
          )}
        </div>
      )}
      {left.length > 0 && (
        <p className="text-sm text-warn">{left.length} cop{left.length === 1 ? 'y' : 'ies'} can’t be merged with this one (phone vs. non-phone) and will be left as they are.</p>
      )}
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <button onClick={merge} disabled={busy || mergeable.length === 0 || !chosenPrice}
        className="self-start rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">
        {busy ? 'Merging…' : `Merge ${mergeable.length} cop${mergeable.length === 1 ? 'y' : 'ies'} into ${kept.sku}${chosenPrice ? ` at ${naira(chosenPrice)}` : ''}`}
      </button>
    </section>
  );
}
