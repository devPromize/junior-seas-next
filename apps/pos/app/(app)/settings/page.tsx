import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import Departments, { type DepartmentRow } from './Departments';

export default async function SettingsPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'settings.manage')) redirect('/');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_departments');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p>}
      <Departments rows={(data ?? []) as DepartmentRow[]} />
    </main>
  );
}
