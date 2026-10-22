import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProductOptions } from '@/lib/products';
import StockTabs from '../StockTabs';
import MoveForm from './MoveForm';

export default async function MovePage() {
  const { data, error } = await (await createClient()).rpc('pos_product_options');
  const options = data as ProductOptions | null;
  if (error || !options?.can.move) redirect('/stock');

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Stock</h1>
      <StockTabs active="move" can={options.can} />
      {options.departments.length < 2
        ? <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn">Moving stock needs access to at least two departments.</p>
        : <MoveForm options={options} />}
    </main>
  );
}
