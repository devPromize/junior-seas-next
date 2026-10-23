import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import DuplicateGroup, { type Group } from './DuplicateGroup';
import MergeSimple from './MergeSimple';

// Products saved more than once in the old system, grouped by name, to merge into one each.
export default async function DuplicatesPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'products.manage')) redirect('/products');
  const { data, error } = await (await createClient()).rpc('pos_duplicate_groups');
  const groups = (data ?? []) as Group[];
  const simple = groups.filter((g) => g.same_price && !g.mixed_imei);
  const needChoice = groups.filter((g) => !g.same_price || g.mixed_imei);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <Link href="/products" className="text-sm font-medium underline">← Products</Link>
      <h1 className="text-2xl font-bold">Duplicate products</h1>
      <p className="text-ink-soft">
        The same product saved more than once splits its stock and sales across copies. Merging keeps one, moves the
        others’ stock, phones and sales history onto it, and keeps their old barcodes working. Nothing is deleted.
      </p>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}
      {groups.length === 0 && <p className="rounded-lg bg-brand-soft px-4 py-3 font-semibold text-brand">No duplicates left.</p>}

      {simple.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-4">
          <p className="font-semibold">
            {simple.length} group{simple.length === 1 ? '' : 's'} where every copy has the same price
            ({simple.reduce((s, g) => s + g.copies.length - 1, 0)} extra copies)
          </p>
          <p className="text-sm">These can all be merged in one go, each into its most recently used copy.</p>
          <MergeSimple groups={simple.length} />
        </section>
      )}

      {needChoice.length > 0 && (
        <>
          <h2 className="mt-2 text-lg font-semibold">{needChoice.length} need a decision</h2>
          <p className="text-sm text-ink-soft">
            The copies have different prices (usually the price at each delivery), so choose which price to keep.
            The suggested copy is the one used most recently.
          </p>
          {needChoice.map((g) => <DuplicateGroup key={g.name} group={g} canPrice={can(me, 'prices.edit')} />)}
        </>
      )}
      {simple.length > 0 && (
        <details className="rounded-xl border border-line bg-panel p-4">
          <summary className="cursor-pointer font-semibold">See the {simple.length} same-price groups one by one</summary>
          <div className="mt-3 flex flex-col gap-3">
            {simple.map((g) => <DuplicateGroup key={g.name} group={g} canPrice={can(me, 'prices.edit')} />)}
          </div>
        </details>
      )}
    </main>
  );
}
