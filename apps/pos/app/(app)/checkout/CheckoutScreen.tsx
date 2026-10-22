'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { can, naira, type Me } from '@/lib/pos';

type QueueLine = {
  id: number; item_name: string; qty: number; unit_price_kobo: number;
  price_tier: 'retail' | 'wholesale'; department_id: number; imei: string | null;
};
type QueueOrder = {
  sale_id: string; receipt_no: string; placed_at: string; hold_expires_at: string | null;
  rep: string | null; rep_note: string | null;
  discount_requested_kobo: number | null; discount_approved_kobo: number | null;
  customer: { id: string; name: string; phone: string } | null; customer_declined: boolean;
  subtotal_kobo: number; lines: QueueLine[] | null;
};
type Method = 'cash' | 'transfer' | 'card' | 'online';
type Payment = { key: number; method: Method; accountId: number | null; amount: string };

const QUEUE_REFRESH_MS = 5000;
const METHOD_LABEL: Record<Method, string> = { cash: 'Cash', transfer: 'Transfer', card: 'Card', online: 'Online' };
const REMOVE_REASONS = ['Customer changed their mind', 'Wrong item scanned', 'Out of stock on the shelf'];
const toKobo = (naira: string) => Math.round(Number(naira || 0) * 100);
const fromKobo = (kobo: number) => String(kobo / 100);
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export default function CheckoutScreen({ me }: { me: Me }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [queue, setQueue] = useState<QueueOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const { data, error } = await supabase.rpc('pos_order_queue');
    if (error) return setLoadError(error.message);
    setLoadError(null);
    setQueue(data as QueueOrder[]);
  }, [supabase]);

  useEffect(() => {
    loadQueue();
    const t = setInterval(loadQueue, QUEUE_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadQueue]);

  const order = queue?.find((o) => o.sale_id === selectedId) ?? null;
  useEffect(() => {
    // The order was paid or cancelled elsewhere: let go of it.
    if (selectedId && queue && !order) setSelectedId(null);
  }, [queue, order, selectedId]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
      <h1 className="text-xl font-bold">Checkout</h1>
      {loadError && <p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{loadError}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">
            Waiting to be paid {queue && <span className="text-ink-soft">({queue.length})</span>}
          </h2>
          {queue === null && <p className="text-ink-soft">Loading orders…</p>}
          {queue?.length === 0 && (
            <p className="rounded-xl border border-line bg-panel p-4 text-ink-soft">
              No orders waiting. New orders appear here by themselves.
            </p>
          )}
          {queue?.map((o) => (
            <button key={o.sale_id} onClick={() => setSelectedId(o.sale_id)}
              className={`flex flex-col gap-1 rounded-xl border p-3 text-left ${o.sale_id === selectedId ? 'border-brand bg-brand-soft' : 'border-line bg-panel hover:bg-paper'}`}>
              <span className="flex justify-between gap-2">
                <span className="font-semibold">{o.customer?.name ?? (o.customer_declined ? 'Customer declined' : 'No customer')}</span>
                <span className="tabular font-bold">{naira(o.subtotal_kobo)}</span>
              </span>
              <span className="text-sm text-ink-soft">
                {o.receipt_no} · {o.lines?.length ?? 0} item{o.lines?.length === 1 ? '' : 's'} · from {o.rep ?? 'unknown'} · {minutesAgo(o.placed_at)} min ago
              </span>
              {o.discount_requested_kobo ? (
                <span className="text-sm font-medium text-warn">Discount promised: {naira(o.discount_requested_kobo)}</span>
              ) : null}
            </button>
          ))}
        </section>

        <section>
          {order ? (
            <OrderPanel key={order.sale_id} me={me} order={order} supabase={supabase}
              onChanged={loadQueue}
              onPaid={(saleId) => router.push(`/receipt/${saleId}?new=1`)} />
          ) : (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-ink-soft">
              Choose an order to take payment.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function OrderPanel({
  me, order, supabase, onChanged, onPaid,
}: {
  me: Me; order: QueueOrder; supabase: ReturnType<typeof createClient>;
  onChanged: () => void; onPaid: (saleId: string) => void;
}) {
  const quickLimit = Number(me.settings.discount_quick_max_kobo ?? 0);
  const canDiscount = can(me, 'sales.apply_discount');
  const canRemove = can(me, 'sales.cancel');
  const authorisers = me.authorisers ?? [];

  const [discount, setDiscount] = useState(order.discount_requested_kobo ? fromKobo(order.discount_requested_kobo) : '');
  const [authorisedBy, setAuthorisedBy] = useState(can(me, 'sales.discount') ? me.user_id : '');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState(authorisers[0]?.user_id ?? '');
  const [pin, setPin] = useState('');
  const [removing, setRemoving] = useState<{ lineId: number | 'order'; reason: string } | null>(null);

  const discountKobo = canDiscount ? Math.min(toKobo(discount), order.subtotal_kobo) : 0;
  const total = order.subtotal_kobo - discountKobo;
  const paid = payments.reduce((s, p) => s + toKobo(p.amount), 0);
  const left = total - paid;
  const preApproved = order.discount_approved_kobo != null && discountKobo <= order.discount_approved_kobo;
  const needsPin = discountKobo > quickLimit && !preApproved;
  const needsAuthoriser = discountKobo > 0 && !preApproved && !needsPin && !authorisedBy;
  const accountsMissing = payments.some((p) => p.method !== 'cash' && !p.accountId);
  const ready = payments.length > 0 && left === 0 && !needsPin && !needsAuthoriser && !accountsMissing && !busy;

  const accountsFor = (m: Method) => me.payment_accounts.filter((a) => (m === 'transfer' ? a.transfer : m === 'card' ? a.card : m === 'online' ? a.online : false));
  const methods = (['cash', 'transfer', 'card', 'online'] as Method[]).filter((m) => m === 'cash' || accountsFor(m).length > 0);

  function addPayment(method: Method) {
    const accounts = accountsFor(method);
    setPayments((ps) => [...ps, {
      key: Date.now(), method,
      accountId: accounts.length === 1 ? accounts[0].id : null,
      amount: fromKobo(Math.max(0, total - ps.reduce((s, p) => s + toKobo(p.amount), 0))),
    }]);
  }
  const updatePayment = (key: number, patch: Partial<Payment>) =>
    setPayments((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) {
      setError(error.message);
      return null;
    }
    return data as T;
  }

  async function approveWithPin() {
    const res = await call<{ ok: boolean; message?: string }>('pos_approve_discount_with_pin', {
      p_sale_id: order.sale_id, p_approver_id: pinFor, p_pin: pin, p_amount_kobo: discountKobo,
    });
    setPin('');
    if (res && !res.ok) setError(res.message ?? 'Not approved.');
    if (res?.ok) onChanged();
  }

  async function completeSale() {
    if (!ready) return;
    const res = await call<{ sale_id: string }>('pos_checkout', {
      p_sale_id: order.sale_id,
      p_payments: payments.map((p) => ({ method: p.method, account_id: p.method === 'cash' ? null : p.accountId, amount_kobo: toKobo(p.amount) })),
      p_discount_kobo: discountKobo,
      p_receipt_note: note || null,
      p_authorised_by: discountKobo > 0 && !preApproved ? authorisedBy || null : null,
    });
    if (res) onPaid(res.sale_id);
  }

  async function confirmRemove() {
    if (!removing?.reason.trim()) return;
    const ok = removing.lineId === 'order'
      ? await call('pos_cancel_order', { p_sale_id: order.sale_id, p_reason: removing.reason })
      : await call('pos_remove_order_line', { p_line_id: removing.lineId, p_reason: removing.reason });
    if (ok) {
      setRemoving(null);
      setPayments([]);
      onChanged();
    }
  }

  const box = 'rounded-xl border border-line bg-panel p-4';
  const field = 'rounded-lg border border-line bg-panel px-3 py-2.5';
  return (
    <div className="flex flex-col gap-3">
      <div className={box}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{order.receipt_no}</h2>
          <span className="text-sm text-ink-soft">
            {order.customer ? `${order.customer.name} · ${order.customer.phone}` : order.customer_declined ? 'Customer declined to give details' : ''}
          </span>
        </div>
        {order.rep_note && <p className="mb-2 rounded-lg bg-paper px-3 py-2 text-sm">Note from {order.rep}: {order.rep_note}</p>}
        <ul className="flex flex-col divide-y divide-line">
          {(order.lines ?? []).map((l) => (
            <li key={l.id} className="flex flex-col gap-1 py-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{l.qty > 1 ? `${l.qty} × ` : ''}{l.item_name}</span>
                <span className="tabular font-semibold">{naira(l.qty * l.unit_price_kobo)}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-ink-soft">
                {l.imei && <span className="font-mono">IMEI {l.imei}</span>}
                {l.price_tier === 'wholesale' && <span className="text-warn">Wholesale price</span>}
                {canRemove && (order.lines?.length ?? 0) > 1 && (
                  <button onClick={() => setRemoving({ lineId: l.id, reason: '' })} className="ml-auto text-bad underline">Remove</button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
          <span>Items</span><span className="tabular">{naira(order.subtotal_kobo)}</span>
        </div>
      </div>

      {removing && (
        <div className={`${box} flex flex-col gap-2 border-bad`}>
          <p className="font-semibold">{removing.lineId === 'order' ? 'Cancel the whole order?' : 'Remove this item?'} Say why:</p>
          <div className="flex flex-wrap gap-2">
            {REMOVE_REASONS.map((r) => (
              <button key={r} onClick={() => setRemoving({ ...removing, reason: r })}
                className={`rounded-full border px-3 py-1 text-sm ${removing.reason === r ? 'border-bad bg-bad-soft text-bad' : 'border-line'}`}>{r}</button>
            ))}
          </div>
          <input value={removing.reason} onChange={(e) => setRemoving({ ...removing, reason: e.target.value })}
            placeholder="Or type a reason" className={field} />
          <div className="flex gap-2">
            <button onClick={confirmRemove} disabled={busy || !removing.reason.trim()}
              className="rounded-lg bg-bad px-4 py-2.5 font-semibold text-white disabled:opacity-40">
              {removing.lineId === 'order' ? 'Cancel order' : 'Remove item'}
            </button>
            <button onClick={() => setRemoving(null)} className="rounded-lg border border-line px-4 py-2.5 font-semibold">Keep it</button>
          </div>
        </div>
      )}

      {canDiscount && (
        <div className={`${box} flex flex-col gap-2`}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Discount, ₦ {order.discount_requested_kobo ? <span className="font-normal text-warn">(promised on the floor: {naira(order.discount_requested_kobo)})</span> : null}
            <input inputMode="numeric" value={discount} onChange={(e) => { setDiscount(e.target.value.replace(/[^\d.]/g, '')); setPayments([]); }}
              placeholder="0" className={`${field} max-w-xs`} />
          </label>
          {discountKobo > 0 && preApproved && <p className="text-sm text-brand">Approved by a manager’s PIN.</p>}
          {discountKobo > 0 && !preApproved && !needsPin && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Who authorised it?
              <select value={authorisedBy} onChange={(e) => setAuthorisedBy(e.target.value)} className={`${field} max-w-xs`}>
                <option value="">Choose…</option>
                {authorisers.map((a) => <option key={a.user_id} value={a.user_id}>{a.name}</option>)}
              </select>
              <span className="font-normal text-ink-soft">They’ll get an alert listing the items and the discount.</span>
            </label>
          )}
          {needsPin && (
            <div className="flex flex-col gap-2 rounded-lg bg-warn-soft p-3 text-warn">
              <p className="text-sm font-medium">A discount above {naira(quickLimit)} needs a manager’s PIN.</p>
              <div className="flex flex-wrap gap-2">
                <select value={pinFor} onChange={(e) => setPinFor(e.target.value)} className={field}>
                  {authorisers.map((a) => <option key={a.user_id} value={a.user_id}>{a.name}</option>)}
                </select>
                <input type="password" inputMode="numeric" autoComplete="off" value={pin} placeholder="PIN"
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={`${field} w-28`} />
                <button onClick={approveWithPin} disabled={busy || pin.length < 4 || !pinFor}
                  className="rounded-lg bg-warn px-4 py-2.5 font-semibold text-white disabled:opacity-40">Approve</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={`${box} flex flex-col gap-3`}>
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">Payment</h3>
          <span className="text-2xl font-bold tabular">{naira(total)}</span>
        </div>
        {payments.map((p) => (
          <div key={p.key} className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-medium">{METHOD_LABEL[p.method]}</span>
            {p.method !== 'cash' && (
              <select value={p.accountId ?? ''} onChange={(e) => updatePayment(p.key, { accountId: Number(e.target.value) || null })}
                className={`${field} ${p.accountId ? '' : 'border-warn'}`}>
                <option value="">Which account?</option>
                {accountsFor(p.method).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <input inputMode="numeric" value={p.amount} onChange={(e) => updatePayment(p.key, { amount: e.target.value.replace(/[^\d.]/g, '') })}
              className={`${field} tabular w-36`} aria-label={`${METHOD_LABEL[p.method]} amount`} />
            <button onClick={() => setPayments((ps) => ps.filter((x) => x.key !== p.key))} className="text-sm text-bad underline">Remove</button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <button key={m} onClick={() => addPayment(m)} disabled={left <= 0 && payments.length > 0}
              className="rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-paper disabled:opacity-40">
              + {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
        {payments.length > 0 && left !== 0 && (
          <p className={`text-sm font-medium ${left > 0 ? 'text-warn' : 'text-bad'}`}>
            {left > 0 ? `${naira(left)} still to pay` : `${naira(-left)} too much`}
          </p>
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note on the receipt (optional)" className={field} />
      </div>

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      <button onClick={completeSale} disabled={!ready}
        className="rounded-lg bg-brand px-4 py-4 text-lg font-bold text-white disabled:opacity-40">
        {busy ? 'Working…' : `Complete sale · ${naira(total)}`}
      </button>
      {canRemove && !removing && (
        <button onClick={() => setRemoving({ lineId: 'order', reason: '' })} className="self-start text-sm text-bad underline">
          Cancel this order
        </button>
      )}
    </div>
  );
}
