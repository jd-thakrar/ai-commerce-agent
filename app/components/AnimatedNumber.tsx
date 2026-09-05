'use client';

import { useEffect, useRef, useState } from 'react';

type AnimatedNumberProps = {
  value: number;
  format?: (value: number) => string;
  className?: string;
};

export function AnimatedNumber({
  value,
  format = (v) => String(v),
  className = '',
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    const to = value;
    if (from === to) return;

    const duration = 280;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previous.current = to;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  useEffect(() => {
    if (previous.current !== value && display === value) {
      previous.current = value;
    }
  }, [display, value]);

  return <span className={`font-mono-data tabular-nums ${className}`}>{format(display)}</span>;
}
