import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProductOptions } from '@/lib/products';
import StockTabs from '../../StockTabs';
import PurchaseForm from './PurchaseForm';

export default async function NewPurchasePage() {
  const { data, error } = await (await createClient()).rpc('pos_product_options');
  const options = data as ProductOptions | null;
  if (error || !options?.can.receive) redirect('/stock');

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Stock</h1>
      <StockTabs active="purchases" can={options.can} />
      <h2 className="text-xl font-semibold">New purchase</h2>
      <PurchaseForm options={options} />
    </main>
  );
}
