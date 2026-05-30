import { ReactNode } from "react";

type Chip = {
  key: string;
  value: string | ReactNode;
  tone?: "default" | "live" | "warn";
};

type Props = {
  chips: Chip[];
  right?: ReactNode;
};

/** Top status line with mono spec-sheet chips, like a debugger or HUD. */
export function StatusBar({ chips, right }: Props) {
  return (
    <div className="statusbar">
      {chips.map((c, i) => (
        <span key={c.key} className="row" style={{ gap: 4 }}>
          {i > 0 && <span className="statusbar-sep">·</span>}
          <span className={`statusbar-chip ${c.tone ?? ""}`}>
            <span>{c.key}:</span>
            <strong>{c.value}</strong>
          </span>
        </span>
      ))}
      <span className="statusbar-spacer" />
      {right}
    </div>
  );
}
