//==========================================================
// app/shop/components/FilterSidebar.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { fetchAllVariants } from '@/lib/services/productService';

interface FilterSidebarProps {
  products: any[];
  category: string;
  setCategory: (value: string) => void;
  ram: string;
  setRam: (value: string) => void;
  rom: string;
  setRom: (value: string) => void;
  priceRange: [number, number];
  setPriceRange: (range: [number, number]) => void;
  priceBounds: { min: number; max: number } | null;
}

export default function FilterSidebar({
  category,
  setCategory,
  ram,
  setRam,
  rom,
  setRom,
  priceRange,
  setPriceRange,
  priceBounds,
}: FilterSidebarProps) {
  const { data: categories, isLoading, error } = useCategories();
  const [ramOptions, setRamOptions] = useState<string[]>([]);
  const [romOptions, setRomOptions] = useState<string[]>([]);

  useEffect(() => {
    const loadVariants = async () => {
      try {
        const { ramOptions, romOptions } = await fetchAllVariants();
        // normalize / sort: highest first (string sort may order wrong), convert to normalized numeric sort if needed
        setRamOptions(ramOptions.sort());
        setRomOptions(romOptions.sort());
      } catch (err) {
        console.error('Failed to load variants', err);
      }
    };
    loadVariants();
  }, []);

  return (
    <aside className="w-full md:w-80 lg:w-96 flex-shrink-0  border rounded-xl p-4  border-(--color-columbia-blue) bg-black/5">
      <h2 className="text-lg font-semibold mb-4">Filters</h2>

      {/* Category */}
      <div className="mb-4">
        <label className="block font-medium">Category</label>
        {isLoading ? (
          <select className="w-full mt-1 border rounded p-2 bg-gray-100" disabled>
            <option>Loading categories...</option>
          </select>
        ) : error ? (
          <select className="w-full mt-1 border rounded p-2 bg-red-50 text-red-600" disabled>
            <option>Error loading categories</option>
          </select>
        ) : (
          <select className="w-full mt-1 border rounded p-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories?.map((cat: any) => (
              <option key={String(cat.id)} value={cat.slug}>{cat.title}</option>
            ))}
          </select>
        )}
      </div>

      {/* RAM */}
      <div className="mb-4">
        <label className="block font-medium">RAM</label>
        <select className="w-full mt-1 border rounded p-2" value={ram} onChange={(e) => setRam(e.target.value)}>
          <option value="">All RAM</option>
          {ramOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* ROM */}
      <div className="mb-4">
        <label className="block font-medium">ROM</label>
        <select className="w-full mt-1 border rounded p-2" value={rom} onChange={(e) => setRom(e.target.value)}>
          <option value="">All Storage</option>
          {romOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* PRICE */}
      {priceBounds && (
        <div className="mb-4">
          <label className="block font-medium">Price Range</label>
          <div className="flex gap-2 mt-1">
            <input
              type="number"
              min={priceBounds.min}
              max={priceBounds.max}
              value={priceRange[0]}
              onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
              className="w-full border rounded p-2"
            />
            <input
              type="number"
              min={priceBounds.min}
              max={priceBounds.max}
              value={priceRange[1]}
              onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
              className="w-full border rounded p-2"
            />
          </div>

          <p className="mt-1 text-sm text-gray-500">
            ₦{priceRange[0].toLocaleString()} - ₦{priceRange[1].toLocaleString()}
          </p>

          <div className="mt-2 flex gap-2">
            <button
              onClick={() => priceBounds && setPriceRange([priceBounds.min, priceBounds.max])}
              className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
