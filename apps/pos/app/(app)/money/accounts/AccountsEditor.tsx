'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type Account = {
  id: number; name: string; transfer: boolean; card: boolean; online: boolean; is_active: boolean;
  bank_name: string | null; account_number: string | null; account_name: string | null;
  holder: 'business' | 'personal'; needs_confirmation: boolean; confirm_before_sale: boolean; used: number;
};
type Draft = Omit<Account, 'id' | 'used'> & { id: number | null };
type Mode = 'none' | 'after' | 'before';

const EMPTY: Draft = {
  id: null, name: '', transfer: true, card: false, online: false, is_active: true,
  bank_name: '', account_number: '', account_name: '', holder: 'business', needs_confirmation: false, confirm_before_sale: false,
};
const MODES: { mode: Mode; label: string; help: string }[] = [
  { mode: 'none', label: 'No checking', help: 'The shop can see this account itself. The sale goes through at once.' },
  { mode: 'after', label: 'Confirm after the sale', help: 'The sale goes through at once. The owner and managers are alerted, and someone confirms in Money → Payments to confirm that the money arrived.' },
  { mode: 'before', label: 'Confirm before the goods go', help: 'The sale waits at the till until the owner or a manager confirms the money arrived. Phones stay held and nothing leaves stock until then. Use it for accounts you want to be sure of.' },
];
const modeOf = (a: Draft | Account): Mode => (a.confirm_before_sale ? 'before' : a.needs_confirmation || a.holder === 'personal' ? 'after' : 'none');

// Where customers' money goes. Each card machine gets its own entry, so each machine's daily total
// can be checked against its slip. Someone's personal account (e.g. Boss's) is allowed; payments
// into it are confirmed afterwards, or, if the owner chooses, before the sale completes.
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
      p_bank_name: d.bank_name || null, p_account_number: d.account_number || null, p_account_name: d.account_name || null,
      p_holder: d.holder, p_needs_confirmation: d.needs_confirmation, p_confirm_before_sale: d.confirm_before_sale,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDraft(null);
    router.refresh();
  }

  const takes = (a: Account | Draft) => [a.transfer && 'transfers', a.card && 'cards', a.online && 'online payments'].filter(Boolean).join(', ');
  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <p className="text-sm text-ink-soft">
        Where transfers, card payments and online payments go. Give each card machine (POS) its own entry, e.g.
        “Nombank POS – Phones floor”, so each machine’s daily total can be checked against its slip. Cashiers pick one
        of these for every non-cash payment, and their usual one is remembered.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-48 flex-1">
              <span className={`block font-semibold ${a.is_active ? '' : 'text-ink-soft line-through'}`}>
                {a.name}
                {a.holder === 'personal' && <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">Personal</span>}
                {a.confirm_before_sale
                  ? <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">Sale waits for confirmation</span>
                  : a.needs_confirmation && <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">Confirmed afterwards</span>}
              </span>
              <span className="text-sm text-ink-soft">
                {[a.bank_name, a.account_number, a.account_name].filter(Boolean).join(' · ') || 'No account details'} · takes {takes(a)}
                {a.used ? ` · used ${a.used.toLocaleString()} times` : ''}
              </span>
            </span>
            <button onClick={() => setDraft({ ...a, bank_name: a.bank_name ?? '', account_number: a.account_number ?? '', account_name: a.account_name ?? '' })}
              className="text-sm font-medium underline">Edit</button>
            <button onClick={() => save({ ...a, bank_name: a.bank_name ?? '', account_number: a.account_number ?? '', account_name: a.account_name ?? '', is_active: !a.is_active })}
              disabled={busy} className="text-sm font-medium underline">
              {a.is_active ? 'Stop using' : 'Use again'}
            </button>
          </li>
        ))}
      </ul>

      {draft ? (
        <form className="flex flex-col gap-3 rounded-lg bg-paper p-3" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
          <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name staff will see, e.g. “Boss – Access Bank” or “Nombank POS – Phones floor”" className={field} />
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={draft.bank_name ?? ''} onChange={(e) => setDraft({ ...draft, bank_name: e.target.value })} placeholder="Bank (e.g. Access Bank)" className={field} />
            <input inputMode="numeric" value={draft.account_number ?? ''} onChange={(e) => setDraft({ ...draft, account_number: e.target.value.replace(/[^\d ]/g, '') })}
              placeholder="Account number (10 digits)" className={`${field} tabular`} />
            <input value={draft.account_name ?? ''} onChange={(e) => setDraft({ ...draft, account_name: e.target.value })} placeholder="Account name" className={field} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            {(['transfer', 'card', 'online'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} className="h-5 w-5" />
                {k === 'transfer' ? 'Bank transfers' : k === 'card' ? 'Card (POS machine)' : 'Online payments'}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <span className="font-medium">Whose account is it?</span>
            <div className="flex flex-wrap gap-2">
              {([['business', 'The business’s'], ['personal', 'A person’s own (e.g. Boss’s)']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setDraft({ ...draft, holder: k, needs_confirmation: k === 'personal' ? true : draft.needs_confirmation })}
                  className={`rounded-full border px-3 py-1.5 font-medium ${draft.holder === k ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-panel'}`}>
                  {label}
                </button>
              ))}
            </div>
            <span className="mt-1 font-medium">Checking payments into it</span>
            <div className="flex flex-col gap-2">
              {MODES.map(({ mode, label, help }) => {
                // Personal accounts are always checked one way or the other.
                const blocked = mode === 'none' && draft.holder === 'personal';
                return (
                  <label key={mode} className={`flex items-start gap-2 ${blocked ? 'opacity-40' : ''}`}>
                    <input type="radio" name="confirm-mode" checked={modeOf(draft) === mode} disabled={blocked} className="mt-0.5 h-5 w-5"
                      onChange={() => setDraft({ ...draft, needs_confirmation: mode !== 'none', confirm_before_sale: mode === 'before' })} />
                    <span>
                      <span className="font-medium">{label}</span>
                      <span className="block text-ink-soft">{help}</span>
                    </span>
                  </label>
                );
              })}
            </div>
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
