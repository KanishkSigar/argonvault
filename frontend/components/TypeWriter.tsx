"use client";

import { ReactNode, useEffect, useState } from "react";

type Props = {
  lines: ReactNode[];
  /** ms per character */
  speed?: number;
  /** ms between lines */
  pause?: number;
  /** whether to show a blinking cursor on the last line */
  cursor?: boolean;
  /** start delay */
  startDelay?: number;
  /** rendered for every visible line; receives the line content + line index */
  renderLine?: (content: ReactNode, idx: number) => ReactNode;
  className?: string;
};

/**
 * Reveals an array of lines one-by-one with a step (CSS clip-path) animation
 * — much cheaper than character-by-character typing for ReactNode content
 * while keeping the type-on feel.
 */
export function TypeWriter({
  lines,
  speed = 14,
  pause = 220,
  cursor = true,
  startDelay = 200,
  renderLine,
  className = "",
}: Props) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const tick = (delay: number) => {
      setTimeout(() => {
        if (cancelled) return;
        if (i >= lines.length) return;
        i += 1;
        setShown(i);
        if (i < lines.length) tick(pause);
      }, delay);
    };
    tick(startDelay);
    return () => { cancelled = true; };
  }, [lines, speed, pause, startDelay]);

  return (
    <div className={className}>
      {lines.slice(0, shown).map((line, i) => {
        const content = (
          <span
            className="type-line"
            style={{ ["--type-delay" as never]: `${i * 30}ms` }}
          >
            {line}
          </span>
        );
        return (
          <div key={i}>
            {renderLine ? renderLine(content, i) : content}
            {cursor && i === shown - 1 && i === lines.length - 1 && <span className="cursor" />}
          </div>
        );
      })}
    </div>
  );
}
