import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import MoneyTabs from '../MoneyTabs';
import AccountsEditor, { type Account } from './AccountsEditor';

// The bank, POS-terminal and online accounts money goes into. Change them when the shop changes banks.
export default async function AccountsPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'settings.manage')) redirect('/money');
  const { data, error } = await (await createClient()).rpc('pos_payment_accounts');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <MoneyTabs me={me} active="accounts" />
      {error ? <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p> : <AccountsEditor rows={(data ?? []) as Account[]} />}
    </main>
  );
}
