"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Custom cursor follower — a small green dot that tracks the mouse and
 * morphs into an outlined ring over interactive elements. Hidden on touch.
 *
 * Uses transform + a tiny lerp so motion feels smooth without being floaty.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -100, y: -100 });
  const pos = useRef({ x: -100, y: -100 });
  const [hover, setHover] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    setEnabled(true);

    function move(e: MouseEvent) {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
    }
    function over(e: Event) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("a, button, input, [data-cursor='hover']")) setHover(true);
    }
    function out(e: Event) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("a, button, input, [data-cursor='hover']")) setHover(false);
    }
    window.addEventListener("mousemove", move, { passive: true });
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);

    let raf = 0;
    const tick = () => {
      const k = 0.22;
      pos.current.x += (target.current.x - pos.current.x) * k;
      pos.current.y += (target.current.y - pos.current.y) * k;
      if (dot.current) {
        dot.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!enabled) return null;
  return <div ref={dot} className={`cursor-follower ${hover ? "hover" : ""}`} aria-hidden />;
}
