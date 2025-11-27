// hooks/useHighlights.ts
import { useQuery } from "@tanstack/react-query";
import { getAllHighlights } from "../services/highlight-service";

export const useAllHighlights = () => {
  return useQuery({
    queryKey: ["all-highlights"], // ✅ No argument needed
    queryFn: getAllHighlights,    // ✅ No params
  });
};