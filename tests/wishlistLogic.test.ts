import { describe, it, expect } from "vitest";
import { mergeWishlists } from "@/lib/wishlistLogic";

const item = (id: string, extra: Record<string, any> = {}) => ({
  _id: id,
  name: `Item ${id}`,
  price: 100,
  image: "/x.png",
  ...extra,
});

describe("mergeWishlists (combine guest + saved wishlist)", () => {
  it("unions two disjoint wishlists", () => {
    const merged = mergeWishlists([item("a")], [item("b")]);
    expect(merged.map((i) => i._id).sort()).toEqual(["a", "b"]);
  });

  it("dedupes a shared item by _id (keeps the first-seen)", () => {
    const merged = mergeWishlists(
      [item("a", { price: 100 })],
      [item("a", { price: 999 })]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].price).toBe(100); // local kept
  });

  it("returns the non-empty wishlist when the other is empty", () => {
    expect(mergeWishlists([], [item("a")])).toHaveLength(1);
    expect(mergeWishlists([item("a")], [])).toHaveLength(1);
  });

  it("coerces numeric ids so duplicates still dedupe", () => {
    const merged = mergeWishlists(
      [item("7")],
      [{ ...item("x"), _id: 7 as any }]
    );
    expect(merged).toHaveLength(1);
  });
});
