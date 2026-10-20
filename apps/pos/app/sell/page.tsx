import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can, FLOOR_COOKIE, type Me } from '@/lib/pos';
import SellScreen from './SellScreen';

export const dynamic = 'force-dynamic';

export default async function SellPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_me');
  if (error) redirect('/');
  const me = data as Me;
  if (!can(me, 'sales.create')) redirect('/');

  const floorId = Number((await cookies()).get(FLOOR_COOKIE)?.value);
  const floor = me.floors.find((f) => f.id === floorId);
  if (!floor) redirect('/');   // choose the device's floor first

  return <SellScreen me={me} floor={floor} />;
}
