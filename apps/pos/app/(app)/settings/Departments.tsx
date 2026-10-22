'use client';

import { useState } from 'react';
import { saveDepartment } from './actions';

export type DepartmentRow = { id: number; name: string; is_active: boolean; items_in_stock: number; staff: number };

// The shop's departments. Adding one makes it available everywhere straight away: staff can be
// given access to it, and stock can be received into it.
export default function Departments({ rows }: { rows: DepartmentRow[] }) {
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(id: number | null, name: string, active = true) {
    setBusy(true);
    setError(null);
    const res = await saveDepartment(id, name, active);
    setBusy(false);
    if (res.error) return setError(res.error);
    setAdding('');
    setEditing(null);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div>
        <h2 className="text-lg font-semibold">Departments</h2>
        <p className="text-sm text-ink-soft">Each department has its own stock. Staff only see the departments you give them.</p>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
            {editing?.id === d.id ? (
              <form className="flex flex-1 flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(d.id, editing.name, d.is_active); }}>
                <input autoFocus value={editing.name} onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                  className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2" />
                <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">Save</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-line px-4 py-2 font-semibold">Cancel</button>
              </form>
            ) : (
              <>
                <span className="min-w-48 flex-1">
                  <span className={`block font-semibold ${d.is_active ? '' : 'text-ink-soft line-through'}`}>{d.name}</span>
                  <span className="text-sm text-ink-soft">
                    {d.items_in_stock.toLocaleString()} products in stock · {d.staff} staff
                  </span>
                </span>
                <button onClick={() => setEditing({ id: d.id, name: d.name })} className="text-sm font-medium underline">Rename</button>
                <button onClick={() => run(d.id, d.name, !d.is_active)} disabled={busy} className="text-sm font-medium underline">
                  {d.is_active ? 'Hide' : 'Bring back'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form className="flex flex-wrap gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); run(null, adding); }}>
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New department, e.g. Electrical & Electronic Appliances"
          className="min-w-48 flex-1 rounded-lg border border-line px-3 py-3" />
        <button disabled={busy || !adding.trim()} className="rounded-lg bg-brand px-4 py-3 font-semibold text-white disabled:opacity-40">
          Add department
        </button>
      </form>
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
    </section>
  );
}
