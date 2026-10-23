import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProductOptions } from '@/lib/products';

// Stock opens on whichever job this person can do: Purchases first.
export default async function StockPage() {
  const { data } = await (await createClient()).rpc('pos_product_options');
  const can = (data as ProductOptions | null)?.can;
  if (can?.receive || can?.costs) redirect('/stock/purchases');
  if (can?.move) redirect('/stock/move');
  redirect('/products');   // counting and marking phones happens on each product's page
}
