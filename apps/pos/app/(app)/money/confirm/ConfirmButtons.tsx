'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ConfirmButtons({ paymentId }: { paymentId: number }) {
  const router = useRouter();
  const [notReceived, setNotReceived] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(received: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_confirm_payment', { p_payment_id: paymentId, p_received: received, p_note: note || null });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {!notReceived ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => decide(true)} disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">Received ✓</button>
          <button onClick={() => setNotReceived(true)} disabled={busy} className="rounded-lg border border-bad px-4 py-2 font-semibold text-bad">Not received ✗</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? e.g. Boss checked, nothing came in"
            className="min-w-64 flex-1 rounded-lg border border-line px-3 py-2" />
          <button onClick={() => decide(false)} disabled={busy || !note.trim()} className="rounded-lg bg-bad px-4 py-2 font-semibold text-white disabled:opacity-40">
            Mark not received
          </button>
          <button onClick={() => setNotReceived(false)} className="rounded-lg border border-line px-4 py-2">Back</button>
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
