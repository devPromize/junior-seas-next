import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import type { ProductOptions } from '@/lib/products';
import ProductForm from '../ProductForm';

export default async function NewProductPage() {
  const { me } = await getMe();
  if (!me) return null;
  const { data, error } = await (await createClient()).rpc('pos_product_options');
  if (error || !(data as ProductOptions).can.manage) redirect('/products');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Add product</h1>
      <ProductForm options={data as ProductOptions} />
    </main>
  );
}
