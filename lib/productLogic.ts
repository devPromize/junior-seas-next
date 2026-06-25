// lib/productLogic.ts
//
// Pure, framework-free product helpers — no "use server"/"use client", no
// Supabase, no next/headers. Safe to import from BOTH server modules
// (lib/services/productService.ts) and client components (ui/components/ProductCard.tsx),
// and easy to unit-test in isolation.
//
// These were extracted from fetchProducts() and ProductCard so the tricky bits
// (TB→GB conversion, variant matching, price labels, stock) have one source of truth.

export interface VariantFilter {
  ram?: string;
  rom?: string;
  color?: string;
}

export interface PriceBounds {
  price_min?: number;
  price_max?: number;
}

/** Normalize RAM strings: uppercase + strip all whitespace. "8 gb" → "8GB". */
export const normalizeRam = (raw?: string): string =>
  raw?.toUpperCase().replace(/\s+/g, "") || "";

/**
 * Normalize ROM/storage to a number of GB.
 * Converts terabytes to gigabytes (×1024) so "1TB" and "1024GB" compare equal.
 * Returns NaN when there's no parseable value.
 */
export const normalizeRom = (raw?: string): number => {
  if (!raw) return NaN;
  const s = String(raw).trim().toUpperCase();
  if (s.includes("TB")) {
    const num = parseFloat(s.replace(/[^\d.]/g, "")) || 0;
    return Math.round(num * 1024);
  }
  const num = parseFloat(s.replace(/[^\d.]/g, "")) || NaN;
  return num;
};

/** Normalize colour: trimmed + lowercased. "  Black " → "black". */
export const normalizeColor = (raw?: string): string =>
  raw?.trim().toLowerCase() || "";

/** Lowest numeric variant price for a product; Infinity when there is none. */
export const getLowestPrice = (product: any): number => {
  if (!Array.isArray(product?.variants)) return Infinity;
  const prices = product.variants
    .map((v: any) => Number(v?.price))
    .filter((n: number) => !Number.isNaN(n));
  return prices.length ? Math.min(...prices) : Infinity;
};

/**
 * Filter products by variant attributes (ram/rom/color), matching the original
 * fetchProducts behaviour:
 * - if nothing is requested, products are returned unchanged (no filtering);
 * - a product with no variants is excluded once any filter is active;
 * - a product matches if ANY of its variants matches all requested attributes.
 */
export const filterByVariant = (products: any[], filter: VariantFilter): any[] => {
  const requestedRam = filter.ram ? normalizeRam(filter.ram) : "";
  const requestedRom = filter.rom ? normalizeRom(filter.rom) : NaN;
  const requestedColor = filter.color ? normalizeColor(filter.color) : "";

  if (!requestedRam && Number.isNaN(requestedRom) && !requestedColor) {
    return products;
  }

  return products.filter((p: any) => {
    const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
    if (!variants.length) return false;

    return variants.some((v: any) => {
      const ramMatches = requestedRam ? normalizeRam(v?.ram) === requestedRam : true;
      const romMatches = !Number.isNaN(requestedRom)
        ? normalizeRom(v?.rom) === requestedRom
        : true;
      const colorMatches = requestedColor
        ? normalizeColor(v?.color) === requestedColor
        : true;
      return ramMatches && romMatches && colorMatches;
    });
  });
};

/**
 * Filter products by price range. A product is kept if ANY variant's price
 * falls within [price_min, price_max]. No bounds → unchanged.
 */
export const filterByPrice = (products: any[], bounds: PriceBounds): any[] => {
  const { price_min, price_max } = bounds;
  if (price_min === undefined && price_max === undefined) return products;

  return products.filter((p: any) =>
    (p?.variants || []).some((v: any) => {
      const price = Number(v?.price);
      if (Number.isNaN(price)) return false;
      if (price_min !== undefined && price < price_min) return false;
      if (price_max !== undefined && price > price_max) return false;
      return true;
    })
  );
};

/** Sort products by their lowest variant price. Returns a NEW array (no mutation). */
export const sortByPrice = (
  products: any[],
  order: "asc" | "desc" = "desc"
): any[] =>
  [...products].sort((a, b) => {
    const priceA = getLowestPrice(a);
    const priceB = getLowestPrice(b);
    return order === "asc" ? priceA - priceB : priceB - priceA;
  });

/** Slice a list to a single page (1-based page numbers). */
export const paginate = <T>(items: T[], page = 1, limit = 20): T[] => {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
};

/**
 * Build the price label shown on a product card:
 * a single price ("₦120,000") or a range ("₦120,000 - ₦150,000").
 */
export const getPriceLabel = (product: any): string => {
  const priceNumbers = (product?.variants ?? []).map((v: any) => Number(v?.price ?? 0));
  const minPrice = priceNumbers.length ? Math.min(...priceNumbers) : 0;
  const maxPrice = priceNumbers.length ? Math.max(...priceNumbers) : 0;
  return minPrice === maxPrice
    ? `₦${minPrice.toLocaleString()}`
    : `₦${minPrice.toLocaleString()} - ₦${maxPrice.toLocaleString()}`;
};

/**
 * A product is out of stock when inStock is explicitly false, or every variant
 * reports 0 stock. (An empty variants array counts as out of stock, matching the
 * original ProductCard behaviour where [].every(...) === true.)
 */
export const isProductOutOfStock = (product: any): boolean =>
  product?.inStock === false ||
  (Array.isArray(product?.variants) &&
    product.variants.every((v: any) => Number(v?.stock ?? 0) === 0));
