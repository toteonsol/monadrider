"use client";

/**
 * 🔢 AnimatedNumber · a figure that moves to its new value instead of
 * jumping to it.
 *
 * Money and points are the numbers people watch; a balance that snaps from
 * $2,038 to $2,041 reads as a glitch, one that rolls there reads as the
 * system working. It rolls from wherever it was to wherever it is now, never
 * from zero on a re-render, and it holds still under reduced motion.
 * Motion states facts only: nothing rolls unless the value really changed.
 */
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

export default function AnimatedNumber({
  value,
  format,
  duration = 0.6,
  className = "",
}: {
  value: number;
  format: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  // what is on screen right now · a change mid-roll continues from here
  const displayed = useRef(value);
  useEffect(() => {
    if (reduce || !Number.isFinite(value) || displayed.current === value) {
      displayed.current = value;
      setShown(value);
      return;
    }
    const controls = animate(displayed.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        displayed.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);
  return <span className={`tabular-nums ${className}`}>{format(shown)}</span>;
}
