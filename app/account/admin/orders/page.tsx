'use client';

import { useEffect, useState } from 'react';

type Order = {
  id: string;
  order_ref: string;
  amount: number;
  currency: string;
  payment_status: string;
  shipping_status: string;
  created_at: string;
  billing: {
    full_name?: string;
    email?: string;
  };
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/orders')
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || []);
        setLoading(false);
      });
  }, []);

  const markDelivered = async (order_ref: string) => {
    await fetch('/api/admin/orders/mark-delivered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ref }),
    });

    // optimistic refresh
    setOrders(prev =>
      prev.map(o =>
        o.order_ref === order_ref
          ? { ...o, shipping_status: 'delivered' }
          : o
      )
    );
  };

  if (loading) return <p>Loading orders...</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin Orders</h1>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left">Order Ref</th>
              <th className="border p-2">Customer</th>
              <th className="border p-2">Amount</th>
              <th className="border p-2">Payment</th>
              <th className="border p-2">Shipping</th>
              <th className="border p-2">Date</th>
              <th className="border p-2">Action</th>
            </tr>
          </thead>

          <tbody>
            {orders.map(order => (
              <tr key={order.id}>
                <td className="border p-2 font-medium">
                  {order.order_ref}
                </td>
                <td className="border p-2">
                  {order.billing?.full_name}<br />
                  <span className="text-xs text-gray-500">
                    {order.billing?.email}
                  </span>
                </td>
                <td className="border p-2">
                  ₦{order.amount.toLocaleString()}
                </td>
                <td className="border p-2 capitalize">
                  {order.payment_status}
                </td>
                <td className="border p-2 capitalize">
                  {order.shipping_status}
                </td>
                <td className="border p-2">
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
                <td className="border p-2">
                  {order.shipping_status !== 'delivered' && (
                    <button
                      onClick={() => markDelivered(order.order_ref)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-xs"
                    >
                      Mark Delivered
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
