import { redirect } from 'next/navigation';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import CheckoutScreen from './CheckoutScreen';

export default async function CheckoutPage() {
  const { me } = await getMe();
  if (!me) return null;
  if (!can(me, 'sales.checkout')) redirect('/');

  return <CheckoutScreen me={me} />;
}
