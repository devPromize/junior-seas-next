'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira, type PaymentAccount } from '@/lib/pos';
import { nairaToKobo } from '@/lib/products';

type Method = 'cash' | 'transfer' | 'card';
const todayInLagos = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });   // YYYY-MM-DD

// Record a payment to a supplier: amount (the full balance unless changed), the date it was
// paid, how, and from which account. The database refuses overpaying and future dates.
export default function PaySupplierForm({
  deliveryId, owedKobo, accounts, compact = false,
}: { deliveryId: string; owedKobo: number; accounts: PaymentAccount[]; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [amount, setAmount] = useState(String(owedKobo / 100));
  const [paidOn, setPaidOn] = useState(todayInLagos());
  const [method, setMethod] = useState<Method>('transfer');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountsFor = accounts.filter((a) => (method === 'transfer' ? a.transfer : method === 'card' ? a.card : false));
  const kobo = nairaToKobo(amount) ?? 0;
  const ready = kobo > 0 && kobo <= owedKobo && paidOn && (method === 'cash' || accountId) && !busy;

  async function pay() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_pay_supplier', {
      p_delivery_id: deliveryId, p_amount_kobo: kobo, p_paid_on: paidOn, p_method: method,
      p_account_id: method === 'cash' ? null : accountId, p_reference: reference || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
    if (compact) setOpen(false);
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">Record payment</button>;
  }
  const field = 'rounded-lg border border-line bg-panel px-3 py-2';
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Amount paid, ₦
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tabular w-36`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Date paid
          <input type="date" value={paidOn} max={todayInLagos()} onChange={(e) => setPaidOn(e.target.value)} className={field} />
        </label>
        <div className="flex overflow-hidden rounded-lg border border-line text-sm">
          {(['transfer', 'cash', 'card'] as const).map((m) => (
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
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className={`${field} w-40`} />
      </div>
      {kobo > owedKobo && <p className="text-sm text-bad">Only {naira(owedKobo)} is owed.</p>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button onClick={pay} disabled={!ready} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">
          {busy ? 'Saving…' : kobo === owedKobo ? `Paid in full · ${naira(kobo)}` : `Record ${naira(kobo)}`}
        </button>
        {compact && <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-4 py-2">Cancel</button>}
      </div>
    </div>
  );
}
