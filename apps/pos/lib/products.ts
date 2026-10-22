// Shapes returned by the products and stock entry points (public.pos_product*, pos_receive_stock…).

export type ProductRow = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  price_kobo: number;
  wholesale_price_kobo: number | null;
  cost_kobo: number | null;          // null unless the person may see costs
  tracks_imei: boolean;
  is_active: boolean;
  show_online: boolean;
  stock: number;
  by_department: Record<string, number>;
};

export type ProductOptions = {
  categories: { id: number; name: string; warranty_days: number | null }[];
  brands: { id: number; name: string }[];
  departments: { id: number; name: string }[];
  suppliers: string[];
  can: { manage: boolean; prices: boolean; wholesale: boolean; costs: boolean; receive: boolean; move: boolean; adjust: boolean };
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  category_id: number | null;
  brand_id: number | null;
  price_kobo: number;
  min_price_kobo: number | null;
  wholesale_price_kobo: number | null;
  wholesale_min_qty: number | null;
  cost_kobo: number | null;
  tracks_imei: boolean;
  warranty_days: number | null;
  show_online: boolean;
  is_active: boolean;
  stock: { department_id: number; department: string; qty: number }[];
  phones: { unit_id: string; department_id: number; status: string; codes: string[] | null; cost_kobo: number | null; received_at: string | null }[];
  history: { at: string; reason: string; qty: number; department: string; by: string | null; note: string | null; code: string | null }[];
};

export const REASON_LABEL: Record<string, string> = {
  opening: 'Opening stock',
  sale: 'Sold',
  sale_cancelled: 'Sale cancelled',
  return: 'Returned',
  purchase: 'Received',
  transfer_out: 'Moved out',
  transfer_in: 'Moved in',
  adjustment: 'Adjusted',
  count: 'Stock count',
  correction: 'Correction',
  repair_part: 'Used in a repair',
  online_order: 'Online order',
};

// "15000" or "15,000.50" typed by a person -> kobo. Empty -> null.
export function nairaToKobo(text: string): number | null {
  const clean = text.replace(/[^\d.]/g, '');
  return clean === '' ? null : Math.round(Number(clean) * 100);
}
export const koboToNaira = (kobo: number | null | undefined) => (kobo == null ? '' : String(kobo / 100));
