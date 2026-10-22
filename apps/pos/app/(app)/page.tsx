import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { NAV, canSee, homeFor } from '@/lib/nav';
import { naira } from '@/lib/pos';

type Dashboard = {
  today: { total_kobo: number; sales: number; discount_kobo: number };
  by_department: { id: number; name: string; total_kobo: number }[] | null;
  last_7_days: { day: string; total_kobo: number }[];
  waiting_orders: number;
  unread_alerts: number;
};

// How is business today? Sales for the departments this person can see.
export default async function DashboardPage() {
  const { me } = await getMe();
  if (!me) return null;   // the layout explains why
  if (!canSee(me, NAV[0])) redirect(homeFor(me));   // e.g. a rep goes straight to Sell

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_dashboard');
  const d = data as Dashboard | null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Hello, {me.name}</h1>
        <p className="text-ink-soft">
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' })}
        </p>
      </header>

      {me.departments.length === 0 && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn">
          You haven’t been given access to any department yet. Ask the owner.
        </p>
      )}
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}

      {d && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sales today" value={naira(d.today.total_kobo)} note="after discounts" />
            <Stat label="Receipts today" value={d.today.sales.toLocaleString()} />
            <Stat label="Waiting to be paid" value={d.waiting_orders.toLocaleString()} note="orders at checkout" />
            <Stat label="Discounts today" value={naira(d.today.discount_kobo)} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Bars title="Today by department"
              rows={(d.by_department ?? []).map((r) => ({ label: r.name, value: r.total_kobo }))} />
            <Bars title="Last 7 days"
              rows={d.last_7_days.map((r) => ({
                label: new Date(r.day + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' }),
                value: r.total_kobo,
              }))} />
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
      {note && <p className="text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[10.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="h-3 rounded-full bg-paper">
              <span className="block h-3 rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="tabular w-24 text-right font-medium">{naira(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
