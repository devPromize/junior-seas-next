'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { useSearchProducts } from '../../hooks/useSearchProducts';
import Container from '../../ui/Container';
import ProductCard from '../../ui/components/ProductCard';
import { Product } from '@/type';

const SearchPage = () => {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const { data: results = [], isLoading } = useSearchProducts(query);

  return (
    <Container className="py-10">
      <h1 className="text-2xl font-semibold mb-6 text-gray-800">
        {query
          ? `Search results for “${query}”`
          : 'Search Products'}
      </h1>

      {isLoading ? (
        <p className="text-gray-500 text-center">Loading...</p>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {results.map((product: Product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center">
          No products found for “{query}”
        </p>
      )}
    </Container>
  );
};

export default SearchPage;




//ABOVE IS THE SERCHPAGE WITHOUT SORT AND PROPERTIES




// "use client";

// import React, { useMemo, useState } from "react";
// import { useSearchParams } from "next/navigation";
// import { FaSearch } from "react-icons/fa";
// import { useQuery } from "@tanstack/react-query";
// import { fetchProductsBySearch } from "@/lib/services/productService";
// import ProductCard from "@/components/ui/ProductCard";
// import SortDropdown from "@/components/ui/SortDropdown";
// import Container from "@/components/ui/Container";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";

// const SearchPage: React.FC = () => {
//   const searchParams = useSearchParams();
//   const initialTerm = searchParams.get("q") || "";
//   const [searchTerm, setSearchTerm] = useState(initialTerm);
//   const [sortValue, setSortValue] = useState("latest");

//   // Fetch products
//   const {
//     data: products = [],
//     refetch,
//     isFetching,
//   } = useQuery({
//     queryKey: ["search-products", searchTerm],
//     queryFn: () => fetchProductsBySearch(searchTerm),
//     enabled: !!searchTerm.trim(),
//   });

//   const handleSearch = (e: React.FormEvent) => {
//     e.preventDefault();
//     if (searchTerm.trim()) refetch();
//   };

//   // Sort client-side (clean & stable)
//   const sortedProducts = useMemo(() => {
//     const sorted = [...products];
//     if (sortValue === "price-low-high") {
//       sorted.sort((a, b) => a.price - b.price);
//     } else if (sortValue === "price-high-low") {
//       sorted.sort((a, b) => b.price - a.price);
//     } else if (sortValue === "latest") {
//       sorted.sort(
//         (a, b) =>
//           new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
//       );
//     }
//     return sorted;
//   }, [products, sortValue]);

//   return (
//     <Container className="py-10">
//       {/* Search Bar */}
//       <form
//         onSubmit={handleSearch}
//         className="flex items-center gap-3 w-full max-w-lg mx-auto mb-10"
//       >
//         <Input
//           type="text"
//           value={searchTerm}
//           onChange={(e) => setSearchTerm(e.target.value)}
//           placeholder="Search for products (e.g., iPhone, smartwatch...)"
//           className="flex-1 border border-gray-300 focus:border-gray-500 transition-all"
//         />
//         <Button type="submit" className="flex items-center gap-2">
//           <FaSearch /> Search
//         </Button>
//       </form>

//       {/* Header + Sort */}
//       {searchTerm && (
//         <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
//           <h2 className="text-lg font-semibold text-gray-800 mb-2 sm:mb-0">
//             Showing results for{" "}
//             <span className="text-blue-600">“{searchTerm}”</span>
//           </h2>
//           <SortDropdown value={sortValue} onChange={setSortValue} />
//         </div>
//       )}

//       {/* Results */}
//       {isFetching ? (
//         <p className="text-center text-gray-500 mt-10">Searching...</p>
//       ) : sortedProducts.length > 0 ? (
//         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
//           {sortedProducts.map((product) => (
//             <ProductCard key={product.id} product={product} />
//           ))}
//         </div>
//       ) : (
//         searchTerm && (
//           <p className="text-center text-gray-500 mt-10">
//             No products found for “{searchTerm}”.
//           </p>
//         )
//       )}
//     </Container>
//   );
// };

// export default SearchPage;

