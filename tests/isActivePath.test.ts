import { describe, it, expect } from "vitest";
import { isActivePath } from "@/lib/isActivePath";

describe("isActivePath", () => {
  it("matches the exact path", () => {
    expect(isActivePath("/account", "/account")).toBe(true);
    expect(isActivePath("/wishlist", "/wishlist")).toBe(true);
  });

  it("stays active on sub-pages (the /account/admin case)", () => {
    expect(isActivePath("/account/admin", "/account")).toBe(true);
    expect(isActivePath("/account/orders", "/account")).toBe(true);
  });

  it("does not match unrelated or prefix-lookalike paths", () => {
    expect(isActivePath("/accountants", "/account")).toBe(false);
    expect(isActivePath("/shop", "/account")).toBe(false);
  });

  it("matches Home ('/') only exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/shop", "/")).toBe(false);
    expect(isActivePath("/account/admin", "/")).toBe(false);
  });

  it("handles an empty current path", () => {
    expect(isActivePath("", "/account")).toBe(false);
  });
});
