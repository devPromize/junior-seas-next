import axiosInstance from "../lib/axios";

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  category?: string;
  price_min?: number;
  price_max?: number;
  ram?: string;
  rom?: string;
  color?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc" | undefined;
}

export const fetchProducts = async (params: ProductQueryParams = {}) => {
  const { data } = await axiosInstance.get("/products", { params });
  return data; // { products, total, page, limit, totalPages }
};


// //NEW CODE BELOW
// // lib/services/productService.ts (client-side)
// import axiosInstance from "@/lib/axios";

// export interface ProductQueryParams {
//   page?: number;
//   limit?: number;
//   category?: string;
//   price_min?: number;
//   price_max?: number;
//   ram?: string;
//   rom?: string;
//   color?: string;
//   search?: string;
//   sortBy?: string;
//   sortOrder?: "asc" | "desc" | undefined;
// }

// export const fetchProducts = async (params: ProductQueryParams = {}) => {
//   const { data } = await axiosInstance.get("/api/products", { params });
//   return data; // { products, total, page, limit, totalPages }
// };
