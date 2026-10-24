import Link from 'next/link';
import { can, type Me } from '@/lib/pos';

export const MONEY_TABS = [
  { key: 'overview', href: '/money', label: 'Today', anyOf: ['money.view'] },
  { key: 'confirm', href: '/money/confirm', label: 'Payments to confirm', anyOf: ['money.view', 'accounts.manage'] },
  { key: 'bills', href: '/money/bills', label: 'Supplier bills', anyOf: ['money.view', 'suppliers.pay'] },
  { key: 'expenses', href: '/money/expenses', label: 'Expenses', anyOf: ['money.view', 'expenses.manage'] },
  { key: 'cash-up', href: '/money/cash-up', label: 'Cash-up', anyOf: ['till.manage'] },
  { key: 'accounts', href: '/money/accounts', label: 'Bank & card accounts', anyOf: ['accounts.manage'] },
] as const;

export const moneyTabsFor = (me: Me) => MONEY_TABS.filter((t) => t.anyOf.some((p) => can(me, p)));

export default function MoneyTabs({ me, active }: { me: Me; active: (typeof MONEY_TABS)[number]['key'] }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {moneyTabsFor(me).map((t) => (
        <Link key={t.key} href={t.href}
          className={`rounded-lg px-4 py-2 font-semibold ${t.key === active ? 'bg-brand text-white' : 'border border-line bg-panel'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
