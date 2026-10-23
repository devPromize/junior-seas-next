import { getMe } from '@/lib/me';
import { navFor } from '@/lib/nav';
import { can } from '@/lib/pos';
import { signOut } from '../actions';
import Sidebar from './Sidebar';

export const dynamic = 'force-dynamic';

// Every signed-in screen sits inside this: the sidebar on the left (a menu button on phones),
// the screen on the right.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, error } = await getMe();

  if (!me) {
    // Signed in, but not set up as staff (e.g. a website customer account).
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold">Not set up yet</h1>
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn">{error}</p>
        <form action={signOut}>
          <button className="rounded-lg border border-line bg-panel px-4 py-3 font-semibold">Sign out</button>
        </form>
      </main>
    );
  }

  const items = navFor(me).map(({ label, href }) => ({ label, href }));
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr] print:block">
      <Sidebar items={items} name={me.name} role={me.role} showPin={can(me, 'sales.discount')} unreadAlerts={me.unread_alerts} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
