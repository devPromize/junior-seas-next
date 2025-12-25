import { supabase } from "@/lib/supabaseClient";
import { Product } from "@/type";
import ProductCard from "@/ui/components/ProductCard";

export default async function BrandPage({ params }: { params: { brand: string } }) {
  const { brand } = await params;

  // Fetch all products that belong to this brand
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .ilike("brand", brand); // ilike allows case-insensitive matching

  if (error) {
    console.error(error);
    return <p className="text-red-500">Error loading brand products</p>;
  }

  if (!products || products.length === 0) {
    return (
      <main className="text-center py-10">
        <h1 className="text-xl md:text-2xl font-bold mb-5 text-center underline decoration-yellow-500 underline-offset-8">{brand.charAt(0).toUpperCase() + brand.slice(1)}</h1>
        <p>No products found for this brand</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-xl md:text-2xl font-bold mb-5 text-center underline decoration-yellow-500 underline-offset-8">{brand.charAt(0).toUpperCase() + brand.slice(1)}</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
        {products.map((product: Product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}