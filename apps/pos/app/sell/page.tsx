import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can, type Me } from '@/lib/pos';
import SellScreen from './SellScreen';

export const dynamic = 'force-dynamic';

export default async function SellPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_me');
  if (error) redirect('/');
  const me = data as Me;
  if (!can(me, 'sales.create')) redirect('/');

  return <SellScreen me={me} />;
}
