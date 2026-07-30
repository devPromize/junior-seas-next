'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/ui/Container';
import ProductForm, { type ProductFormValues } from '@/ui/components/ProductForm';

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [initial, setInitial] = useState<ProductFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then((p) => {
        if (!p || p.error) {
          setError('Product not found.');
          setLoading(false);
          return;
        }
        setInitial({
          name: p.name ?? '',
          brand: p.brand ?? '',
          category: p.category ?? '',
          description: p.description ?? '',
          status: p.status ?? '',
          images: Array.isArray(p.images) ? p.images : [],
          variants: Array.isArray(p.variants) ? p.variants : [],
        });
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load product.');
        setLoading(false);
      });
  }, [id]);

  return (
    <Container>
      <section className="py-8 max-w-3xl mx-auto">
        <Link
          href="/account/admin/products"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to products
        </Link>
        <h1 className="text-2xl font-bold mt-2 mb-6">Edit product</h1>

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          initial && (
            <ProductForm mode="edit" productId={id} initial={initial} />
          )
        )}
      </section>
    </Container>
  );
}
