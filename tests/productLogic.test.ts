import { describe, it, expect } from "vitest";
import {
  normalizeRam,
  normalizeRom,
  normalizeColor,
  getLowestPrice,
  filterByVariant,
  filterByPrice,
  sortByPrice,
  paginate,
  getPriceLabel,
  isProductOutOfStock,
  isVariantOutOfStock,
} from "@/lib/productLogic";

// Small helpers to build product fixtures without a database.
const product = (overrides: any = {}) => ({
  id: 1,
  name: "Test Phone",
  variants: [],
  ...overrides,
});
const variant = (overrides: any = {}) => ({
  ram: "8GB",
  rom: "256GB",
  color: "Black",
  price: 100000,
  stock: 5,
  ...overrides,
});

describe("normalizeRam", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizeRam("8 gb")).toBe("8GB");
    expect(normalizeRam("  16gb ")).toBe("16GB");
  });

  it("returns empty string for undefined/empty", () => {
    expect(normalizeRam(undefined)).toBe("");
    expect(normalizeRam("")).toBe("");
  });
});

describe("normalizeRom — the TB→GB conversion (most error-prone bit)", () => {
  it("parses plain GB values to a number", () => {
    expect(normalizeRom("256GB")).toBe(256);
    expect(normalizeRom("128 gb")).toBe(128);
  });

  it("converts TB to GB by multiplying by 1024", () => {
    expect(normalizeRom("1TB")).toBe(1024);
    expect(normalizeRom("2 TB")).toBe(2048);
  });

  it("makes 1TB and 1024GB compare equal", () => {
    expect(normalizeRom("1TB")).toBe(normalizeRom("1024GB"));
  });

  it("handles fractional TB", () => {
    expect(normalizeRom("0.5TB")).toBe(512);
  });

  it("returns NaN when there is nothing to parse", () => {
    expect(normalizeRom(undefined)).toBeNaN();
    expect(normalizeRom("")).toBeNaN();
    expect(normalizeRom("abc")).toBeNaN();
  });
});

describe("normalizeColor", () => {
  it("trims and lowercases", () => {
    expect(normalizeColor("  Black ")).toBe("black");
    expect(normalizeColor("SPACE GRAY")).toBe("space gray");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeColor(undefined)).toBe("");
  });
});

describe("getLowestPrice", () => {
  it("returns the minimum variant price", () => {
    const p = product({
      variants: [variant({ price: 150000 }), variant({ price: 90000 }), variant({ price: 120000 })],
    });
    expect(getLowestPrice(p)).toBe(90000);
  });

  it("ignores non-numeric prices", () => {
    const p = product({ variants: [variant({ price: "oops" }), variant({ price: 80000 })] });
    expect(getLowestPrice(p)).toBe(80000);
  });

  it("returns Infinity when there are no variants", () => {
    expect(getLowestPrice(product({ variants: [] }))).toBe(Infinity);
    expect(getLowestPrice(product({ variants: undefined }))).toBe(Infinity);
  });
});

describe("filterByVariant", () => {
  const products = [
    product({ id: 1, variants: [variant({ ram: "8GB", rom: "256GB", color: "Black" })] }),
    product({ id: 2, variants: [variant({ ram: "12GB", rom: "512GB", color: "Blue" })] }),
    product({ id: 3, variants: [variant({ ram: "8GB", rom: "1TB", color: "Black" })] }),
  ];

  it("returns everything unchanged when no filter is given", () => {
    expect(filterByVariant(products, {})).toHaveLength(3);
  });

  it("matches RAM regardless of spacing/case", () => {
    const result = filterByVariant(products, { ram: "8 gb" });
    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });

  it("matches ROM with TB/GB equivalence", () => {
    const result = filterByVariant(products, { rom: "1024GB" });
    expect(result.map((p) => p.id)).toEqual([3]); // the 1TB variant
  });

  it("matches color case-insensitively", () => {
    const result = filterByVariant(products, { color: "blue" });
    expect(result.map((p) => p.id)).toEqual([2]);
  });

  it("requires ALL requested attributes to match on the SAME variant", () => {
    const result = filterByVariant(products, { ram: "8GB", color: "Blue" });
    expect(result).toHaveLength(0); // no variant is both 8GB and Blue
  });

  it("excludes products with no variants once a filter is active", () => {
    const withEmpty = [...products, product({ id: 4, variants: [] })];
    const result = filterByVariant(withEmpty, { ram: "8GB" });
    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });
});

