'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Perm = { code: string; label: string; warning: string | null; sensitive: boolean; from_role: boolean; override: boolean | null; effective: boolean };

// Owner only: give this one person a permission their role doesn't have (e.g. "Manage bank and
// card accounts" for one trusted manager), or take one away, without changing their role.
export default function StaffPermissions({ userId, roleName }: { userId: string; roleName: string }) {
  const [perms, setPerms] = useState<Perm[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await createClient().rpc('pos_staff_permissions', { p_user: userId });
    if (error) return setError(error.message);
    setPerms(data as Perm[]);
  }
  useEffect(() => { load(); }, [userId]);   // reload when a different person is opened

  async function set(code: string, granted: boolean | null) {
    setBusy(code);
    setError(null);
    const { error } = await createClient().rpc('pos_set_staff_permission', { p_user: userId, p_code: code, p_granted: granted });
    setBusy(null);
    if (error) return setError(error.message);
    load();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div>
        <h2 className="font-semibold">What this person can do</h2>
        <p className="text-sm text-ink-soft">
          Ticks come from their role ({roleName}). Change one here to make an exception for this person only. Every change is logged.
        </p>
      </div>
      {!perms && !error && <p className="text-sm text-ink-soft">Loading…</p>}
      <ul className="flex flex-col divide-y divide-line">
        {perms?.map((p) => (
          <li key={p.code} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <label className="flex min-w-64 flex-1 items-start gap-2">
              <input type="checkbox" checked={p.effective} disabled={busy === p.code} className="mt-0.5 h-5 w-5"
                onChange={(e) => set(p.code, e.target.checked === p.from_role ? null : e.target.checked)} />
              <span>
                <span className="font-medium">{p.label}</span>
                {p.override !== null && (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${p.override ? 'bg-brand-soft text-brand' : 'bg-bad-soft text-bad'}`}>
                    {p.override ? 'Given to them only' : 'Taken away from them'}
                  </span>
                )}
                {p.effective && p.sensitive && p.warning && <span className="block text-xs text-warn">{p.warning}</span>}
              </span>
            </label>
            {p.override !== null && (
              <button onClick={() => set(p.code, null)} disabled={busy === p.code} className="text-xs underline">Back to the role</button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
