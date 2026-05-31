"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

type Props = { children: ReactNode; delay?: number; threshold?: number; as?: keyof JSX.IntrinsicElements };

/** Fades + lifts its children when they scroll into view. One-shot. */
export function Reveal({ children, delay = 0, threshold = 0.12, as: Tag = "div" }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);

  return (
    // @ts-expect-error generic tag
    <Tag ref={ref} className={`reveal ${shown ? "shown" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}
