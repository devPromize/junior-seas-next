'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function MergeSimple({ groups }: { groups: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function merge() {
    setBusy(true);
    const { data, error } = await createClient().rpc('pos_merge_simple_duplicates');
    setBusy(false);
    setConfirming(false);
    if (error) return setMessage(error.message);
    setMessage(`Merged ${data.groups} products: ${data.copies} extra copies retired.`);
    router.refresh();
  }

  if (message) return <p className="font-semibold text-brand">{message}</p>;
  if (!confirming) {
    return <button onClick={() => setConfirming(true)} className="self-start rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Merge all {groups}</button>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Merge {groups} groups now? This can’t be undone from the screen.</span>
      <button onClick={merge} disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">{busy ? 'Merging…' : 'Yes, merge them'}</button>
      <button onClick={() => setConfirming(false)} className="rounded-lg border border-line bg-panel px-4 py-2">Cancel</button>
    </div>
  );
}
