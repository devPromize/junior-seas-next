'use client';

import { useCategories } from '@/hooks/useCategories';

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
}

export default function CategorySelect({ value, onChange }: CategorySelectProps) {
  const { data: categories, isLoading, error } = useCategories();

  if (isLoading) {
    return (
      <select
        className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-gray-100 animate-pulse"
        disabled
      >
        <option>Loading categories...</option>
      </select>
    );
  }

  if (error) {
    return (
      <select
        className="w-full rounded-lg border border-red-400 px-3 py-2 bg-red-50 text-red-600"
        disabled
      >
        <option>Error loading categories</option>
      </select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
    >
      <option value="">All Categories</option>

      {categories?.map((cat) => (
        <option key={String(cat.id)} value={cat.slug}>
          {cat.title}
        </option>
      ))}
    </select>
  );
}
