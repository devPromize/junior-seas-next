// lib/cartLogic.ts
//
// Pure cart helpers — no React, no toast, no localStorage. Extracted from
// CartContext so the dedupe / totals / quantity rules can be unit-tested
// without rendering a provider. CartContext re-exports CartItem from here.

export interface CartItem {
  _id: string;
  productId: string | number;
  variantId?: string | number | null;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  meta?: any;
}

export type CartInput = Partial<CartItem> & { quantity?: number };

/** Apply the same defaults the cart uses when turning raw input into a CartItem. */
export const buildCartItem = (incoming: CartInput): CartItem => {
  const id = String(incoming._id);
  return {
    _id: id,
    productId: incoming.productId ?? id,
    variantId: incoming.variantId ?? null,
    name: incoming.name ?? "Product",
    price: Number(incoming.price ?? 0),
    image: incoming.image ?? "/placeholder.png",
    quantity: Number(incoming.quantity ?? 1),
    meta: incoming.meta ?? {},
  };
};

/**
 * Add an item to the cart, deduped by _id.
 * If an item with the same _id already exists, the cart is returned unchanged
 * and `added` is false (matches the original "refuse duplicates" behaviour).
 */
export const addItemToCart = (
  items: CartItem[],
  incoming: CartInput
): { items: CartItem[]; added: boolean } => {
  const id = String(incoming._id);
  if (items.some((i) => i._id === id)) {
    return { items, added: false };
  }
  return { items: [...items, buildCartItem(incoming)], added: true };
};

/** Total price across the cart: Σ price × quantity. */
export const calculateTotal = (items: CartItem[]): number =>
  items.reduce((acc, item) => acc + item.price * item.quantity, 0);

/**
 * Set an item's quantity. Items whose quantity drops to 0 or below are removed,
 * matching the original updateQuantity behaviour.
 */
export const setItemQuantity = (
  items: CartItem[],
  id: string,
  quantity: number
): CartItem[] =>
  items
    .map((item) => (item._id === id ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);
