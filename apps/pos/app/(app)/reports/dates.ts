// Date ranges for Reports, worked out in Owerri time so "today" means the shop's today.
// Dates travel as YYYY-MM-DD strings; arithmetic is done at midday UTC so it never slips a day.

export type Preset = 'today' | 'yesterday' | '7d' | 'month' | 'last-month' | 'year';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'year', label: 'This year' },
];

export const todayInLagos = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());

const d = (iso: string) => new Date(iso + 'T12:00:00Z');
const iso = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => { const x = d(day); x.setUTCDate(x.getUTCDate() + n); return iso(x); };

export function rangeFor(preset: Preset, today = todayInLagos()): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case '7d': return { from: addDays(today, -6), to: today };
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'last-month': {
      const first = iso(new Date(Date.UTC(y, m - 2, 1, 12)));
      return { from: first, to: addDays(`${today.slice(0, 7)}-01`, -1) };
    }
    case 'year': return { from: `${y}-01-01`, to: today };
  }
}

export const isDay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function niceRange(from: string, to: string): string {
  const fmt = (s: string, withYear: boolean) =>
    d(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  if (from === to) return fmt(from, true);
  return `${fmt(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmt(to, true)}`;
}
