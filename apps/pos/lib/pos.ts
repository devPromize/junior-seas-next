// Shared POS types and helpers.

export type Floor = { id: number; code: string; name: string };
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
  floors: Floor[];
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

// The cookie that remembers which floor this device is working on today.
export const FLOOR_COOKIE = 'pos_floor';
