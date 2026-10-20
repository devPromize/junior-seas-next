import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { can, FLOOR_COOKIE, type Me } from '@/lib/pos';
import { chooseFloor, signOut } from './actions';

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
  const floorId = Number((await cookies()).get(FLOOR_COOKIE)?.value);
  const floor = me.floors.find((f) => f.id === floorId);

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

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 font-semibold">Which floor is this device on today?</h2>
        <form action={chooseFloor} className="flex flex-wrap gap-2">
          {me.floors.map((f) => (
            <button
              key={f.id}
              name="floor_id"
              value={f.id}
              className={`rounded-lg border px-4 py-3 text-left font-medium ${
                f.id === floor?.id ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-panel'
              }`}
            >
              {f.name}
            </button>
          ))}
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {can(me, 'sales.create') && (
          <Tile title="Sell" note="Scan items, add the customer, place the order" ready={!!floor} href="/sell" />
        )}
        {can(me, 'sales.checkout') && (
          <Tile title="Checkout queue" note="Orders waiting to be paid on this floor" ready={false} />
        )}
        {can(me, 'sales.discount') && (
          <Tile title={me.has_pin ? 'Change my PIN' : 'Set my PIN'} note="Used to approve large discounts at the till" ready={false} />
        )}
      </section>

      {!floor && <p className="text-sm text-warn">Choose a floor to start selling.</p>}
    </main>
  );
}

function Tile({ title, note, ready, href }: { title: string; note: string; ready: boolean; href?: string }) {
  const body = (
    <>
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-ink-soft">{note}</p>
      {!ready && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
          {href ? 'Choose a floor first' : 'Coming next'}
        </p>
      )}
    </>
  );
  if (ready && href) {
    return (
      <Link href={href} className="rounded-xl border border-brand bg-panel p-4 hover:bg-brand-soft">
        {body}
      </Link>
    );
  }
  return <div className="rounded-xl border border-line bg-panel p-4 opacity-60">{body}</div>;
}
