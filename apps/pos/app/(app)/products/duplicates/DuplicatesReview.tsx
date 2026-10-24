'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import DuplicateGroup from './DuplicateGroup';
import { bigGap, chosenPrice, initialChoice, mergeableCopies, type Choice, type Group } from '@/lib/duplicates';

// Every group that needs a price decision, with the suggestion already chosen. Change only the
// ones you disagree with, then merge them all in one go (or one at a time).
export default function DuplicatesReview({ groups, canPrice }: { groups: Group[]; canPrice: boolean }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(groups.map((g) => [g.name, initialChoice(g)])));
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const set = (name: string, c: Choice) => setChoices((all) => ({ ...all, [name]: c }));
  const ready = groups.filter((g) => {
    const c = choices[g.name];
    return c.status !== 'done' && c.checked && chosenPrice(c) && mergeableCopies(g, c).length > 0;
  });
  const waiting = groups.filter((g) => bigGap(g) && !choices[g.name].checked && choices[g.name].status !== 'done').length;
  const done = groups.filter((g) => choices[g.name].status === 'done').length;

  async function mergeOne(g: Group) {
    const c = choices[g.name];
    const kept = g.copies.find((x) => x.id === c.keep)!;
    const price = chosenPrice(c);
    set(g.name, { ...c, status: 'merging' });
    const { error } = await createClient().rpc('pos_merge_products', {
      p_keep: c.keep, p_merge: mergeableCopies(g, c).map((x) => x.id),
      p_price_kobo: canPrice && price !== kept.price_kobo ? price : null,
    });
    set(g.name, { ...c, status: error ? 'error' : 'done', error: error?.message });
    return !error;
  }

  async function mergeAll() {
    setConfirming(false);
    setRunning(true);
    for (const g of ready) await mergeOne(g);   // one at a time, so one problem doesn't stop the rest
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-brand bg-panel p-3 shadow">
        <span className="font-semibold">
          {done > 0 && `${done} merged · `}{ready.length} ready to merge{waiting > 0 ? ` · ${waiting} need checking first` : ''}
        </span>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} disabled={running || ready.length === 0}
            className="ml-auto rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40">
            {running ? 'Merging…' : `Merge all ${ready.length} with the prices shown`}
          </button>
        ) : (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-sm">Merge {ready.length} groups at the prices shown?</span>
            <button onClick={mergeAll} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">Yes, merge</button>
            <button onClick={() => setConfirming(false)} className="rounded-lg border border-line px-4 py-2">Cancel</button>
          </span>
        )}
      </div>
      {groups.map((g) => (
        <DuplicateGroup key={g.name} group={g} choice={choices[g.name]} canPrice={canPrice}
          onChange={(c) => set(g.name, c)} onMerge={() => mergeOne(g)} />
      ))}
    </div>
  );
}
