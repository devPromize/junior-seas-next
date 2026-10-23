import { can, type Me } from '@/lib/pos';

// The sidebar. Each person sees only the sections their role allows. Sections without an
// href are on the way: they show greyed out, so everyone can see what's coming.
export type NavItem = { label: string; href?: string; anyOf: string[] };

export const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', anyOf: ['reports.view', 'sales.view_all', 'sales.view_floor'] },
  { label: 'Sell', href: '/sell', anyOf: ['sales.create'] },
  { label: 'Checkout', href: '/checkout', anyOf: ['sales.checkout'] },
  { label: 'Sales', href: '/sales', anyOf: ['sales.view_own', 'sales.view_floor', 'sales.view_all', 'sales.refund'] },
  { label: 'Products', href: '/products', anyOf: ['products.manage', 'prices.edit', 'prices.wholesale', 'stock.adjust', 'costs.view'] },
  { label: 'Stock', href: '/stock', anyOf: ['stock.receive', 'stock.adjust', 'stock.transfer', 'costs.view'] },
  { label: 'Customers', anyOf: ['sales.view_floor', 'sales.view_all', 'customers.export'] },
  { label: 'Staff', href: '/staff', anyOf: ['staff.manage'] },
  { label: 'Money', href: '/money', anyOf: ['money.view', 'suppliers.pay', 'expenses.manage', 'till.manage', 'settings.manage'] },
  { label: 'Reports', anyOf: ['reports.view'] },
  { label: 'Settings', href: '/settings', anyOf: ['settings.manage'] },
];

export const canSee = (me: Me, item: NavItem) => item.anyOf.some((p) => can(me, p));
export const navFor = (me: Me) => NAV.filter((item) => canSee(me, item));

// Where someone lands after signing in: the dashboard if they can see it, otherwise their
// first working section (for a rep, that's Sell).
export function homeFor(me: Me): string {
  return navFor(me).find((item) => item.href)?.href ?? '/';
}
