// The catalogue lives on the device: loaded once from public.pos_catalogue(), then every
// search and scan is answered locally, with no network wait.

export type Item = {
  id: number;
  sku: string;
  name: string;
  price: number;              // kobo
  wholesale: number | null;   // kobo
  tracksImei: boolean;
  category: string;
  brand: string;
};

export type Unit = {
  id: string;
  itemId: number;
  departmentId: number;
  status: 'in_stock' | 'held';
  codes: string[];            // IMEI 1 (and IMEI 2) or a serial number
};

export type Catalogue = {
  loadedAt: string;
  items: Map<number, Item>;
  bySku: Map<string, Item>;
  byCode: Map<string, Unit>;               // any IMEI or serial -> the phone
  unitsByItem: Map<number, Unit[]>;
  stock: Map<string, number>;              // `${itemId}:${departmentId}` -> quantity
  searchText: Map<number, string>;         // lower-case text each item is searched by
};

type Raw = {
  loaded_at: string;
  items: [number, string, string, number, number | null, boolean, string, string][];
  stock: [number, number, number][];
  units: [string, number, number, 'in_stock' | 'held', string[] | null][];
  aliases?: [string, number][];   // old barcodes of merged duplicate products -> the product kept
};

export function buildCatalogue(raw: Raw): Catalogue {
  const items = new Map<number, Item>();
  const bySku = new Map<string, Item>();
  const searchText = new Map<number, string>();
  for (const [id, sku, name, price, wholesale, tracksImei, category, brand] of raw.items) {
    const item: Item = { id, sku, name, price, wholesale, tracksImei, category, brand };
    items.set(id, item);
    bySku.set(sku.trim(), item);
    searchText.set(id, `${name} ${sku} ${category} ${brand}`.toLowerCase());
  }

  const stock = new Map<string, number>();
  // A merged duplicate's old barcode finds the product that was kept.
  for (const [code, itemId] of raw.aliases ?? []) {
    const item = items.get(itemId);
    if (item && !bySku.has(code.trim())) bySku.set(code.trim(), item);
  }

  for (const [itemId, departmentId, qty] of raw.stock) stock.set(`${itemId}:${departmentId}`, qty);

  const byCode = new Map<string, Unit>();
  const unitsByItem = new Map<number, Unit[]>();
  for (const [id, itemId, departmentId, status, codes] of raw.units) {
    const unit: Unit = { id, itemId, departmentId, status, codes: codes ?? [] };
    for (const c of unit.codes) byCode.set(c, unit);
    const list = unitsByItem.get(itemId) ?? [];
    list.push(unit);
    unitsByItem.set(itemId, list);
  }

  return { loadedAt: raw.loaded_at, items, bySku, byCode, unitsByItem, stock, searchText };
}

export const stockOn = (cat: Catalogue, itemId: number, departmentId: number) =>
  cat.stock.get(`${itemId}:${departmentId}`) ?? 0;

// Phones of this model that can be sold right now (not held in another order).
export const phonesInStock = (cat: Catalogue, itemId: number) =>
  (cat.unitsByItem.get(itemId) ?? []).filter((u) => u.status === 'in_stock');

// What a scanner or a typed code points at: an exact phone, or an exact barcode.
export function lookupCode(cat: Catalogue, code: string): { unit?: Unit; item?: Item } {
  const c = code.trim();
  const unit = cat.byCode.get(c);
  if (unit) return { unit, item: cat.items.get(unit.itemId) };
  const item = cat.bySku.get(c);
  if (item) return { item };
  return {};
}

// Every word typed must appear somewhere in the item's name, barcode, category or brand.
export function search(cat: Catalogue, query: string, limit = 40): Item[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: Item[] = [];
  for (const [id, text] of cat.searchText) {
    if (words.every((w) => text.includes(w))) {
      out.push(cat.items.get(id)!);
      if (out.length >= limit) break;
    }
  }
  return out;
}
