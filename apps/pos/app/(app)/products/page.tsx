import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { naira } from '@/lib/pos';
import type { ProductOptions, ProductRow } from '@/lib/products';

const PAGE = 50;
type Search = { q?: string; dept?: string; cat?: string; status?: string; stock?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { me } = await getMe();
  if (!me) return null;
  const s = await searchParams;
  const page = Math.max(1, Number(s.page) || 1);

  const supabase = await createClient();
  const [opts, list] = await Promise.all([
    supabase.rpc('pos_product_options'),
    supabase.rpc('pos_products', {
      p_search: s.q || null, p_department: s.dept ? Number(s.dept) : null, p_category: s.cat ? Number(s.cat) : null,
      p_status: s.status || 'active', p_stock: s.stock || 'all', p_limit: PAGE, p_offset: (page - 1) * PAGE,
    }),
  ]);
  if (opts.error) {
    return <main className="mx-auto max-w-3xl px-4 py-6"><p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{opts.error.message}</p></main>;
  }
  const options = opts.data as ProductOptions;
  const total: number = list.data?.total ?? 0;
  const rows = (list.data?.rows ?? []) as ProductRow[];
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...s, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/products?${p}`;
  };
  const select = 'rounded-lg border border-line bg-panel px-3 py-2.5';

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
        <span className="text-ink-soft">{total.toLocaleString()} found</span>
        {options.can.manage && (
          <Link href="/products/new" className="ml-auto rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Add product</Link>
        )}
      </header>

      <form className="flex flex-wrap gap-2" action="/products">
        <input name="q" defaultValue={s.q} placeholder="Name, barcode or IMEI" className={`${select} min-w-56 flex-1`} />
        <select name="dept" defaultValue={s.dept ?? ''} className={select}>
          <option value="">All my departments</option>
          {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="cat" defaultValue={s.cat ?? ''} className={`${select} max-w-56`}>
          <option value="">All categories</option>
          {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="stock" defaultValue={s.stock ?? 'all'} className={select}>
          <option value="all">In stock or not</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select name="status" defaultValue={s.status ?? 'active'} className={select}>
          <option value="active">On sale</option>
          <option value="hidden">Hidden</option>
          <option value="all">All</option>
        </select>
        <button className="rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold">Search</button>
      </form>

      {list.error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{list.error.message}</p>}

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              {options.can.costs && <th className="px-3 py-2 text-right font-medium">Cost</th>}
              <th className="px-3 py-2 text-right font-medium">In stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-paper">
                <td className="px-3 py-2">
                  <Link href={`/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  <span className="block text-xs text-ink-soft">
                    {p.sku}{p.tracks_imei ? ' · by IMEI' : ''}{!p.is_active ? ' · hidden' : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-soft">{p.category ?? '—'}</td>
                <td className="tabular px-3 py-2 text-right">
                  {naira(p.price_kobo)}
                  {p.wholesale_price_kobo != null && <span className="block text-xs text-ink-soft">wholesale {naira(p.wholesale_price_kobo)}</span>}
                </td>
                {options.can.costs && <td className="tabular px-3 py-2 text-right text-ink-soft">{p.cost_kobo ? naira(p.cost_kobo) : '—'}</td>}
                <td className={`tabular px-3 py-2 text-right font-semibold ${p.stock > 0 ? '' : 'text-ink-soft'}`}>{p.stock}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-soft">No products match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center gap-3">
          {page > 1 && <Link href={link({ page: String(page - 1) })} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">← Previous</Link>}
          <span className="text-sm text-ink-soft">Page {page} of {pages}</span>
          {page < pages && <Link href={link({ page: String(page + 1) })} className="rounded-lg border border-line bg-panel px-4 py-2 font-medium">Next →</Link>}
        </nav>
      )}
    </main>
  );
}
