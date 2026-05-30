import { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

/** Embedded dark terminal block. Pair with TypeWriter for animated output. */
export function Terminal({ title = "argonvault — bash", children, className = "" }: Props) {
  return (
    <div className={`terminal ${className}`} style={{ padding: 0 }}>
      <div className="terminal-head">
        <span className="dots"><span /><span /><span /></span>
        <span>{title}</span>
      </div>
      <div className="terminal-body">{children}</div>
    </div>
  );
}
