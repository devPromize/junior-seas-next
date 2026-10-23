'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type Supplier = { id: number; name: string };

// Pick a supplier from the list (most recently used first), or add a new one on the spot.
export default function SupplierPicker({
  suppliers, value, onChange,
}: { suppliers: Supplier[]; value: Supplier | null; onChange: (s: Supplier | null) => void }) {
  const [list, setList] = useState(suppliers);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list).slice(0, 12);
  }, [list, query]);
  const exact = list.some((s) => s.name.toLowerCase() === query.trim().toLowerCase());

  async function addNew() {
    setAdding(true);
    setError(null);
    const { data, error } = await createClient().rpc('pos_save_supplier', { p_id: null, p_name: query });
    setAdding(false);
    if (error) return setError(error.message);
    const s = { id: data.id as number, name: data.name as string };
    setList((l) => [s, ...l]);
    choose(s);
  }
  function choose(s: Supplier) {
    onChange(s);
    setQuery('');
    setOpen(false);
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand bg-brand-soft px-3 py-2.5">
        <span className="font-semibold text-brand">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-sm underline">Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Choose a supplier" autoComplete="off"
        className="w-full rounded-lg border border-line bg-panel px-3 py-2.5" />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-panel shadow-lg">
          {matches.map((s) => (
            <li key={s.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}
                className="w-full px-3 py-2 text-left hover:bg-paper">{s.name}</button>
            </li>
          ))}
          {query.trim() && !exact && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addNew} disabled={adding}
                className="w-full border-t border-line px-3 py-2 text-left font-semibold text-brand hover:bg-paper">
                {adding ? 'Adding…' : `+ Add new supplier “${query.trim().toUpperCase()}”`}
              </button>
            </li>
          )}
          {matches.length === 0 && !query.trim() && <li className="px-3 py-2 text-sm text-ink-soft">No suppliers yet.</li>}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}
