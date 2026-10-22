'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PinForm() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pin !== again) return setError('The two PINs don’t match.');
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_set_my_pin', { p_pin: pin });
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
    setPin('');
    setAgain('');
    router.refresh();
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-3 text-lg tracking-widest';
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        New PIN (4 to 6 digits)
        <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setSaved(false); }} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Type it again
        <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={again}
          onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} className={field} />
      </label>
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      {saved && <p className="rounded-lg bg-brand-soft px-4 py-3 text-brand">PIN saved.</p>}
      <button disabled={busy || pin.length < 4 || again.length < 4}
        className="rounded-lg bg-brand px-4 py-3 font-bold text-white disabled:opacity-40">
        {busy ? 'Saving…' : 'Save PIN'}
      </button>
    </form>
  );
}
