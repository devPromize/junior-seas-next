// lib/services/productService.ts
"use server";
import slugify from "slugify";
import { createClient } from "./server";
import {
  filterByVariant,
  filterByPrice,
  sortByPrice,
  paginate,
} from "../productLogic";

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
  sortOrder?: "asc" | "desc";
}


export const fetchSingleProduct = async (productId: number | string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();
  if (error) throw error;

  const product = data as any;
  // Ensure variants and images are arrays (handle stringified JSON stored by mistake)
  try {
    if (typeof product.variants === "string") {
      product.variants = JSON.parse(product.variants);
    }
  } catch (e) {
    // fallback to empty array
    product.variants = [];
  }

  try {
    if (typeof product.images === "string") {
      product.images = JSON.parse(product.images);
    }
  } catch (e) {
    product.images = Array.isArray(product.images) ? product.images : [];
  }

  return product;
};

/* Fetch Products — robust variant matching + pagination */
export const fetchProducts = async (params: ProductQueryParams = {}) => {
  const supabase = await createClient();

  const {
    page = 1,
    limit = 20,
    category,
    price_min,
    price_max,
    ram,
    rom,
    color,
    search,
    sortBy = "created_at",
    sortOrder = "desc",
  } = params;

  let query = supabase.from("products").select("*");

  if (category) query = query.ilike("category", `%${category}%`);
  if (search) query = query.ilike("name", `%${search}%`);

  // ✅ Only let Supabase sort REAL DB columns
  const dbSortableColumns = ["created_at", "name", "brand", "category"];

  if (dbSortableColumns.includes(sortBy)) {
    query = query.order(sortBy, { ascending: sortOrder === "asc" });
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  let products = Array.isArray(rows) ? rows.filter(Boolean) : [];

  // ✅ PRICE SORTING (variants-based)
  if (sortBy === "price") {
    products = sortByPrice(products, sortOrder);
  }

  // --- Variant filtering in JS (supports multiple variant objects per product) ---
  products = filterByVariant(products, { ram, rom, color });

  // --- Price filter in JS (variants may have different prices) ---
  products = filterByPrice(products, { price_min, price_max });

  // --- Pagination after filtering ---
  const total = products.length;
  const paginated = paginate(products, page, limit);

  return {
    data: paginated,
    count: total,
  };
};

/* Fetch All Variants for filters (global) */
export const fetchAllVariants = async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select("variants");
  if (error) throw error;

  const ramSet = new Set<string>();
  const romSet = new Set<string>();

  data?.forEach((product: any) => {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    variants.forEach((variant: any) => {
      if (variant?.ram) ramSet.add(variant.ram);
      if (variant?.rom) romSet.add(variant.rom);
    });
  });

  return {
    ramOptions: Array.from(ramSet),
    romOptions: Array.from(romSet),
  };
};

/* Fetch Price Bounds (min/max) */
export const fetchPriceBounds = async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select("variants");
  if (error) throw error;

  let min = Infinity;
  let max = 0;

  data?.forEach((product: any) => {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    variants.forEach((variant: any) => {
      const price = Number(variant?.price);
      if (!Number.isNaN(price)) {
        if (price < min) min = price;
        if (price > max) max = price;
      }
    });
  });

  return {
    minPrice: min === Infinity ? 0 : min,
    maxPrice: max,
  };
};

/* Create Product */
export const createProduct = async (product: any) => {
  const supabase = await createClient();
  const slug = slugify(product.name, { lower: true });
  const { data, error } = await supabase
    .from("products")
    .insert([{ ...product, slug }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

/* Update Product */
export const updateProduct = async (id: string, product: any) => {
  const supabase = await createClient();
  const updateData = { ...product };
  if (product.name) updateData.slug = slugify(product.name, { lower: true });
  const { data, error } = await supabase
    .from("products")
    .update(updateData)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
};
