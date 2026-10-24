import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { NAV, canSee, homeFor } from '@/lib/nav';
import { naira as nairaExact } from '@/lib/pos';
import ColumnChart, { type Column } from './ColumnChart';
import { PRESETS, type Preset, addDays, isDay, niceRange, rangeFor } from './dates';

type Summary = {
  sales: number; items: number; net_kobo: number; avg_sale_kobo: number | null; refunds_kobo: number;
  old_system_sales: number; cost_kobo: number | null; profit_kobo: number | null; margin_pct: number | null;
  estimated_pct: number | null; no_cost_kobo: number | null;
};
type Row = { name: string; net_kobo: number; sales?: number; items?: number; profit_kobo: number | null; avg_sale_kobo?: number };
type Report = {
  from: string; to: string; days: number; grain: 'day' | 'month'; costs: boolean; last_sale_on: string | null;
  departments: { id: number; name: string }[];
  summary: Summary; previous: Summary;
  by_period: { period: string; net_kobo: number; sales: number; profit_kobo: number | null }[];
  by_department: Row[]; by_staff: Row[]; by_category: Row[];
  top_products: (Row & { id: number | null; margin_pct: number | null })[];
  by_hour: { hour: number; net_kobo: number; sales: number }[];
  by_payment: { method: string; account: string | null; amount_kobo: number; payments: number }[] | null;
};

const METHOD: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', card: 'Card', online: 'Online' };
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
// Reports deal in totals: whole naira reads better than ₦1,234,567.89.
const naira = (kobo: number) => nairaExact(Math.round(kobo / 100) * 100);

