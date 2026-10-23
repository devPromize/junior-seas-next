'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NoteForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().rpc('pos_add_customer_note', { p_customer_id: customerId, p_body: body });
    setBusy(false);
    if (!error) {
      setBody('');
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="flex gap-2">
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Wants the next iPhone when it arrives"
        className="flex-1 rounded-lg border border-line px-3 py-2" />
      <button disabled={busy || !body.trim()} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">Add</button>
    </form>
  );
}
