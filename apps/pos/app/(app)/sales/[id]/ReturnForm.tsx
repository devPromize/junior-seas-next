'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira, type PaymentAccount } from '@/lib/pos';
import { nairaToKobo } from '@/lib/products';
import type { Sale } from './page';

type Pick = { qty: number; outcome: 'back_in_stock' | 'faulty' };
type Method = 'cash' | 'transfer' | 'card';
const REASONS = ['Changed their mind', 'Faulty', 'Wrong item', 'Doesn’t fit their phone'];

// Take items back from a sale: how many, whether each goes back on the shelf or is faulty, why,
// and how much is refunded (worked out from what they paid, never more than that).
export default function ReturnForm({ sale, accounts }: { sale: Sale; accounts: PaymentAccount[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<string | null>(null);   // null = use the worked-out amount
  const [method, setMethod] = useState<Method>('cash');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const left = (l: Sale['lines'][number]) => l.qty - l.returned;
  const paidEach = (l: Sale['lines'][number]) => Math.round((l.qty * l.unit_price_kobo - l.discount_kobo) / l.qty);
  const owed = useMemo(
    () => sale.lines.reduce((s, l) => s + (picks[l.id]?.qty ?? 0) * paidEach(l), 0),
    [picks, sale.lines]
  );
  const maxRefund = sale.total_kobo - sale.refunded_kobo;
  const refundKobo = refund == null ? Math.min(owed, maxRefund) : nairaToKobo(refund) ?? 0;
  const chosen = Object.entries(picks).filter(([, p]) => p.qty > 0);
  const accountsFor = accounts.filter((a) => (method === 'transfer' ? a.transfer : method === 'card' ? a.card : false));
  const ready = chosen.length > 0 && reason.trim() && refundKobo <= maxRefund && (method === 'cash' || refundKobo === 0 || accountId) && !busy;

  function toggle(id: number, maxQty: number) {
    setPicks((p) => (p[id] ? Object.fromEntries(Object.entries(p).filter(([k]) => Number(k) !== id))
                           : { ...p, [id]: { qty: maxQty === 1 ? 1 : 1, outcome: 'back_in_stock' } }));
    setRefund(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_return_sale', {
      p_sale_id: sale.id,
      p_lines: chosen.map(([id, p]) => ({ sale_line_id: Number(id), qty: p.qty, outcome: p.outcome })),
      p_reason: reason,
      p_refund_kobo: refundKobo,
      p_refund_method: refundKobo > 0 ? method : null,
      p_refund_account_id: refundKobo > 0 && method !== 'cash' ? accountId : null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setOpen(false);
    setPicks({});
    setReason('');
    setRefund(null);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} disabled={!sale.lines.some((l) => left(l) > 0)}
        className="self-start rounded-lg border border-bad px-4 py-2.5 font-semibold text-bad disabled:opacity-40">
        Return items
      </button>
    );
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2';
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-bad bg-panel p-4">
      <h2 className="text-lg font-semibold">Return items</h2>

      <ul className="flex flex-col divide-y divide-line">
        {sale.lines.filter((l) => left(l) > 0).map((l) => {
          const p = picks[l.id];
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
              <label className="flex min-w-56 flex-1 items-center gap-2">
                <input type="checkbox" checked={!!p} onChange={() => toggle(l.id, left(l))} className="h-5 w-5" />
                <span>
                  <span className="font-medium">{l.name}</span>
                  <span className="block text-xs text-ink-soft">{l.codes?.join(' / ') ?? `${left(l)} can be returned`} · paid {naira(paidEach(l))} each</span>
                </span>
              </label>
              {p && left(l) > 1 && (
                <label className="flex items-center gap-2 text-sm">
                  How many
                  <select value={p.qty} onChange={(e) => { setPicks({ ...picks, [l.id]: { ...p, qty: Number(e.target.value) } }); setRefund(null); }} className={field}>
                    {Array.from({ length: left(l) }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
                  </select>
                </label>
              )}
              {p && (
                <div className="flex overflow-hidden rounded-lg border border-line text-sm">
                  {(['back_in_stock', 'faulty'] as const).map((o) => (
                    <button key={o} type="button" onClick={() => setPicks({ ...picks, [l.id]: { ...p, outcome: o } })}
                      className={`px-3 py-2 font-medium ${p.outcome === o ? (o === 'faulty' ? 'bg-bad text-white' : 'bg-brand text-white') : 'bg-panel'}`}>
                      {o === 'faulty' ? 'Faulty' : 'Back in stock'}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Why?</p>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1 text-sm ${reason === r ? 'border-bad bg-bad-soft text-bad' : 'border-line'}`}>{r}</button>
          ))}
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type the reason" className={field} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Refund, ₦ <span className="font-normal text-ink-soft">(at most {naira(maxRefund)})</span>
          <input inputMode="decimal" value={refund ?? String(refundKobo / 100)} onChange={(e) => setRefund(e.target.value)} className={`${field} tabular w-40`} />
        </label>
        {refundKobo > 0 && (
          <>
            <div className="flex overflow-hidden rounded-lg border border-line text-sm">
              {(['cash', 'transfer', 'card'] as const).map((m) => (
                <button key={m} type="button" onClick={() => { setMethod(m); setAccountId(null); }}
                  className={`px-3 py-2 font-medium capitalize ${method === m ? 'bg-brand text-white' : 'bg-panel'}`}>{m}</button>
              ))}
            </div>
            {method !== 'cash' && (
              <select value={accountId ?? ''} onChange={(e) => setAccountId(Number(e.target.value) || null)} className={field}>
                <option value="">From which account?</option>
                {accountsFor.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>
      {refundKobo === 0 && chosen.length > 0 && <p className="text-sm text-ink-soft">No money back: e.g. an exchange, or a repair under warranty.</p>}

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={submit} disabled={!ready} className="rounded-lg bg-bad px-5 py-3 font-bold text-white disabled:opacity-40">
          {busy ? 'Saving…' : refundKobo > 0 ? `Return and refund ${naira(refundKobo)}` : 'Return without refund'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-5 py-3 font-semibold">Cancel</button>
      </div>
    </section>
  );
}
