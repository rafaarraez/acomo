"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Muestra un número que "cuenta" suavemente cuando cambia (p. ej. al
 * actualizar tasas). No anima en el primer render para no romper la
 * hidratación: server y cliente pintan el mismo valor inicial.
 */
export default function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const duration = 450;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        prev.current = to;
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      prev.current = to;
    };
  }, [value]);

  return <>{format(display)}</>;
}
