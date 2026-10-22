'use client';

import { naira } from '@/lib/pos';
import type { Receipt } from './page';

// Print on the receipt printer, or send the receipt to the customer on WhatsApp from the
// shop's WhatsApp on this computer (it opens with the message ready; the cashier taps send).
export default function ReceiptActions({ receipt: r }: { receipt: Receipt }) {
  const phone = r.customer?.phone.replace(/\D/g, '');
  const text = [
    `${r.business?.name ?? 'Junior Seas Tech'}: receipt ${r.receipt_no}`,
    ...r.lines.map((l) => `${l.qty} × ${l.name}${l.codes?.length ? ` (IMEI ${l.codes[0]})` : ''}: ${naira(l.qty * l.unit_price_kobo)}`),
    ...(r.discount_kobo > 0 ? [`Discount: -${naira(r.discount_kobo)}`] : []),
    `Total paid: ${naira(r.total_kobo)}`,
    r.business?.receipt_footer ?? '',
  ].filter(Boolean).join('\n');

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button onClick={() => window.print()} className="rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold">
        Print receipt
      </button>
      {phone && (
        <a href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
          className="rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold">
          Send on WhatsApp
        </a>
      )}
    </div>
  );
}
