import { describe, it, expect } from "vitest";
import {
  buildCartItem,
  addItemToCart,
  calculateTotal,
  setItemQuantity,
} from "@/lib/cartLogic";

describe("buildCartItem (defaults)", () => {
  it("fills sensible defaults from minimal input", () => {
    const item = buildCartItem({ _id: "abc" });
    expect(item).toMatchObject({
      _id: "abc",
      productId: "abc", // falls back to _id
      variantId: null,
      name: "Product",
      price: 0,
      image: "/placeholder.png",
      quantity: 1,
      meta: {},
    });
  });

  it("coerces _id to a string and respects provided values", () => {
    const item = buildCartItem({ _id: 42 as any, name: "Pixel", price: 250000, quantity: 3 });
    expect(item._id).toBe("42");
    expect(item.name).toBe("Pixel");
    expect(item.price).toBe(250000);
    expect(item.quantity).toBe(3);
  });
});

describe("addItemToCart (dedupe by _id)", () => {
  it("adds a new item and reports added=true", () => {
    const { items, added } = addItemToCart([], { _id: "a", name: "A", price: 100 });
    expect(added).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0]._id).toBe("a");
  });

  it("refuses a duplicate _id and reports added=false", () => {
    const existing = [buildCartItem({ _id: "a", name: "A", price: 100 })];
    const { items, added } = addItemToCart(existing, { _id: "a", name: "A again", price: 999 });
    expect(added).toBe(false);
    expect(items).toBe(existing); // unchanged reference
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(100); // original kept, not overwritten
  });

  it("treats numeric and string _id as the same item", () => {
    const existing = [buildCartItem({ _id: "7" })];
    const { added } = addItemToCart(existing, { _id: 7 as any });
    expect(added).toBe(false);
  });

  it("does not mutate the original array when adding", () => {
    const existing = [buildCartItem({ _id: "a" })];
    addItemToCart(existing, { _id: "b" });
    expect(existing).toHaveLength(1);
  });
});

describe("calculateTotal", () => {
  it("sums price × quantity", () => {
    const items = [
      buildCartItem({ _id: "a", price: 100, quantity: 2 }),
      buildCartItem({ _id: "b", price: 50, quantity: 3 }),
    ];
    expect(calculateTotal(items)).toBe(350);
  });

  it("is 0 for an empty cart", () => {
    expect(calculateTotal([])).toBe(0);
  });
});

describe("setItemQuantity", () => {
  const base = [
    buildCartItem({ _id: "a", price: 100, quantity: 1 }),
    buildCartItem({ _id: "b", price: 50, quantity: 1 }),
  ];

  it("updates the quantity of the matching item", () => {
    const updated = setItemQuantity(base, "a", 5);
    expect(updated.find((i) => i._id === "a")?.quantity).toBe(5);
    expect(updated.find((i) => i._id === "b")?.quantity).toBe(1);
  });

  it("removes an item when quantity drops to 0", () => {
    const updated = setItemQuantity(base, "a", 0);
    expect(updated.map((i) => i._id)).toEqual(["b"]);
  });

  it("removes an item for negative quantity", () => {
    const updated = setItemQuantity(base, "b", -2);
    expect(updated.map((i) => i._id)).toEqual(["a"]);
  });

  it("does not mutate the original array", () => {
    setItemQuantity(base, "a", 9);
    expect(base.find((i) => i._id === "a")?.quantity).toBe(1);
  });
});
