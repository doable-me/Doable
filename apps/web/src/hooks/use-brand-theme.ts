"use client";

import { useState, useEffect, useCallback } from "react";

export type BrandTheme = "purple" | "sunset" | "ocean" | "emerald" | "rose";

export const BRAND_THEMES: { value: BrandTheme; label: string; preview: string }[] = [
  { value: "purple", label: "Purple", preview: "#7C3AED" },
  { value: "sunset", label: "Sunset", preview: "#EA580C" },
  { value: "ocean", label: "Ocean", preview: "#0284C7" },
  { value: "emerald", label: "Emerald", preview: "#059669" },
  { value: "rose", label: "Rose", preview: "#E11D48" },
];

const STORAGE_KEY = "doable_brand_theme";

function applyBrandTheme(theme: BrandTheme) {
  document.documentElement.setAttribute("data-brand", theme);
}

export function useBrandTheme() {
  const [brandTheme, setBrandTheme] = useState<BrandTheme>(() => {
    if (typeof window === "undefined") return "purple";
    return (localStorage.getItem(STORAGE_KEY) as BrandTheme) ?? "purple";
  });

  useEffect(() => {
    applyBrandTheme(brandTheme);
  }, [brandTheme]);

  const changeBrandTheme = useCallback((theme: BrandTheme) => {
    setBrandTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    applyBrandTheme(theme);
  }, []);

  return { brandTheme, changeBrandTheme };
}
