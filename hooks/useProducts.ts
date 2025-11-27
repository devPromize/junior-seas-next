// src/hooks/useProducts.ts
import { useQuery } from '@tanstack/react-query';
import {
  fetchProducts,
  ProductQueryParams,
} from '../services/product-service';

export const useProducts = (params: ProductQueryParams) => {
  return useQuery({
    queryKey: ['products', params], // ✅ Key includes params for caching
    queryFn: () => fetchProducts(params), // ✅ Fetch function
    enabled: params !== null, // prevents initial call before params ready (e.g., priceBounds)
    placeholderData: (previousData) => previousData, // ✅ Replaces keepPreviousData // ✅ Smooth pagination
    staleTime: 1000 * 60, // ✅ 1 min
  });
};