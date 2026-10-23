import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import MarkRead from './MarkRead';

type Alert = { id: number; kind: string; title: string; body: string; entity: string | null; entity_id: string | null; at: string; read: boolean };

// Where an alert leads when tapped.
function linkFor(a: Alert): string | null {
  if (!a.entity_id) return null;
  if (a.entity === 'sale') return `/sales/${a.entity_id}`;
  if (a.entity === 'delivery') return `/stock/purchases/${a.entity_id}`;
  if (a.entity === 'cash_up') return '/money';
  return null;
}

export default async function AlertsPage() {
  const { data, error } = await (await createClient()).rpc('pos_alerts', { p_limit: 100 });
  const alerts = (data ?? []) as Alert[];
  const unread = alerts.some((a) => !a.read);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Alerts</h1>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}
      {alerts.length === 0 && <p className="text-ink-soft">Nothing yet. Discounts, short cash-ups and overdue supplier bills show up here.</p>}
      <ul className="flex flex-col gap-2">
        {alerts.map((a) => {
          const href = linkFor(a);
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{a.title}</span>
                <span className="shrink-0 text-xs text-ink-soft">
                  {new Date(a.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}
                </span>
              </span>
              <span className="text-sm text-ink-soft">{a.body}</span>
            </>
          );
          const cls = `flex flex-col gap-1 rounded-xl border p-3 ${a.read ? 'border-line bg-panel' : 'border-brand bg-brand-soft'}`;
          return <li key={a.id}>{href ? <Link href={href} className={`${cls} hover:bg-paper`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
        })}
      </ul>
      {unread && <MarkRead />}
    </main>
  );
}
