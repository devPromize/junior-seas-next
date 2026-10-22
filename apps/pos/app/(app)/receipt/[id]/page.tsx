import Link from 'next/link';
import { getMe } from '@/lib/me';
import { createClient } from '@/lib/supabase/server';
import { naira } from '@/lib/pos';
import ReceiptActions from './ReceiptActions';

export type Receipt = {
  business: { name: string; address: string; phones: string; receipt_footer: string } | null;
  sale_id: string; receipt_no: string; status: string; placed_at: string; paid_at: string | null;
  sold_by: string | null; checked_out_by: string | null;
  customer: { name: string; phone: string } | null;
  lines: { name: string; qty: number; unit_price_kobo: number; discount_kobo: number; price_tier: string;
           codes: string[] | null; warranty_days: number | null }[];
  subtotal_kobo: number; discount_kobo: number; total_kobo: number;
  payments: { method: string; account: string | null; amount_kobo: number }[];
  note: string | null;
};

const METHOD: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', card: 'Card', online: 'Online' };
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

// One receipt per order, whichever departments the items came from. Sized for an 80 mm
// receipt printer; on screen it sits in the middle with Print and WhatsApp buttons.
export default async function ReceiptPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }>;
}) {
  const { me } = await getMe();
  if (!me) return null;
  const [{ id }, { new: justPaid }] = await Promise.all([params, searchParams]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_receipt', { p_sale_id: id });
  if (error) return <main className="mx-auto max-w-md px-4 py-6"><p className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error.message}</p></main>;
  const r = data as Receipt;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      {justPaid && (
        <p className="rounded-lg bg-brand-soft px-4 py-3 font-semibold text-brand print:hidden">
          Paid · {naira(r.total_kobo)}
        </p>
      )}
      <ReceiptActions receipt={r} />

      <article className="receipt mx-auto w-full max-w-[80mm] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow print:shadow-none">
        <header className="mb-2 text-center">
          <p className="text-[15px] font-bold">{r.business?.name ?? 'Junior Seas Tech'}</p>
          {r.business?.address && <p>{r.business.address}</p>}
          {r.business?.phones && <p>{r.business.phones}</p>}
        </header>
        <Rule />
        <p>Receipt: {r.receipt_no}</p>
        <p>Date: {when(r.paid_at ?? r.placed_at)}</p>
        {r.customer && <p>Customer: {r.customer.name} ({r.customer.phone})</p>}
        {r.sold_by && <p>Sold by: {r.sold_by}</p>}
        {r.checked_out_by && <p>Cashier: {r.checked_out_by}</p>}
        {r.status !== 'paid' && <p className="font-bold">NOT PAID ({r.status.toUpperCase()})</p>}
        <Rule />
        {r.lines.map((l, i) => (
          <div key={i} className="mb-1">
            <p className="font-bold">{l.name}</p>
            {l.codes?.length ? <p>IMEI/Serial: {l.codes.join(' / ')}</p> : null}
            <Row left={`${l.qty} × ${naira(l.unit_price_kobo)}${l.price_tier === 'wholesale' ? ' (wholesale)' : ''}`} right={naira(l.qty * l.unit_price_kobo)} />
            {l.warranty_days ? <p>Warranty: {l.warranty_days} days</p> : null}
          </div>
        ))}
        <Rule />
        <Row left="Subtotal" right={naira(r.subtotal_kobo)} />
        {r.discount_kobo > 0 && <Row left="Discount" right={`-${naira(r.discount_kobo)}`} />}
        <Row left={<span className="text-[14px] font-bold">TOTAL</span>} right={<span className="text-[14px] font-bold">{naira(r.total_kobo)}</span>} />
        {r.payments.map((p, i) => (
          <Row key={i} left={`${METHOD[p.method] ?? p.method}${p.account ? ` (${p.account})` : ''}`} right={naira(p.amount_kobo)} />
        ))}
        {r.note && <><Rule /><p>{r.note}</p></>}
        <Rule />
        {r.business?.receipt_footer && <p className="text-center">{r.business.receipt_footer}</p>}
      </article>

      <Link href="/checkout" className="rounded-lg bg-brand px-4 py-3 text-center font-bold text-white print:hidden">Next order</Link>
    </main>
  );
}

function Rule() {
  return <p className="my-1 overflow-hidden whitespace-nowrap">{'-'.repeat(48)}</p>;
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{left}</span>
      <span className="tabular whitespace-nowrap">{right}</span>
    </div>
  );
}
