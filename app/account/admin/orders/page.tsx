'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/ui/Container';

type Order = {
  id: string;
  order_ref: string;
  amount: number; // kobo
  currency: string;
  payment_status: string;
  payment_method?: string | null;
  payment_note?: string | null;
  paid_at?: string | null;
  shipping_status: string;
  created_at: string;
  billing: { full_name?: string; email?: string };
};

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'pos_card', label: 'POS (card)' },
  { value: 'wallet', label: 'Mobile wallet (Opay/Palmpay)' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Other' },
];
const methodLabel = (v?: string | null) =>
  METHOD_OPTIONS.find((m) => m.value === v)?.label ??
  (v === 'paystack' ? 'Card (Paystack)' : v || '—');

// Amounts are stored in kobo → naira for display.
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Which order's "mark as paid" form is open, and its field state.
  const [payingRef, setPayingRef] = useState<string | null>(null);
  const [method, setMethod] = useState('bank_transfer');
  const [note, setNote] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);

  useEffect(() => {
    fetch('/api/admin/orders')
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 401 || r.status === 403
              ? 'You need to be signed in as an admin to view this page.'
              : 'Failed to load orders.'
          );
        return r.json();
      })
      .then((d) => setOrders(d.orders || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const patchOrder = (ref: string, patch: Partial<Order>) =>
    setOrders((prev) =>
      prev.map((o) => (o.order_ref === ref ? { ...o, ...patch } : o))
    );

  const openPayForm = (ref: string) => {
    setPayingRef(ref);
    setMethod('bank_transfer');
    setNote('');
    setSendReceipt(true);
  };

  const confirmPaid = async (ref: string) => {
    setBusy(ref);
    const res = await fetch('/api/admin/orders/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ref: ref, method, note, send_receipt: sendReceipt }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.message || 'Failed to mark as paid.');
      return;
    }
    patchOrder(ref, {
      payment_status: 'paid',
      payment_method: method,
      payment_note: note || null,
      paid_at: new Date().toISOString(),
    });
    setPayingRef(null);
  };

  const markUnpaid = async (ref: string) => {
    if (!confirm('Reset this order back to pending (unpaid)?')) return;
    setBusy(ref);
    const res = await fetch('/api/admin/orders/mark-unpaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ref: ref }),
    });
    setBusy(null);
    if (!res.ok) {
      setError('Failed to update order.');
      return;
    }
    patchOrder(ref, {
      payment_status: 'pending',
      payment_method: null,
      payment_note: null,
      paid_at: null,
    });
  };

  const markDelivered = async (ref: string) => {
    setBusy(ref);
    const res = await fetch('/api/admin/orders/mark-delivered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ref: ref }),
    });
    setBusy(null);
    if (!res.ok) {
      setError('Failed to mark delivered.');
      return;
    }
    patchOrder(ref, { shipping_status: 'delivered' });
  };

  return (
    <Container>
      <section className="py-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold">Orders</h1>
          <Link href="/account/admin" className="text-sm text-gray-600 hover:underline">
            ← Admin
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-10 text-center text-gray-500">Loading…</p>
        ) : error ? null : orders.length === 0 ? (
          <p className="text-gray-500">No orders yet.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const paid = o.payment_status === 'paid';
              const delivered = o.shipping_status === 'delivered';
              return (
                <div key={o.id} className="border rounded p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{o.order_ref}</div>
                      <div className="text-sm text-gray-600">
                        {o.billing?.full_name}
                        {o.billing?.email ? ` · ${o.billing.email}` : ''}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(o.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{naira(o.amount)}</div>
                      <div className="flex gap-2 justify-end mt-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            paid
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {paid ? 'Paid' : 'Pending payment'}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            delivered
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {delivered ? 'Delivered' : 'Not delivered'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {paid && (
                    <div className="text-xs text-gray-500 mt-2">
                      Paid via <strong>{methodLabel(o.payment_method)}</strong>
                      {o.payment_note ? ` — “${o.payment_note}”` : ''}
                    </div>
                  )}

                  {/* Mark-as-paid form */}
                  {!paid && payingRef === o.order_ref && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      <div className="text-sm font-medium">
                        How did they pay?
                      </div>
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm w-full sm:w-72"
                      >
                        {METHOD_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Reference / note (optional)"
                        className="border rounded px-3 py-1.5 text-sm w-full"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={sendReceipt}
                          onChange={(e) => setSendReceipt(e.target.checked)}
                        />
                        Send payment receipt email to the customer
                      </label>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => confirmPaid(o.order_ref)}
                          disabled={busy === o.order_ref}
                          className="bg-green-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-60"
                        >
                          {busy === o.order_ref ? 'Saving…' : 'Confirm paid'}
                        </button>
                        <button
                          onClick={() => setPayingRef(null)}
                          className="border text-sm px-4 py-1.5 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {payingRef !== o.order_ref && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {!paid && (
                        <button
                          onClick={() => openPayForm(o.order_ref)}
                          className="bg-green-600 text-white text-sm px-4 py-1.5 rounded"
                        >
                          Mark as paid
                        </button>
                      )}
                      {paid && o.payment_method !== 'paystack' && (
                        <button
                          onClick={() => markUnpaid(o.order_ref)}
                          disabled={busy === o.order_ref}
                          className="text-sm text-red-600 border border-red-200 px-4 py-1.5 rounded hover:bg-red-50 disabled:opacity-60"
                        >
                          Mark as unpaid
                        </button>
                      )}
                      {!delivered && (
                        <button
                          onClick={() => markDelivered(o.order_ref)}
                          disabled={busy === o.order_ref}
                          className="text-sm border px-4 py-1.5 rounded hover:bg-gray-50 disabled:opacity-60"
                        >
                          Mark delivered
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </Container>
  );
}
