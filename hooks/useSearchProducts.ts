import { useQuery } from '@tanstack/react-query';
import axiosInstance from '../lib/axios';
import { useEffect, useState } from 'react';
const fetchSearchResults = async (query: string) => {
  if (!query?.trim()) return [];

  const { data } = await axiosInstance.get(`/search?q=${encodeURIComponent(query)}`);
  const products = data?.products ?? [];

  // Normalize for ProductCard
  return products.map((p: any) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    variants: [
      {
        price: p.price,
        image: p.image,
        stock: 1, // optional fallback
      },
    ],
  }));
};


// Custom hook with debounce
export const useSearchProducts = (searchText: string) => {
  const [debouncedQuery, setDebouncedQuery] =
    useState(searchText);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedQuery(searchText),
      400
    );
    return () => clearTimeout(timeout);
  }, [searchText]);

  return useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => fetchSearchResults(debouncedQuery),
    enabled: !!debouncedQuery?.trim(),
    staleTime: 1000 * 30,
  });
};
