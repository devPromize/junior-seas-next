//=================================================
// app/shop/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useProducts } from "@/hooks/useProducts";
import ProductCard from "@/ui/components/ProductCard";
import { useCategories } from "@/hooks/useCategories";
import FilterSidebar from "./components/FilterSidebar";
import MobileFilterWrapper from "./components/MobileFilterWrapper";

const ShopPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit] = useState(28); // fixed limit per page
  const { data: categories } = useCategories();

  const [category, setCategory] = useState("");
  const [ram, setRam] = useState("");
  const [rom, setRom] = useState("");
  const [priceBounds, setPriceBounds] = useState<{
    min: number;
    max: number;
  } | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
  const [sortSelection, setSortSelection] = useState("created_at_desc");

  // map UI selection to API params:
  const { sortBy, sortOrder } = useMemo(() => {
    if (sortSelection === "price_asc")
      return { sortBy: "price", sortOrder: "asc" as const };
    if (sortSelection === "price_desc")
      return { sortBy: "price", sortOrder: "desc" as const };
    return { sortBy: "created_at", sortOrder: "desc" as const };
  }, [sortSelection]);

  // reset page when filters/sort change
  useEffect(() => setPage(1), [category, ram, rom, priceRange, sortSelection]);

  // SCROLL TO TOP ON PAGE CHANGE ✅
  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [page]);

  // Load price bounds on mount
  useEffect(() => {
    const loadPriceBounds = async () => {
      try {
        const res = await fetch("/api/products/price-bounds");
        const data = await res.json();
        if (data?.minPrice !== undefined && data?.maxPrice !== undefined) {
          setPriceBounds({ min: data.minPrice, max: data.maxPrice });
          setPriceRange([data.minPrice, data.maxPrice]);
        }
      } catch (err) {
        console.error("Failed to load price bounds", err);
      }
    };
    loadPriceBounds();
  }, []);

  // build params only when priceBounds is known (so we avoid applying default price filter)
  const params = useMemo(() => {
    // always include base params
    const base: any = {
      page,
      limit,
      category: category || undefined,
      ram: ram || undefined,
      rom: rom || undefined,
      sortBy,
      sortOrder,
    };

    if (!priceBounds) {
      // price bounds not loaded yet — don't include price filters
      return base;
    }

    const includePriceFilter = !(
      priceRange[0] === priceBounds.min && priceRange[1] === priceBounds.max
    );

    if (includePriceFilter) {
      base.price_min = priceRange[0];
      base.price_max = priceRange[1];
    }
    return base;
  }, [
    page,
    limit,
    category,
    ram,
    rom,
    priceRange,
    priceBounds,
    sortBy,
    sortOrder,
  ]);

  // call hook — note it expects params or null; we pass params (no null) because base always defined
  const { data, isLoading, isError, error, refetch } = useProducts(params);
  const products = data?.products ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex flex-col md:flex-row gap-6">
        <MobileFilterWrapper>
          <FilterSidebar
            products={products}
            category={category}
            setCategory={setCategory}
            ram={ram}
            setRam={setRam}
            rom={rom}
            setRom={setRom}
            priceRange={priceRange}
            setPriceRange={setPriceRange}
            priceBounds={priceBounds}
          />
        </MobileFilterWrapper>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl md:text-2xl font-bold mb-5 text-center underline decoration-yellow-500 underline-offset-8">
              Shop
            </h2>
            <select
              className="border rounded p-3 border-(--color-columbia-blue) bg-black/5 hover:cursor-pointer"
              value={sortSelection}
              onChange={(e) => setSortSelection(e.target.value)}
            >
              <option value="created_at_desc">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>

          {isLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(limit)].map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-200 h-48 rounded-xl animate-pulse"
                />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center text-red-500">
              <p>
                Failed to load products:{" "}
                {(error as any)?.message ?? "Unknown error"}
              </p>
              <div className="mt-3">
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 bg-(--color-navyBlue) text-white rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!isLoading && !isError && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product: any) => (
                  <ProductCard
                    key={product.id ?? product._id}
                    product={product}
                  />
                ))}
              </div>

              <div className="flex justify-center gap-2 mt-6">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {!isLoading && products?.length === 0 && (
            <div className="w-full flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg font-semibold text-gray-700">
                No products were found matching your selection.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Try adjusting your filters or choosing another category.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShopPage;
