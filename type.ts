export interface HighlightsType {
    _id: number;
    _base: string;
    title: string;
    name: string;
    image: string;
    color: string;
    buttonTitle: string;
  }
  
  export interface CategoryProps {
    _id: number;
    image_url: string;
    title: string;
    _base: string;
    description: string;
  }
  

  // src/types/product.ts

export interface Variant {
  id: string | undefined;
  color?: string;
  ram?: string;
  rom?: string;
  price?: number;        // Some products may not have price in variant
  image?: string;        // Single image for variant
  images?: string[];     // Optional array of images
  stock?: number;        // Stock count for this variant
}

export interface Product {
  // IDs
  _id?: string;          // For MongoDB-like structures or UI-only IDs
  id?: string | number;  // Supabase UUID or numeric
  slug?: string;

  // Basic info
  name: string;
  category?: string;
  description?: string;
  brand?: string;

  // Status / section
  status?: string | null;
  highlight_section?: string | null;

  // Stock
  in_stock?: boolean;    // From Supabase (snake_case)
  inStock?: boolean;     // For UI (camelCase alias)

  // Media
  images?: string[] | null;
  variants?: Variant[] | null;

  // Metadata
  created_at?: string;
  [key: string]: any;    // Flexible catch-all
}


// export interface Variant {
//   color: string;
//   ram?: string;
//   rom?: string;
//   price: number;
//   image: string;
//   stock: number;
// }

// export interface Product {


//   id: string; // From Supabase
//   name: string;
//   slug: string;
//   category: string;
//   description: string;
//   brand?: string;
//   status?: string;
//   highlight_section?: string;
//   in_stock: boolean;
//   created_at: string;
//   variants: Variant[]; // From Supabase jsonb array
// }


// export interface Product {
//   // variants: null;
//   // id: number | null | undefined;
//   // name: string;
//   // images: string[];
//   // description: string;
//   // price: {
//   //   regular: number;
//   //   discounted: number | null;
//   // };
//   // quantity: number;
//   // rating: number;
//   // reviews: number;
//   // category: string;
//   // brand: string;
//   // colors: string[];
//   // isStock: boolean;
//   // isNew: boolean;
//   // overview: string;
//   // status: string;
//   // createdAt: string;
//   // ram?: string;
//   // rom?: string;



  
//   id: string; // or number if Supabase returns numbers
//   title: string;
//   description: string;
//   price: number;
//   category: string;
//   ram?: string;
//   rom?: string;
//   brand?: string;
//   color?: string;
//   images: string[]; // Supabase returns an array for multiple images
//   slug: string;
//   in_stock: boolean;
//   created_at: string;
// }




  export interface ProductProps {
    _id: number;
    _base: string;
    reviews: number;
    rating: number;
    quantity: number;
    overView: string;
    name: string;
    isStock: boolean;
    isNew: boolean;
    images: [string];
    discountedPrice: number;
    regularPrice: number;
    description: string;
    colors: [string];
    category: string;
    brand: string;
  }
  
  export interface BlogProps {
    _id: number;
    image: string;
    title: string;
    description: string;
    _base: string;
  }
  
  export interface UserTypes {
    currentUser: {
      firstName: string;
      lastName: string;
      email: string;
      avatar: string;
      id: string;
    };
  }
  
  export interface OrderTypes {
    orderItems: [ProductProps];
    paymentId: string;
    paymentMethod: string;
    userEmail: string;
  }
  

  // auto-detect environment using import.meta.env.MODE, or adding support for dev/staging/prod 
// src/config.ts
// export interface ImportMetaEnv {
//   readonly MODE: string; // e.g., 'development', 'staging', 'production'
// }

// export interface ImportMeta {
//   readonly env: ImportMetaEnv;
// }

// export interface Config {
//   baseUrl: string;
// }