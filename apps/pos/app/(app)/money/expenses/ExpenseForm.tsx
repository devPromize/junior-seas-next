'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { naira, type Department, type PaymentAccount } from '@/lib/pos';
import { nairaToKobo } from '@/lib/products';
import DocumentUploader, { type UploadedDoc } from '@/components/DocumentUploader';

type Method = 'cash' | 'transfer' | 'card';
const todayInLagos = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

// Record an expense in a few taps: what kind, how much, what for, paid how. Date defaults to today.
export default function ExpenseForm({
  categories, accounts, departments,
}: { categories: { id: number; name: string }[]; accounts: PaymentAccount[]; departments: Department[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [spentOn, setSpentOn] = useState(todayInLagos());
  const [method, setMethod] = useState<Method>('cash');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const kobo = nairaToKobo(amount) ?? 0;
  const accountsFor = accounts.filter((a) => (method === 'transfer' ? a.transfer : method === 'card' ? a.card : false));
  const ready = categoryId && kobo > 0 && description.trim() && (method === 'cash' || accountId) && !busy;

  async function save() {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc('pos_record_expense', {
      p_spent_on: spentOn, p_category_id: categoryId, p_amount_kobo: kobo, p_method: method, p_description: description,
      p_account_id: method === 'cash' ? null : accountId, p_floor_id: departmentId, p_document_ids: docs.map((d) => d.id),
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(`${data.ref_no} saved: ${naira(kobo)}.`);
    setAmount(''); setDescription(''); setCategoryId(null); setDocs([]);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setOpen(true); setSaved(null); }} className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Record an expense</button>
        {saved && <span className="text-brand">{saved}</span>}
      </div>
    );
  }
  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-brand bg-panel p-4">
      <h2 className="font-semibold">Record an expense</h2>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => setCategoryId(c.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${categoryId === c.id ? 'border-brand bg-brand-soft text-brand' : 'border-line'}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Amount, ₦
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tabular w-36`} />
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">
          What was it for?
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 25 litres of diesel for the generator" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Date
          <input type="date" value={spentOn} max={todayInLagos()} onChange={(e) => setSpentOn(e.target.value)} className={field} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
        <select value={departmentId ?? ''} onChange={(e) => setDepartmentId(Number(e.target.value) || null)} className={field}>
          <option value="">Whole shop</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      {method === 'cash' && <p className="text-sm text-ink-soft">Cash taken from the till comes off your cash-up.</p>}
      <DocumentUploader label="Add receipt photo (optional)" onUploaded={(d) => setDocs((ds) => [...ds, d])} />
      {docs.length > 0 && <p className="text-sm text-ink-soft">{docs.length} photo{docs.length === 1 ? '' : 's'} attached</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={!ready} className="rounded-lg bg-brand px-5 py-2.5 font-bold text-white disabled:opacity-40">
          {busy ? 'Saving…' : kobo ? `Save · ${naira(kobo)}` : 'Save'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-5 py-2.5 font-semibold">Close</button>
      </div>
    </section>
  );
}
