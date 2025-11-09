'use server';
import { createClient } from './server';

export const searchProductsService = async (query: string) => {
  const supabase = await createClient();

  // fetch the product rows including variants and images exactly as stored
  const { data, error } = await supabase
    .from('products')
    .select('id, name, slug, description, brand, images, category, variants')
    .or(
      `name.ilike.%${query}%,brand.ilike.%${query}%,description.ilike.%${query}%`
    )
    .limit(50);

  if (error) throw error;

  // Return objects that preserve variants & images so ProductCard can calculate ranges
  const refined = data.map((p) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];

    // choose a preview image (variant image > product images[0] > placeholder)
    const previewImage =
      variants[0]?.image ??
      (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null) ??
      '/placeholder.png';

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      brand: p.brand,
      category: p.category,
      // keep the raw arrays for ProductCard to use
      images: Array.isArray(p.images) ? p.images : [],
      variants,
      // convenience preview (optional; ProductCard doesn't need it but it's fine)
      image: previewImage,
    };
  });
  return refined;
};
