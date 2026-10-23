'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Add someone who hasn't bought yet (e.g. an enquiry on WhatsApp). Same two required fields as
// at the till: phone and name.
export default function AddCustomer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [offers, setOffers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc('pos_save_customer', { p_phone: phone, p_name: name, p_consent_marketing: offers });
    setBusy(false);
    if (error) return setError(error.message);
    router.push(`/customers/${data.id}`);
  }

  if (!open) return <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Add customer</button>;
  const field = 'rounded-lg border border-line bg-panel px-3 py-2';
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 rounded-lg border border-brand bg-panel p-2">
      <input autoFocus inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone *" className={`${field} w-40`} />
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className={`${field} w-44`} />
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} className="h-4 w-4" /> Agrees to offers
      </label>
      <button disabled={busy} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">{busy ? 'Saving…' : 'Save'}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm underline">Cancel</button>
      {error && <span className="w-full text-sm text-bad">{error}</span>}
    </form>
  );
}
