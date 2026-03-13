import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export const useThemeValue = <T>(light: T, dark: T): T => {
  const { resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Keep first client render aligned with SSR to avoid hydration mismatch.
  if (!isMounted) return light;

  return resolvedTheme === "dark" ? dark : light;
};
