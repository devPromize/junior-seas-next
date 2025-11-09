import { useQuery } from '@tanstack/react-query';
import { getCategories } from '../services/select-category-service';
import { Key } from 'swr';

interface Category {
  id: Key | null | undefined;
  image_url: string;
  title: string | undefined;
  _id: string;
  name: string;
  image?: string;
  slug?: string;
  // Add more fields if needed
}

export const useCategories = () => {
  return useQuery<Category[], Error>({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 1000 * 60 * 5, // optional: cache for 5 minutes
  });
};