describe("filterByPrice", () => {
  const products = [
    product({ id: 1, variants: [variant({ price: 50000 })] }),
    product({ id: 2, variants: [variant({ price: 150000 })] }),
    product({ id: 3, variants: [variant({ price: 90000 }), variant({ price: 300000 })] }),
  ];

  it("returns everything unchanged when no bounds are given", () => {
    expect(filterByPrice(products, {})).toHaveLength(3);
  });

  it("keeps products with a variant at or above price_min", () => {
    const result = filterByPrice(products, { price_min: 100000 });
    expect(result.map((p) => p.id)).toEqual([2, 3]); // 3 has a 300k variant
  });

  it("keeps products with a variant at or below price_max", () => {
    const result = filterByPrice(products, { price_max: 100000 });
    expect(result.map((p) => p.id)).toEqual([1, 3]); // 3 has a 90k variant
  });

  it("applies min and max together", () => {
    const result = filterByPrice(products, { price_min: 80000, price_max: 200000 });
    expect(result.map((p) => p.id)).toEqual([2, 3]);
  });
});

describe("sortByPrice", () => {
  const products = [
    product({ id: "a", variants: [variant({ price: 120000 })] }),
    product({ id: "b", variants: [variant({ price: 80000 })] }),
    product({ id: "c", variants: [variant({ price: 200000 })] }),
  ];

  it("sorts ascending by lowest variant price", () => {
    expect(sortByPrice(products, "asc").map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts descending by lowest variant price", () => {
    expect(sortByPrice(products, "desc").map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [...products];
    sortByPrice(input, "asc");
    expect(input.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("paginate", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("returns the first page", () => {
    expect(paginate(items, 1, 3)).toEqual([1, 2, 3]);
  });

  it("returns a middle page", () => {
    expect(paginate(items, 2, 3)).toEqual([4, 5, 6]);
  });

  it("returns a partial final page", () => {
    expect(paginate(items, 4, 3)).toEqual([10]);
  });

  it("returns empty for a page past the end", () => {
    expect(paginate(items, 99, 3)).toEqual([]);
  });
});

describe("getPriceLabel", () => {
  // Build expectations with the same toLocaleString call so the test is locale-agnostic.
  const naira = (n: number) => `₦${n.toLocaleString()}`;

  it("shows a single price when all variants cost the same", () => {
    const p = product({ variants: [variant({ price: 120000 }), variant({ price: 120000 })] });
    expect(getPriceLabel(p)).toBe(naira(120000));
  });

  it("shows a range when prices differ", () => {
    const p = product({ variants: [variant({ price: 120000 }), variant({ price: 150000 })] });
    expect(getPriceLabel(p)).toBe(`${naira(120000)} - ${naira(150000)}`);
  });

  it("falls back to ₦0 when there are no variants", () => {
    expect(getPriceLabel(product({ variants: [] }))).toBe(naira(0));
  });
});

describe("isProductOutOfStock", () => {
  it("is out of stock when inStock is explicitly false", () => {
    expect(isProductOutOfStock(product({ inStock: false, variants: [variant({ stock: 5 })] }))).toBe(true);
  });

  it("is out of stock when every variant has 0 stock", () => {
    const p = product({ variants: [variant({ stock: 0 }), variant({ stock: 0 })] });
    expect(isProductOutOfStock(p)).toBe(true);
  });

  it("is in stock when at least one variant has stock", () => {
    const p = product({ variants: [variant({ stock: 0 }), variant({ stock: 3 })] });
    expect(isProductOutOfStock(p)).toBe(false);
  });

  it("treats an empty variants array as out of stock (matches original card behaviour)", () => {
    expect(isProductOutOfStock(product({ variants: [] }))).toBe(true);
  });
});

describe("isVariantOutOfStock", () => {
  it("is out of stock when stock is 0", () => {
    expect(isVariantOutOfStock(variant({ stock: 0 }))).toBe(true);
  });

  it("is out of stock when stock is missing", () => {
    expect(isVariantOutOfStock({ ram: "8GB" })).toBe(true);
  });

  it("is in stock when stock is positive", () => {
    expect(isVariantOutOfStock(variant({ stock: 3 }))).toBe(false);
  });
});
