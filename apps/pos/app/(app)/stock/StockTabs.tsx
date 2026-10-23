import Link from 'next/link';
import type { ProductOptions } from '@/lib/products';

export default function StockTabs({ active, can }: { active: 'purchases' | 'move'; can: ProductOptions['can'] }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-lg px-4 py-2 font-semibold ${on ? 'bg-brand text-white' : 'border border-line bg-panel'}`}>{label}</Link>
  );
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {(can.receive || can.costs) && tab('/stock/purchases', 'Purchases', active === 'purchases')}
      {can.move && tab('/stock/move', 'Move stock', active === 'move')}
      {can.adjust && <span className="text-sm text-ink-soft">To count stock or mark a phone missing, open the product.</span>}
    </nav>
  );
}
