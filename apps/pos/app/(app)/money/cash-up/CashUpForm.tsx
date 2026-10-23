'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira } from '@/lib/pos';
import { nairaToKobo } from '@/lib/products';

export type Figures = {
  since: string; sales: number;
  sales_cash_kobo: number; refunds_cash_kobo: number; expenses_cash_kobo: number; suppliers_cash_kobo: number; cash_in_kobo: number;
  by_account: { method: string; account: string | null; amount_kobo: number }[];
  default_float_kobo: number;
};

// Count the drawer. The system works out what should be there (float + cash taken − cash paid
// out); any difference needs a reason and is sent to the owner.
export default function CashUpForm({ figures: f }: { figures: Figures }) {
  const router = useRouter();
  const [float, setFloat] = useState(String(f.default_float_kobo / 100));
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const floatKobo = nairaToKobo(float) ?? 0;
  const expected = floatKobo + f.cash_in_kobo;
  const countedKobo = nairaToKobo(counted);
  const diff = countedKobo == null ? null : countedKobo - expected;
  const ready = countedKobo != null && (diff === 0 || note.trim()) && !busy;

  async function close() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_cash_up', { p_counted_kobo: countedKobo, p_float_kobo: floatKobo, p_note: note || null });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(diff === 0 ? 'Cash-up saved. The drawer balanced.' : `Cash-up saved, ${diff! < 0 ? 'short' : 'over'} ${naira(Math.abs(diff!))}. The owner has been told.`);
    setCounted(''); setNote('');
    router.refresh();
  }

  const row = (label: string, kobo: number, sign = '') => (
    <li className="flex justify-between py-1.5"><span>{label}</span><span className="tabular">{sign}{naira(kobo)}</span></li>
  );
  const field = 'rounded-lg border border-line bg-panel px-3 py-3 text-lg tabular';
  return (
    <div className="flex flex-col gap-4">
      {done && <p className="rounded-lg bg-brand-soft px-4 py-3 font-semibold text-brand">{done}</p>}
      <section className="rounded-xl border border-line bg-panel p-4">
        <p className="mb-2 text-sm text-ink-soft">
          Since {new Date(f.since).toLocaleString('en-NG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })} · {f.sales} sale{f.sales === 1 ? '' : 's'} you took payment for
        </p>
        <ul className="divide-y divide-line text-sm">
          {row('Float you started with', floatKobo)}
          {row('Cash from sales', f.sales_cash_kobo, '+ ')}
          {f.refunds_cash_kobo > 0 && row('Cash refunds', f.refunds_cash_kobo, '− ')}
          {f.expenses_cash_kobo > 0 && row('Cash expenses', f.expenses_cash_kobo, '− ')}
          {f.suppliers_cash_kobo > 0 && row('Cash paid to suppliers', f.suppliers_cash_kobo, '− ')}
          <li className="flex justify-between py-2 text-base font-bold"><span>Should be in the drawer</span><span className="tabular">{naira(expected)}</span></li>
        </ul>
      </section>

      {f.by_account.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="mb-1 font-semibold">Transfers and cards you took</h2>
          <p className="mb-2 text-sm text-ink-soft">Check each against the account’s app or POS terminal.</p>
          <ul className="divide-y divide-line text-sm">
            {f.by_account.map((a, i) => (
              <li key={i} className="flex justify-between py-1.5"><span className="capitalize">{a.method} · {a.account ?? '—'}</span><span className="tabular font-semibold">{naira(a.amount_kobo)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-brand bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Float (cash you started with), ₦
            <input inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Cash you counted in the drawer, ₦
            <input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus className={field} />
          </label>
        </div>
        {diff != null && (
          <p className={`rounded-lg px-4 py-3 font-semibold ${diff === 0 ? 'bg-brand-soft text-brand' : 'bg-bad-soft text-bad'}`}>
            {diff === 0 ? 'Balanced.' : `${diff < 0 ? 'Short' : 'Over'} by ${naira(Math.abs(diff))}. Say why below.`}
          </p>
        )}
        {diff != null && diff !== 0 && (
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" className="rounded-lg border border-line px-3 py-3" />
        )}
        {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
        <button onClick={close} disabled={!ready} className="rounded-lg bg-brand px-5 py-3 font-bold text-white disabled:opacity-40">
          {busy ? 'Saving…' : 'Save cash-up'}
        </button>
      </section>
    </div>
  );
}
