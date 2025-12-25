'use client';
import { useAuth } from '@/hooks/useAuth';
import { use, useEffect, useState } from 'react';

export default function AccountPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const res = await fetch(`/api/account/orders?user_id=${user.id}`);
      const json = await res.json();
      setOrders(json.orders || []);
    })();
  }, [user]);

  if (!user) return <div className="p-10">Please <a href="/auth/login" className="text-blue-600">log in</a></div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Account</h2>
      <p className="mb-4">Signed in as <strong>{user.email}</strong></p>

      <h3 className="text-xl font-semibold mt-6">Orders</h3>
      {orders.length === 0 ? <p className="mt-2">No orders yet</p> : (
        <div className="mt-2 space-y-3">
          {orders.map((o:any) => (
            <div key={o.id} className="border p-3 rounded bg-white">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">{o.order_ref}</div>
                  <div className="text-sm text-gray-600">{new Date(o.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{o.payment_status}</div>
                  <div>₦{(o.amount/100).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
