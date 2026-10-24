'use client';

import { useState } from 'react';

export type Column = { key: string; label: string; value: number; lines: string[] };

// Short money for the axis: ₦950, ₦12K, ₦1.4M.
export function nairaShort(kobo: number): string {
  const n = kobo / 100;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `₦${+(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `₦${+(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `₦${+(n / 1e3).toFixed(0)}K`;
  return `₦${Math.round(n)}`;
}

// A round top for the axis: 1, 2 or 5 times a power of ten, so the gridlines land on clean numbers.
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const nice = [1, 2, 5, 10].map((m) => m * step).find((s) => s * 4 >= max) ?? 10 * step;
  return nice * 4;
}

// One series of columns (e.g. sales per day). Hover or tap a column for its numbers; every
// value is also in the table underneath, so nothing depends on the chart alone.
export default function ColumnChart({ title, columns, unit = 'naira' }: {
  title: string; columns: Column[]; unit?: 'naira' | 'count';
}) {
  // (A plain word, not a function: this chart runs in the browser and is given its data by the server.)
  const format = unit === 'naira' ? nairaShort : (v: number) => String(Math.round(v));
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...columns.map((c) => c.value)));
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const every = Math.max(1, Math.ceil(columns.length / 10));   // at most ~10 labels along the bottom
  const hovered = active === null ? null : columns[active];

  return (
    <figure className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
      <figcaption className="font-semibold">{title}</figcaption>
      <div className="relative mt-3 grid grid-cols-[3.25rem_1fr] gap-2">
        <div className="relative h-52 text-right text-xs text-ink-soft tabular">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>{format(t)}</span>
          ))}
        </div>
        <div className="relative h-52" onMouseLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {columns.map((c, i) => (
              <button key={c.key} type="button" aria-label={`${c.label}: ${c.lines.join(', ')}`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}
                className="flex h-full min-w-0 flex-1 items-end justify-center px-px focus:outline-none">
                <span className={`block w-full max-w-6 rounded-t ${active === i ? 'bg-ink' : 'bg-brand'}`}
                  style={{ height: `${(c.value / top) * 100}%`, minHeight: c.value > 0 ? 2 : 0 }} />
              </button>
            ))}
          </div>
          {hovered && active !== null && (
            <div role="status" className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-md"
              style={active > columns.length / 2 ? { right: `${((columns.length - active - 1) / columns.length) * 100}%` }
                                                  : { left: `${(active / columns.length) * 100}%` }}>
              <p className="font-semibold">{hovered.label}</p>
              {hovered.lines.map((l) => <p key={l} className="tabular text-ink-soft">{l}</p>)}
            </div>
          )}
        </div>
        <span />
        <div className="flex text-xs text-ink-soft">
          {columns.map((c, i) => (
            <span key={c.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
              {i % every === 0 ? c.label : ''}
            </span>
          ))}
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-soft">See the numbers</summary>
        <table className="mt-2 w-full">
          <tbody className="divide-y divide-line">
            {columns.map((c) => (
              <tr key={c.key}><td className="py-1">{c.label}</td><td className="tabular py-1 text-right">{c.lines.join(' · ')}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
