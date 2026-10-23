'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type Account = { id: number; name: string; transfer: boolean; card: boolean; online: boolean; is_active: boolean };
type Draft = Omit<Account, 'id'> & { id: number | null };

const EMPTY: Draft = { id: null, name: '', transfer: true, card: false, online: false, is_active: true };

export default function AccountsEditor({ rows }: { rows: Account[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(d: Draft) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_save_payment_account', {
      p_id: d.id, p_name: d.name, p_transfer: d.transfer, p_card: d.card, p_online: d.online, p_is_active: d.is_active,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDraft(null);
    router.refresh();
  }

  const takes = (a: Account | Draft) => [a.transfer && 'transfers', a.card && 'cards', a.online && 'online payments'].filter(Boolean).join(', ');
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <p className="text-sm text-ink-soft">
        Where transfers, card payments and online payments go. Cashiers pick one of these for every non-cash payment,
        so each account can be checked against its bank app.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-48 flex-1">
              <span className={`block font-semibold ${a.is_active ? '' : 'text-ink-soft line-through'}`}>{a.name}</span>
              <span className="text-sm text-ink-soft">Takes {takes(a)}</span>
            </span>
            <button onClick={() => setDraft({ ...a })} className="text-sm font-medium underline">Edit</button>
            <button onClick={() => save({ ...a, is_active: !a.is_active })} disabled={busy} className="text-sm font-medium underline">
              {a.is_active ? 'Stop using' : 'Use again'}
            </button>
          </li>
        ))}
      </ul>

      {draft ? (
        <form className="flex flex-col gap-3 rounded-lg bg-paper p-3" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
          <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Account name, e.g. Moniepoint" className="rounded-lg border border-line bg-panel px-3 py-2.5" />
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            {(['transfer', 'card', 'online'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} className="h-5 w-5" />
                {k === 'transfer' ? 'Bank transfers' : k === 'card' ? 'Card (POS terminal)' : 'Online payments'}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button disabled={busy || !draft.name.trim()} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">Save</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-line px-4 py-2">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setDraft({ ...EMPTY })} className="self-start rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Add an account</button>
      )}
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
    </section>
  );
}
