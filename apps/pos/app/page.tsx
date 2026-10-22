import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can, type Me } from '@/lib/pos';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_me');

  if (error) {
    // Signed in, but not set up as staff (e.g. a website customer account).
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold">Not set up yet</h1>
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn">{error.message}</p>
        <form action={signOut}>
          <button className="rounded-lg border border-line bg-panel px-4 py-3 font-semibold">Sign out</button>
        </form>
      </main>
    );
  }

  const me = data as Me;

  // A rep's only job here is selling: skip the menu and open the Sell screen.
  if (can(me, 'sales.create') && !can(me, 'sales.checkout') && !can(me, 'sales.discount')) redirect('/sell');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Junior Seas POS</p>
          <h1 className="text-2xl font-bold">Hello, {me.name}</h1>
          <p className="text-ink-soft">{me.role}</p>
        </div>
        <form action={signOut}>
          <button className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">Sign out</button>
        </form>
      </header>

      {me.departments.length === 0 && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn">
          You haven’t been given access to any department yet. Ask the owner.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {can(me, 'sales.create') && (
          <Tile title="Sell" note="Scan items, add the customer, place the order" href="/sell" />
        )}
        {can(me, 'sales.checkout') && (
          <Tile title="Checkout queue" note="Orders waiting to be paid" />
        )}
        {can(me, 'sales.discount') && (
          <Tile title={me.has_pin ? 'Change my PIN' : 'Set my PIN'} note="Used to approve large discounts at the till" />
        )}
      </section>
    </main>
  );
}

function Tile({ title, note, href }: { title: string; note: string; href?: string }) {
  const body = (
    <>
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-ink-soft">{note}</p>
      {!href && <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Coming next</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} prefetch className="rounded-xl border border-brand bg-panel p-4 hover:bg-brand-soft">
        {body}
      </Link>
    );
  }
  return <div className="rounded-xl border border-line bg-panel p-4 opacity-60">{body}</div>;
}
