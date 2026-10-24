import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import MoneyTabs from '../MoneyTabs';
import AccountsEditor, { type Account } from './AccountsEditor';

// The bank accounts, POS machines and online accounts money goes into. The owner manages them,
// or a person the owner has given "Manage bank and card accounts".
export default async function AccountsPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'accounts.manage')) redirect('/money');
  const { data, error } = await (await createClient()).rpc('pos_payment_accounts');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <MoneyTabs me={me} active="accounts" />
      {error ? <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p> : <AccountsEditor rows={(data ?? []) as Account[]} />}
    </main>
  );
}
