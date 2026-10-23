import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can, naira } from '@/lib/pos';
import MoneyTabs from '../MoneyTabs';
import ExpenseForm from './ExpenseForm';

type Expense = {
  id: string; ref_no: string; spent_on: string; category: string; amount_kobo: number; method: string; account: string | null;
  department: string | null; description: string; recorded_by: string | null; documents: number;
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'money.view') && !can(me, 'expenses.manage')) redirect('/money');
  // A month at a time; this month unless another is chosen.
  const month = (await searchParams).month ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);   // last day of the month
  const { data, error } = await (await createClient()).rpc('pos_expenses', { p_from: from, p_to: to });
  const rows = (data?.rows ?? []) as Expense[];
  const total = rows.reduce((s, e) => s + e.amount_kobo, 0);
  const byCategory = Object.entries(rows.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amount_kobo }), {}))
    .sort((a, b) => b[1] - a[1]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <MoneyTabs me={me} active="expenses" />
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}

      {can(me, 'expenses.manage') && data?.categories && (
        <ExpenseForm categories={data.categories} accounts={me.payment_accounts} departments={me.departments} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form action="/money/expenses" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={month} className="rounded-lg border border-line bg-panel px-3 py-2" />
          <button className="rounded-lg border border-line bg-panel px-4 py-2 font-semibold">Show</button>
        </form>
        <span className="font-semibold">{rows.length} expense{rows.length === 1 ? '' : 's'} · {naira(total)}</span>
      </div>
      {byCategory.length > 1 && (
        <p className="text-sm text-ink-soft">{byCategory.map(([c, k]) => `${c} ${naira(k)}`).join(' · ')}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">What for</th>
              <th className="px-3 py-2 font-medium">Paid</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-3 py-2">{new Date(e.spent_on).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</td>
                <td className="px-3 py-2">
                  <span className="font-medium">{e.description}</span>
                  <span className="block text-xs text-ink-soft">
                    {e.ref_no} · {e.category}{e.department ? ` · ${e.department}` : ''}{e.recorded_by ? ` · ${e.recorded_by}` : ''}{e.documents ? ' · 📎' : ''}
                  </span>
                </td>
                <td className="px-3 py-2 capitalize text-ink-soft">{e.method}{e.account ? ` (${e.account})` : ''}</td>
                <td className="tabular px-3 py-2 text-right font-semibold">{naira(e.amount_kobo)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-soft">No expenses this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
