// Shared by the Duplicates page (server) and its review screen (browser).
import { nairaToKobo } from '@/lib/products';

export type Copy = {
  id: number; sku: string; price_kobo: number; wholesale_price_kobo: number | null; cost_kobo: number | null; tracks_imei: boolean;
  stock: number; sold: number; last_sold: string | null; last_bought: string | null; category: string | null; brand: string | null;
};
export type Group = { name: string; stock: number; suggested_keep: number; same_price: boolean; mixed_imei: boolean; copies: Copy[] };

// What's been chosen for one group: which copy to keep, which price, and (for groups whose
// prices are far apart) whether someone has looked at it.
export type Choice = { keep: number; price: string; custom: string; checked: boolean; status: 'open' | 'merging' | 'done' | 'error'; error?: string };

// Prices more than 50% apart are worth a look before merging: a mistake, or two different products.
export const bigGap = (g: Group) => {
  const prices = g.copies.map((c) => c.price_kobo).filter((p) => p > 0);
  return prices.length > 1 && Math.max(...prices) > Math.min(...prices) * 1.5;
};

export const initialChoice = (g: Group): Choice => ({
  keep: g.suggested_keep,
  price: String(g.copies.find((c) => c.id === g.suggested_keep)?.price_kobo ?? ''),
  custom: '', checked: !bigGap(g), status: 'open',
});

export const chosenPrice = (c: Choice) => (c.price === 'custom' ? nairaToKobo(c.custom) : Number(c.price));

export const mergeableCopies = (g: Group, c: Choice) => {
  const kept = g.copies.find((x) => x.id === c.keep)!;
  return g.copies.filter((x) => x.id !== c.keep && x.tracks_imei === kept.tracks_imei);
};
