import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import type { Product, ProductOptions } from '@/lib/products';
import ProductForm from '../ProductForm';
import StockPanel from './StockPanel';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = await getMe();
  if (!me) return null;
  const { id } = await params;

  const supabase = await createClient();
  const [opts, prod] = await Promise.all([
    supabase.rpc('pos_product_options'),
    supabase.rpc('pos_product', { p_id: Number(id) }),
  ]);
  const error = opts.error ?? prod.error;
  if (error) {
    return <main className="mx-auto max-w-3xl px-4 py-6"><p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p></main>;
  }
  const options = opts.data as ProductOptions;
  const product = prod.data as Product;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <Link href="/products" className="text-sm font-medium underline">← Products</Link>
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ProductForm options={options} product={product} />
        <StockPanel product={product} can={options.can} />
      </div>
    </main>
  );
}
