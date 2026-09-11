'use client';

import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

export function AnimatedCounter({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(displayRef.current, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => {
        displayRef.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, prefersReducedMotion]);

  return (
    <span>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
