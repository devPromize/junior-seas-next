import { redirect } from 'next/navigation';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import { loadFormOptions } from '../data';
import StaffForm from '../StaffForm';

export default async function NewStaffPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'staff.manage')) redirect('/');

  const options = await loadFormOptions();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Add staff</h1>
      <StaffForm options={options} canMakeOwner={me.is_owner} />
    </main>
  );
}