// How the business is doing over any period: sales, profit, and where they came from.
export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; dept?: string }>;
}) {
  const { me } = await getMe();
  if (!me) return null;
  if (!canSee(me, NAV.find((n) => n.href === '/reports')!)) redirect(homeFor(me));

  const sp = await searchParams;
  const custom = isDay(sp.from) && isDay(sp.to);
  const preset = (PRESETS.some((p) => p.key === sp.preset) ? sp.preset : 'month') as Preset;
  const { from, to } = custom ? { from: sp.from!, to: sp.to! } : rangeFor(preset);
  const dept = Number(sp.dept) || null;

  const { data, error } = await (await createClient()).rpc('pos_report', { p_from: from, p_to: to, p_department: dept });
  const r = data as Report | null;
  const showProducts = canSee(me, NAV.find((n) => n.href === '/products')!);
  const link = (extra: Record<string, string>) =>
    '/reports?' + new URLSearchParams({ ...(dept ? { dept: String(dept) } : {}), ...extra }).toString();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-ink-soft">
          {niceRange(from, to)}{dept && r ? ` · ${r.departments.find((d) => d.id === dept)?.name ?? ''}` : ''}
        </p>
      </header>

      {/* Filters: one row of quick ranges, then exact dates and department */}
      <nav className="flex flex-wrap gap-2" aria-label="Date range">
        {PRESETS.map((p) => (
          <Link key={p.key} href={link({ preset: p.key })}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!custom && preset === p.key ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-panel hover:bg-paper'}`}>
            {p.label}
          </Link>
        ))}
      </nav>
      <form action="/reports" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">From
          <input type="date" name="from" defaultValue={from} max={to} className="rounded-lg border border-line bg-panel px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">To
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-line bg-panel px-3 py-2" />
        </label>
        {(r?.departments.length ?? 0) > 1 && (
          <label className="flex flex-col gap-1">Department
            <select name="dept" defaultValue={dept ?? ''} className="rounded-lg border border-line bg-panel px-3 py-2">
              <option value="">All my departments</option>
              {r!.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <button className="rounded-lg border border-line bg-panel px-4 py-2 font-semibold">Show</button>
      </form>

      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}
      {r && <Body r={r} showProducts={showProducts} />}
    </main>
  );
}

function Body({ r, showProducts }: { r: Report; showProducts: boolean }) {
  const s = r.summary;
  const p = r.previous;
  const vs = `vs the ${r.days === 1 ? 'day' : `${r.days} days`} before`;

  // Until the new tills are in use, the newest sales are the old system's copied history.
  const stale = r.last_sale_on && r.to > r.last_sale_on && (
    <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
      Sales are recorded up to {niceRange(r.last_sale_on, r.last_sale_on)}. Later days show nothing yet, so comparisons with the period
      before will look low. New sales appear here as soon as they’re rung up on these tills.
    </p>
  );

  if (s.sales === 0) {
    return (
      <>
        {stale}
        <p className="rounded-xl border border-line bg-panel p-6 text-center text-ink-soft">No sales in this period.</p>
      </>
    );
  }

  return (
    <>
      {stale}
      {(s.estimated_pct ?? 0) > 0 && (
        <p className="rounded-lg bg-paper px-4 py-3 text-sm text-ink-soft">
          Includes {s.old_system_sales.toLocaleString()} sales from the old system. Phones use the real cost of each phone. For other items
          the old system didn’t record the cost at the time, so their profit uses today’s cost price ({s.estimated_pct}% of these sales):
          treat it as an estimate.
          {(s.no_cost_kobo ?? 0) > 0 && ` ${naira(s.no_cost_kobo!)} of sales were for products deleted from the old system, with no cost price, so they’re left out of profit.`}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Sales" value={naira(s.net_kobo)} note="after discounts" now={s.net_kobo} before={p.net_kobo} vs={vs} />
        {r.costs && s.profit_kobo !== null && (
          <Stat label="Gross profit" value={naira(s.profit_kobo)} note={`${s.margin_pct ?? 0}% margin · before expenses`}
            now={s.profit_kobo} before={p.profit_kobo} vs={vs} />
        )}
        <Stat label="Receipts" value={s.sales.toLocaleString()} now={s.sales} before={p.sales} vs={vs} />
        <Stat label="Average sale" value={naira(s.avg_sale_kobo ?? 0)} now={s.avg_sale_kobo ?? 0} before={p.avg_sale_kobo} vs={vs} />
        <Stat label="Items sold" value={s.items.toLocaleString()} />
        <Stat label="Refunded" value={naira(s.refunds_kobo)} note={s.refunds_kobo ? `${pct(s.refunds_kobo, s.net_kobo)}% of sales` : undefined} />
      </section>

      <ColumnChart title={r.grain === 'day' ? 'Sales by day' : 'Sales by month'} columns={periodColumns(r)} />

      <section className="grid gap-4 lg:grid-cols-2">
        <Bars title="By department" rows={r.by_department} total={s.net_kobo} costs={r.costs} />
        <Bars title="By category" rows={r.by_category.slice(0, 10)} total={s.net_kobo} costs={r.costs}
          more={r.by_category.length > 10 ? `${r.by_category.length - 10} smaller categories not shown` : undefined} />
      </section>

      <Table title="By salesperson" note="Who made the sale. For old-system sales this is the name the old system recorded, which was usually whoever was signed in at that floor’s till, not the rep who served the customer."
        head={['Salesperson', 'Receipts', 'Sales', 'Average sale', ...(r.costs ? ['Profit'] : [])]}
        rows={r.by_staff.map((x) => [x.name, (x.sales ?? 0).toLocaleString(), naira(x.net_kobo), naira(x.avg_sale_kobo ?? 0),
                                     ...(r.costs ? [x.profit_kobo === null ? '—' : naira(x.profit_kobo)] : [])])} />

      <Table title="Best-selling products" note="Top 25 by sales value."
        head={['Product', 'Sold', 'Sales', ...(r.costs ? ['Profit', 'Margin'] : [])]}
        rows={r.top_products.map((x) => [
          x.id && showProducts ? <Link key="n" href={`/products/${x.id}`} className="underline">{x.name}</Link> : x.name,
          (x.items ?? 0).toLocaleString(), naira(x.net_kobo),
          ...(r.costs ? [x.profit_kobo === null ? '—' : naira(x.profit_kobo), x.margin_pct === null ? '—' : `${x.margin_pct}%`] : [])])} />

      <section className="grid gap-4 lg:grid-cols-2">
        <ColumnChart title="Busiest hours (receipts)" unit="count"
          columns={hourColumns(r)} />
        {r.by_payment ? (
          <Bars title="How customers paid" total={r.by_payment.reduce((t, x) => t + x.amount_kobo, 0)} costs={false}
            rows={r.by_payment.map((x) => ({ name: `${METHOD[x.method] ?? x.method}${x.account ? ` · ${x.account}` : ''}`, net_kobo: x.amount_kobo, profit_kobo: null }))} />
        ) : (
          <p className="rounded-xl border border-line bg-panel p-4 text-sm text-ink-soft">
            How customers paid is shown for the whole shop only, because one payment can cover items from several departments.
          </p>
        )}
      </section>
    </>
  );
}

// Every day (or month) in the range, including ones with no sales, so gaps show as gaps.
function periodColumns(r: Report): Column[] {
  const byKey = new Map(r.by_period.map((x) => [x.period.slice(0, r.grain === 'day' ? 10 : 7), x]));
  const keys: string[] = [];
  if (r.grain === 'day') {
    for (let day = r.from; day <= r.to; day = addDays(day, 1)) keys.push(day);
  } else {
    let [y, m] = r.from.split('-').map(Number);
    const end = r.to.slice(0, 7);
    for (let k = `${y}-${String(m).padStart(2, '0')}`; k <= end; ) {
      keys.push(k);
      m += 1; if (m > 12) { m = 1; y += 1; }
      k = `${y}-${String(m).padStart(2, '0')}`;
    }
  }
  return keys.map((k) => {
    const x = byKey.get(k);
    const date = new Date((k.length === 7 ? `${k}-01` : k) + 'T12:00:00Z');
    const label = r.grain === 'day'
      ? date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      : date.toLocaleDateString('en-NG', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    return {
      key: k, label, value: x?.net_kobo ?? 0,
      lines: [naira(x?.net_kobo ?? 0), `${(x?.sales ?? 0).toLocaleString()} receipts`,
              ...(r.costs && x?.profit_kobo != null ? [`${naira(x.profit_kobo)} profit`] : [])],
    };
  });
}

function hourColumns(r: Report): Column[] {
  const hours = r.by_hour.map((x) => x.hour);
  const first = Math.min(8, ...hours);
  const last = Math.max(20, ...hours);
  const byHour = new Map(r.by_hour.map((x) => [x.hour, x]));
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const h = first + i;
    const x = byHour.get(h);
    return { key: String(h), label: hourLabel(h), value: x?.sales ?? 0,
             lines: [`${(x?.sales ?? 0).toLocaleString()} receipts`, naira(x?.net_kobo ?? 0)] };
  });
}

function Stat({ label, value, note, now, before, vs }: {
  label: string; value: string; note?: string; now?: number; before?: number | null; vs?: string;
}) {
  let change: ReactNode = null;
  if (now !== undefined && vs) {
    if (!before) change = <p className="text-xs text-ink-soft">Nothing to compare in the period before</p>;
    else {
      const c = Math.round(((now - before) / Math.abs(before)) * 100);
      change = (
        <p className={`text-xs font-medium ${c > 0 ? 'text-brand' : c < 0 ? 'text-bad' : 'text-ink-soft'}`}>
          {c > 0 ? '▲ up' : c < 0 ? '▼ down' : 'same,'} {c !== 0 ? `${Math.abs(c)}%` : ''} {vs}
        </p>
      );
    }
  }
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
      {note && <p className="text-xs text-ink-soft">{note}</p>}
      {change}
    </div>
  );
}

function Bars({ title, rows, total, costs, more }: { title: string; rows: Row[]; total: number; costs: boolean; more?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.net_kobo));
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate" title={r.name}>{r.name}</span>
            <span className="h-3 rounded-full bg-paper">
              <span className="block h-3 rounded-r bg-brand" style={{ width: `${(r.net_kobo / max) * 100}%` }} />
            </span>
            <span className="tabular w-40 text-right">
              <span className="font-medium">{naira(r.net_kobo)}</span>
              <span className="block text-xs text-ink-soft">
                {pct(r.net_kobo, total)}%{costs && r.profit_kobo !== null ? ` · ${naira(r.profit_kobo)} profit` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {more && <p className="mt-2 text-xs text-ink-soft">{more}</p>}
    </div>
  );
}

function Table({ title, note, head, rows }: { title: string; note?: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mb-2 text-sm text-ink-soft">{note}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              {head.map((h, i) => <th key={h} className={`py-2 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => <td key={j} className={`py-2 ${j ? 'tabular text-right' : ''}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
