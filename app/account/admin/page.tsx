'use client';

import Link from 'next/link';
import Container from '@/ui/Container';

export default function AdminHubPage() {
  return (
    <Container>
      <section className="py-10 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Admin</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/account/admin/products"
            className="border rounded p-5 hover:shadow"
          >
            <h3 className="font-semibold mb-1">Products &amp; Stock</h3>
            <p className="text-sm text-gray-600">
              Manage products and per-location inventory
            </p>
          </Link>

          <Link
            href="/account/admin/orders"
            className="border rounded p-5 hover:shadow"
          >
            <h3 className="font-semibold mb-1">Orders</h3>
            <p className="text-sm text-gray-600">
              View orders and mark them delivered
            </p>
          </Link>
        </div>
      </section>
    </Container>
  );
}
