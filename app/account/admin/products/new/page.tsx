'use client';

import Link from 'next/link';
import Container from '@/ui/Container';
import ProductForm from '@/ui/components/ProductForm';

export default function NewProductPage() {
  return (
    <Container>
      <section className="py-8 max-w-3xl mx-auto">
        <Link
          href="/account/admin/products"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to products
        </Link>
        <h1 className="text-2xl font-bold mt-2 mb-6">New product</h1>
        <ProductForm mode="create" />
      </section>
    </Container>
  );
}
