import { redirect } from 'next/navigation';
import { getMe } from '@/lib/me';
import { can } from '@/lib/pos';
import SellScreen from './SellScreen';

export default async function SellPage() {
  const { me } = await getMe();
  if (!me) return null;   // the layout explains why
  if (!can(me, 'sales.create')) redirect('/');

  return <SellScreen me={me} />;
}
