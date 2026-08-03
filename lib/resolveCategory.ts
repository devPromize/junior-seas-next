import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Resolve a category slug to its id (the enforced FK on products.category_id).
 * Returns null for an empty/unknown slug, so a product can be uncategorised.
 */
export async function resolveCategoryId(
  slug?: string | null
): Promise<number | null> {
  if (!slug) return null;
  const { data } = await supabaseServer
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return data?.id ?? null;
}
