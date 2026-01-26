import { useEffect, useState } from "react";

/**
 * Hook to track the number of grid columns based on the current viewport width.
 * Matches the responsive grid classes: grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5
 */
export function useGridColumns() {
  const [columns, setColumns] = useState(() => getColumns());

  useEffect(() => {
    const handleResize = () => {
      setColumns(getColumns());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return columns;
}

function getColumns(): number {
  if (typeof window === "undefined") return 3;

  const width = window.innerWidth;
  // Matches Tailwind breakpoints: xl:grid-cols-5, lg:grid-cols-4, default:grid-cols-3
  if (width >= 1280) return 5; // xl
  if (width >= 1024) return 4; // lg
  return 3; // default
}
