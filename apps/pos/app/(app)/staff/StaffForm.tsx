'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addStaff, updateStaff } from './actions';
import type { FormOptions, StaffMember } from './data';

// Add or edit a staff member: who they are, how they sign in, what they do (role) and where
// (departments). Everything else the old system asked for (40+ fields) is left out on purpose.
export default function StaffForm({
  options, member, canMakeOwner, isMe = false,
}: { options: FormOptions; member?: StaffMember; canMakeOwner: boolean; isMe?: boolean }) {
  const router = useRouter();
  const isNew = !member;
  const roles = options.roles.filter((r) => !r.is_owner || canMakeOwner || r.id === member?.role_id);

  const [name, setName] = useState(member?.name ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [roleId, setRoleId] = useState<number | null>(member?.role_id ?? null);
  const [departments, setDepartments] = useState<number[]>(
    member && !member.is_owner ? member.department_ids : options.departments.length === 1 ? [options.departments[0].id] : []
  );
  const [discountLimit, setDiscountLimit] = useState(
    member?.discount_limit_kobo != null ? String(member.discount_limit_kobo / 100) : ''
  );
  const [active, setActive] = useState(member?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const role = roles.find((r) => r.id === roleId);
  const authorisesDiscounts = !!role?.permissions.includes('Authorise discounts');
  const toggleDepartment = (id: number) =>
    setDepartments((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!roleId || saving) return;
    setSaving(true);
    setError(null);
    const input = {
      user_id: member?.user_id, name, email, password, phone, role_id: roleId,
      department_ids: role?.is_owner ? [] : departments,
      discount_limit_naira: authorisesDiscounts ? discountLimit : '',
      is_active: active,
    };
    const res = isNew ? await addStaff(input) : await updateStaff(input);
    setSaving(false);
    if (res.error) return setError(res.error);
    if (isNew) {
      setDone(res.existingLogin
        ? `${name} already had a Junior Seas account, so they sign in with their existing password.`
        : `${name} can now sign in with ${email.trim().toLowerCase()} and the password you set. Give it to them in person.`);
      return;
    }
    router.push('/staff');
    router.refresh();
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-brand bg-brand-soft p-5">
        <p className="text-lg font-semibold text-brand">Added</p>
        <p>{done}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => router.push('/staff')} className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Back to staff</button>
          <button onClick={() => { setDone(null); setName(''); setEmail(''); setPassword(''); setPhone(''); }}
            className="rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold">Add another</button>
        </div>
      </div>
    );
  }

  const input = 'rounded-lg border border-line bg-panel px-3 py-3';
  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <section className="grid gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name *
          <input required value={name} onChange={(e) => setName(e.target.value)} className={input} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Phone
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email (they sign in with this) *
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isNew}
            className={`${input} disabled:bg-paper disabled:text-ink-soft`} autoComplete="off" />
        </label>
        {isNew && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Password for their first sign-in *
            <input required minLength={8} type="text" value={password} onChange={(e) => setPassword(e.target.value)}
              className={input} autoComplete="new-password" />
            <span className="font-normal text-ink-soft">At least 8 characters. Give it to them in person.</span>
          </label>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <h2 className="font-semibold">What do they do?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <label key={r.id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${roleId === r.id ? 'border-brand bg-brand-soft' : 'border-line'}`}>
              <input type="radio" name="role" checked={roleId === r.id} onChange={() => setRoleId(r.id)}
                disabled={isMe} className="mt-1 h-4 w-4" />
              <span>
                <span className="block font-semibold">{r.name}</span>
                <span className="text-sm text-ink-soft">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
        {role && !role.is_owner && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">What a {role.name} can do ({role.permissions.length})</summary>
            <ul className="mt-2 list-disc pl-5 text-ink-soft">
              {role.permissions.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </details>
        )}
        {role && role.warnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
            {role.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </section>

      {role && !role.is_owner && (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Which departments?</h2>
          <p className="text-sm text-ink-soft">They’ll only see and sell stock from these.</p>
          <div className="flex flex-wrap gap-2">
            {options.departments.map((d) => (
              <label key={d.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 font-medium ${departments.includes(d.id) ? 'border-brand bg-brand-soft text-brand' : 'border-line'}`}>
                <input type="checkbox" checked={departments.includes(d.id)} onChange={() => toggleDepartment(d.id)} className="h-4 w-4" />
                {d.name}
              </label>
            ))}
          </div>
        </section>
      )}

      {authorisesDiscounts && (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Largest discount they can approve, ₦
            <input inputMode="numeric" value={discountLimit} placeholder="Leave empty to use the role’s limit"
              onChange={(e) => setDiscountLimit(e.target.value.replace(/[^\d.]/g, ''))} className={`${input} max-w-xs`} />
          </label>
        </section>
      )}

      {!isNew && !isMe && (
        <label className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4 font-medium">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
          Can sign in and work
          {!active && <span className="text-sm font-normal text-warn">Deactivated: they can’t sign in to the POS.</span>}
        </label>
      )}

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={!roleId || saving} className="rounded-lg bg-brand px-5 py-3 font-bold text-white disabled:opacity-40">
          {saving ? 'Saving…' : isNew ? 'Add staff' : 'Save changes'}
        </button>
        <button type="button" onClick={() => router.push('/staff')} className="rounded-lg border border-line bg-panel px-5 py-3 font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
