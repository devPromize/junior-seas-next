import { notFound, redirect } from 'next/navigation';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import { loadFormOptions, loadStaff } from '../data';
import StaffForm from '../StaffForm';
import StaffPermissions from './StaffPermissions';

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'staff.manage')) redirect('/');

  const { id } = await params;
  const [{ staff }, options] = await Promise.all([loadStaff(), loadFormOptions()]);
  const member = staff.find((s) => s.user_id === id);
  if (!member) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{member.name}</h1>
      <StaffForm options={options} member={member} canMakeOwner={me.is_owner} isMe={member.user_id === me.user_id} />
      {me.is_owner && !member.is_owner && <StaffPermissions userId={member.user_id} roleName={member.role} />}
    </main>
  );
}
