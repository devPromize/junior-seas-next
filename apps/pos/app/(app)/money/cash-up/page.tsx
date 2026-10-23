import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import MoneyTabs from '../MoneyTabs';
import CashUpForm, { type Figures } from './CashUpForm';

// End of a shift: what the system says should be in the drawer, and the count.
export default async function CashUpPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'till.manage')) redirect('/money');
  const { data, error } = await (await createClient()).rpc('pos_cash_up_preview');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <MoneyTabs me={me} active="cash-up" />
      {error ? <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p> : <CashUpForm figures={data as Figures} />}
    </main>
  );
}
