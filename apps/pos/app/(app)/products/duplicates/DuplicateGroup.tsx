'use client';

import Link from 'next/link';
import { naira } from '@/lib/pos';
import { bigGap, chosenPrice, mergeableCopies, type Choice, type Group } from '@/lib/duplicates';

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');

// One product saved several times: the copies, which to keep, and the price after merging.
export default function DuplicateGroup({
  group: g, choice: c, onChange, onMerge, canPrice,
}: { group: Group; choice: Choice; onChange: (c: Choice) => void; onMerge: () => void; canPrice: boolean }) {
  const kept = g.copies.find((x) => x.id === c.keep)!;
  const prices = [...new Set(g.copies.map((x) => x.price_kobo))].sort((a, b) => b - a);
  const mergeable = mergeableCopies(g, c);
  const left = g.copies.length - 1 - mergeable.length;
  const price = chosenPrice(c);
  const gap = bigGap(g);

  if (c.status === 'done') {
    return <p className="rounded-xl border border-brand bg-brand-soft p-3 font-semibold text-brand">{g.name}: merged into one{price ? ` at ${naira(price)}` : ''}.</p>;
  }
  return (
    <section className={`flex flex-col gap-3 rounded-xl border bg-panel p-4 ${gap && !c.checked ? 'border-warn' : 'border-line'}`}>
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
            {g.copies.map((x) => (
              <tr key={x.id} className={x.id === c.keep ? 'bg-brand-soft' : ''}>
                <td className="py-1.5 pr-2">
                  <input type="radio" name={`keep-${g.name}`} checked={x.id === c.keep}
                    onChange={() => onChange({ ...c, keep: x.id, price: String(x.price_kobo) })} className="h-4 w-4" />
                </td>
                <td className="py-1.5 pr-2">
                  <Link href={`/products/${x.id}`} className="font-mono hover:underline">{x.sku}</Link>
                  {x.id === g.suggested_keep && <span className="ml-1 text-xs text-brand">suggested</span>}
                  {x.tracks_imei !== kept.tracks_imei && <span className="block text-xs text-bad">{x.tracks_imei ? 'tracked by IMEI' : 'not tracked by IMEI'}: can’t merge</span>}
                </td>
                <td className="tabular py-1.5 pr-2 text-right">{naira(x.price_kobo)}</td>
                <td className="tabular py-1.5 pr-2 text-right">{x.stock}</td>
                <td className="tabular py-1.5 pr-2 text-right">{x.sold}</td>
                <td className="py-1.5 pr-2">{date(x.last_sold)}</td>
                <td className="py-1.5 text-ink-soft">{x.category ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canPrice && prices.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Selling price after merging:</span>
          {prices.map((p) => (
            <button key={p} type="button" onClick={() => onChange({ ...c, price: String(p) })}
              className={`rounded-full border px-3 py-1 ${c.price === String(p) ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line'}`}>
              {naira(p)}
            </button>
          ))}
          <button type="button" onClick={() => onChange({ ...c, price: 'custom' })}
            className={`rounded-full border px-3 py-1 ${c.price === 'custom' ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line'}`}>Other</button>
          {c.price === 'custom' && (
            <input autoFocus inputMode="decimal" value={c.custom} onChange={(e) => onChange({ ...c, custom: e.target.value })} placeholder="₦"
              className="tabular w-28 rounded-lg border border-line px-3 py-1" />
          )}
        </div>
      )}
      {gap && (
        <label className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
          <input type="checkbox" checked={c.checked} onChange={(e) => onChange({ ...c, checked: e.target.checked })} className="h-4 w-4" />
          These prices are far apart. I’ve checked: they really are the same product, and the price above is right.
        </label>
      )}
      {left > 0 && (
        <p className="text-sm text-warn">{left} cop{left === 1 ? 'y' : 'ies'} can’t be merged with this one (phone vs. non-phone) and will be left as they are.</p>
      )}
      {c.status === 'error' && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{c.error}</p>}
      <button onClick={onMerge} disabled={c.status === 'merging' || mergeable.length === 0 || !price || !c.checked}
        className="self-start rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">
        {c.status === 'merging' ? 'Merging…' : `Merge ${mergeable.length} cop${mergeable.length === 1 ? 'y' : 'ies'} into ${kept.sku}${price ? ` at ${naira(price)}` : ''}`}
      </button>
    </section>
  );
}
