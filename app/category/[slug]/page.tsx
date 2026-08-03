import { supabase } from "@/lib/supabaseClient";
import { Product } from "@/type";
import ProductCard from "@/ui/components/ProductCard";

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  // Fetch category by slug
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .single();

  if (categoryError || !category) {
    return <p className="p-6 text-red-500">Category not found.</p>;
  }

  // Fetch products via the enforced category_id FK (not the free-text slug),
  // so a product can never fall out of its category due to a text mismatch.
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", category.id);

  if (productsError) {
    return <p className="p-6 text-red-500">Error loading products.</p>;
  }

  return (
    <main className="p-6">
      <h1 className="text-xl md:text-2xl font-bold mb-5 text-center underline decoration-yellow-500 underline-offset-8">{category.title}</h1>

      {products && products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product: Product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500 mt-6">No products found in this category.</p>
      )}
    </main>
  );
}
