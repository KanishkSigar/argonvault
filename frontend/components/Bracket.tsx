import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  green?: boolean;
  dashed?: boolean;
};

/** Corner-bracket frame — a blueprint annotation wrapper. */
export function Bracket({ children, className = "", green, dashed }: Props) {
  return (
    <div
      className={[
        "bracket",
        green ? "bracket-green" : "",
        dashed ? "bracket-dashed" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <span className="bl" />
      <span className="br" />
      {children}
    </div>
  );
}
