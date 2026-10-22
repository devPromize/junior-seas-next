import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import { loadFormOptions, loadStaff } from './data';

export default async function StaffPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'staff.manage')) redirect('/');

  const [{ staff, error }, options] = await Promise.all([loadStaff(), loadFormOptions()]);
  const departmentName = new Map(options.departments.map((d) => [d.id, d.name]));
  const allDepartments = options.departments.length;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Staff</h1>
        <Link href="/staff/new" className="ml-auto rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Add staff</Link>
      </header>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}

      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel">
        {staff.map((s) => (
          <li key={s.user_id}>
            <Link href={`/staff/${s.user_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-paper">
              <span className="min-w-40 flex-1">
                <span className="block font-semibold">
                  {s.name}
                  {!s.is_active && <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">Deactivated</span>}
                </span>
                <span className="text-sm text-ink-soft">{s.email}</span>
              </span>
              <span className="w-32 text-sm font-medium">{s.role}</span>
              <span className="flex-1 text-sm text-ink-soft">
                {s.is_owner || s.department_ids.length === allDepartments
                  ? 'All departments'
                  : s.department_ids.map((id) => departmentName.get(id)).filter(Boolean).join(', ') || 'No departments'}
              </span>
              <span className="w-36 text-right text-xs text-ink-soft">
                {s.last_sign_in_at
                  ? `Last in ${new Date(s.last_sign_in_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
                  : 'Never signed in'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
