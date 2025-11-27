//=============================================
// src/hooks/useVariantFilters.ts
import { useMemo } from "react";

export function useVariantFilters(products: any[]) {
  return useMemo(() => {
    const ramSet = new Set<number>();
    const romSet = new Set<number>();

    products?.forEach((product) => {
      if (!product?.variants) return;
      const variants = Array.isArray(product.variants) ? product.variants : [];

      variants.forEach((v: any) => {
        if (v?.ram) {
          const ramNum = parseInt(String(v.ram).replace(/\D/g, ""));
          if (!isNaN(ramNum)) ramSet.add(ramNum);
        }

        if (v?.rom) {
          const romRaw = String(v.rom).trim().toUpperCase();
          let romNum = 0;
          if (romRaw.includes("TB")) {
            const tb = parseFloat(romRaw.replace(/[^\d.]/g, "")) || 0;
            romNum = Math.round(tb * 1024);
          } else {
            romNum = parseInt(romRaw.replace(/\D/g, "")) || 0;
          }
          if (!isNaN(romNum) && romNum > 0) romSet.add(romNum);
        }
      });
    });

    return {
      ramOptions: Array.from(ramSet).sort((a, b) => b - a).map((r) => `${r}GB`),
      romOptions: Array.from(romSet).sort((a, b) => b - a).map((r) => (r >= 1024 ? `${r / 1024}TB` : `${r}GB`)),
    };
  }, [products]);
}
