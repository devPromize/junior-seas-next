import { redirect } from 'next/navigation';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import PinForm from './PinForm';

export default async function PinPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'sales.discount')) redirect('/');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{me.has_pin ? 'Change my PIN' : 'Set my PIN'}</h1>
      <p className="text-ink-soft">
        The cashier asks for your PIN when a discount is bigger than the quick-discount limit. Keep it to yourself.
      </p>
      <PinForm />
    </main>
  );
}
