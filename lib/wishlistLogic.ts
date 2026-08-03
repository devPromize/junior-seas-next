// lib/wishlistLogic.ts
//
// Pure wishlist helper — no React, no toast, no localStorage. Kept here so the
// merge rule can be unit-tested (mirrors lib/cartLogic).

/**
 * Combine two wishlists (a guest/localStorage list and a saved server list),
 * deduped by _id. Wishlists have no quantities, so it's a simple union that
 * preserves the first-seen item for any duplicate id.
 */
export const mergeWishlists = <T extends { _id: string }>(
  a: T[],
  b: T[]
): T[] => {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const id = String(item._id);
    if (!byId.has(id)) byId.set(id, item);
  }
  return Array.from(byId.values());
};
