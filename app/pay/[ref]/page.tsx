'use client';

import { useEffect, useState } from 'react';

export default function PayOrderPage({
  params,
}: {
  params: { ref: string };
}) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    async function fetchOrder() {
      const res = await fetch(`/api/orders/${params.ref}`);
      const json = await res.json();
      setOrder(json);
    }
    fetchOrder();
  }, [params.ref]);

  const payWithPaystack = async () => {
    setLoading(true);

    const res = await fetch('/api/paystack/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_ref: order.order_ref,
      }),
    });

    const json = await res.json();
    setLoading(false);

    if (json.authorization_url) {
      window.location.href = json.authorization_url;
    } else {
      alert('Unable to initialize payment');
    }
  };

  if (!order) return <p className="p-6">Loading order...</p>;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-xl font-semibold mb-4">
        Pay for Order {order.order_ref}
      </h1>

      <p className="mb-4">
        Amount:{' '}
        <strong>
          ₦{(order.amount / 100).toLocaleString()}
        </strong>
      </p>

      <button
        onClick={payWithPaystack}
        disabled={loading}
        className="w-full bg-black text-white py-3 rounded-lg"
      >
        {loading ? 'Processing...' : 'Pay with Paystack'}
      </button>
    </div>
  );
}
