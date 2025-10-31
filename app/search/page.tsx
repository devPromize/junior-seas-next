// src/app/search/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import Container from '@/ui/Container';
import ProductGridSkeleton from '@/ui/components/ProductGridSkeleton';
import ProductCard from '@/ui/components/ProductCard';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const { data, error, isLoading } = useSWR(
    query ? `/api/search?q=${encodeURIComponent(query)}` : null,
    fetcher
  );

  const products = data?.products || [];

  return (
    <Container>
      <section className="py-10">
        <h2 className="text-xl md:text-2xl font-bold mb-5 text-center underline decoration-yellow-500 underline-offset-8">
          Search results for: <span className="text-blue-600">{query}</span>
        </h2>

        {isLoading && <ProductGridSkeleton count={12} />}

        {!isLoading && error && (
          <p className="text-center text-red-500">Error loading results</p>
        )}

        {!isLoading && !error && products.length === 0 && (
          <p className="text-center text-gray-500">No products found</p>
        )}

        {!isLoading && !error && products.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product: any, idx: number) => (
              <ProductCard
                key={product.id || product._id || idx}
                product={product}
                sectionKey="search"
              />
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}