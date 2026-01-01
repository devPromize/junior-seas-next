// services/highlight-service.ts
import axiosInstance from "../lib/axios";

export const getAllHighlights = async () => {
  const response = await axiosInstance.get("/highlights"); // ✅ backend route for all highlights
  return response.data; // should return grouped data { "NEW AT JUNIOR SEAS": [...], "POPULAR AT JUNIOR SEAS": [...] }

};

