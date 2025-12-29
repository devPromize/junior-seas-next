'use client';

import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/ui/Container';

export default function OrdersPage() {
  const { user, loading } = useAuth();

  const [orders, setOrders] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading || !user) return;

    setFetching(true);

    (async () => {
      try {
        const res = await fetch('/api/account/orders');
        const json = await res.json();
        setOrders(json.orders || []);
      } catch (err) {
        console.error('Failed to fetch orders', err);
      } finally {
        setFetching(false);
      }
    })();
  }, [loading, user]);

  /* ⛔️ DO NOT RENDER ANY AUTH UI UNTIL loading === false */
  if (loading) {
    return (
      <Container>
        <p className="py-10 text-center">Loading…</p>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container>
        <div className="max-w-md mx-auto py-20 text-center">
          <h2 className="text-xl font-semibold mb-4">
            Please sign in to view your orders
          </h2>

          <Link
            href="/auth/login"
            className="inline-block bg-(--color-navyBlue) text-white py-3 px-6 rounded"
          >
            Login
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <section className="py-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold">
            My Orders
          </h2>

          <Link
            href="/account"
            className="text-sm text-gray-600 hover:underline"
          >
            ← Back to account
          </Link>
        </div>

        {fetching ? (
          <p>Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="text-gray-500">
            You have not placed any orders yet.
          </p>
        ) : (
          <div className="space-y-4">
            {orders.map((o: any) => (
              <div
                key={o.id}
                className="border rounded p-4 bg-white"
              >
                <div className="flex justify-between">
                  <div>
                    <div className="font-semibold">{o.order_ref}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(o.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="capitalize text-sm">
                      {o.payment_status}
                    </div>
                    <div className="font-bold">
                      ₦{o.amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                {o.shipping_status && (
                  <div className="mt-2 text-sm">
                    Shipping:{' '}
                    <span className="font-medium capitalize">
                      {o.shipping_status}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
