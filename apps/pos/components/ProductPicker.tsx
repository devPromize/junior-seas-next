'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira } from '@/lib/pos';
import type { ProductRow } from '@/lib/products';

// Search box that finds a product by name, barcode or IMEI and hands it back. A barcode
// scanner works too: it types the code and presses Enter. With onCreate, the list also offers
// to add what was typed as a new product (for stock the shop has never had before).
export default function ProductPicker({
  onPick, onCreate, placeholder = 'Search or scan a product', departmentId,
}: { onPick: (p: ProductRow) => void; onCreate?: (typed: string) => void; placeholder?: string; departmentId?: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [looking, setLooking] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }
    const ticket = ++latest.current;
    setLooking(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('pos_products', { p_search: q, p_limit: 8 });
      if (ticket !== latest.current) return;   // a newer search has started
      setRows((data?.rows ?? []) as ProductRow[]);
      setLooking(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, supabase]);

  function pick(p: ProductRow) {
    onPick(p);
    setQuery('');
    setRows([]);
  }

  return (
    <div className="relative">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} autoComplete="off"
        onKeyDown={(e) => { if (e.key === 'Enter' && rows.length === 1) { e.preventDefault(); pick(rows[0]); } }}
        className="w-full rounded-lg border border-line bg-panel px-3 py-3" />
      {query.trim().length >= 2 && (
        <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-line bg-panel shadow-lg">
          {looking && rows.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">Searching…</li>}
          {!looking && rows.length === 0 && !onCreate && <li className="px-3 py-2 text-sm text-ink-soft">No products match.</li>}
          {rows.map((p) => {
            const here = departmentId != null ? p.by_department[String(departmentId)] ?? 0 : p.stock;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p)} className="flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-paper">
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="text-xs text-ink-soft">{p.sku}{p.tracks_imei ? ' · tracked by IMEI' : ''} · {here} in stock</span>
                  </span>
                  <span className="tabular text-sm">{naira(p.price_kobo)}</span>
                </button>
              </li>
            );
          })}
          {onCreate && !looking && (
            <li className="border-t border-line">
              <button type="button" onClick={() => { onCreate(query.trim()); setQuery(''); setRows([]); }}
                className="w-full px-3 py-2 text-left font-semibold text-brand hover:bg-paper">
                + Add “{query.trim().toUpperCase()}” as a new product
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
