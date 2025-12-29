
// 'use client';

// import { useAuth } from '@/hooks/useAuth';
// import { useEffect, useState } from 'react';

// export default function WishlistPage() {
//   const { user, loading } = useAuth();
//   const [items, setItems] = useState<any[]>([]);
//   const [fetching, setFetching] = useState(true);

//   useEffect(() => {
//     if (!user) return;

//     (async () => {
//       const res = await fetch('/api/account/wishlist');
//       const json = await res.json();
//       setItems(json.items || []);
//       setFetching(false);
//     })();
//   }, [user]);

//   if (loading) return <p className="p-6">Loading…</p>;
//   if (!user) return <p className="p-6">Please login</p>;
//   if (fetching) return <p className="p-6">Loading wishlist…</p>;

//   return (
//     <div className="max-w-4xl mx-auto p-6">
//       <h2 className="text-2xl font-bold mb-4">Wishlist</h2>

//       {items.length === 0 ? (
//         <p>No saved items</p>
//       ) : (
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//           {items.map((item, i) => (
//             <div key={i} className="border p-3 rounded">
//               <img src={item.image} className="h-32 w-full object-contain" />
//               <p className="mt-2 font-medium">{item.name}</p>
//               <p className="font-bold">₦{item.price.toLocaleString()}</p>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }



'use client';

import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/ui/Container';
import ProductCard from '@/ui/components/ProductCard';

export default function WishlistPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading || !user) return;

    setFetching(true);

    (async () => {
      const res = await fetch('/api/account/wishlist');
      const json = await res.json();
      setItems(json.items || []);
      setFetching(false);
    })();
  }, [loading, user]);

  if (loading) {
    return (
      <Container>
        <p className="py-10 text-center">Loading…</p>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container>
        <p className="py-10 text-center">Please login</p>
      </Container>
    );
  }

  return (
    <Container>
      <section className="py-10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl md:text-2xl font-bold">
            Wishlist
          </h2>

          <Link
            href="/account"
            className="text-sm text-gray-600 hover:underline"
          >
            ← Back to account
          </Link>
        </div>

        {fetching ? (
          <p>Loading wishlist…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">No saved items</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((product: any, idx: number) => (
              <ProductCard
                key={product.id || idx}
                product={product}
                sectionKey="wishlist"
              />
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
