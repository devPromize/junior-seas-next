// Shared POS types and helpers.

// A department: Mobile Phones, Accessories, Spare Parts & Repairs. Staff see only the ones the
// owner gave them access to; the owner sees all of them.
export type Department = { id: number; code: string; name: string };
export type PaymentAccount = { id: number; name: string; transfer: boolean; card: boolean; online: boolean };
export type Person = { user_id: string; name: string };

// What public.pos_me() returns.
export type Me = {
  user_id: string;
  name: string;
  role: string;
  is_owner: boolean;
  has_pin: boolean;
  permissions: string[];
  departments: Department[];
  payment_accounts: PaymentAccount[];
  authorisers: Person[] | null;
  settings: Record<string, unknown>;
};

export const can = (me: Me, permission: string) => me.is_owner || me.permissions.includes(permission);

// Money is stored in kobo. 2850000 kobo -> "₦28,500".
export function naira(kobo: number): string {
  const value = kobo / 100;
  return '₦' + value.toLocaleString('en-NG', {
    minimumFractionDigits: kobo % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
