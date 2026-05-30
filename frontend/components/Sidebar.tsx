"use client";

import { Eye, EyeOff, FolderOpen, Info, Trash2 } from "lucide-react";
import { ReactNode } from "react";

type View = "files" | "trash";

type Props = {
  view: View;
  onView: (v: View) => void;
  fileCount: number;
  trashCount: number;
  totalBytes: number;
  serverView: boolean;
  onServerView: (v: boolean) => void;
  onShowHowItWorks: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function Sidebar({
  view, onView, fileCount, trashCount, totalBytes, serverView, onServerView, onShowHowItWorks,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="accent-bar" />
        ARGONVAULT
      </div>

      <div className="sidebar-section">objects</div>
      <nav className="sidebar-nav">
        <SidebarItem
          active={view === "files"}
          onClick={() => onView("files")}
          icon={<FolderOpen size={14} />}
          label="files"
          badge={fileCount}
        />
        <SidebarItem
          active={view === "trash"}
          onClick={() => onView("trash")}
          icon={<Trash2 size={14} />}
          label="trash"
          badge={trashCount}
        />
      </nav>

      <div className="sidebar-section">view</div>
      <nav className="sidebar-nav">
        <SidebarItem
          active={serverView}
          onClick={() => onServerView(!serverView)}
          icon={serverView ? <EyeOff size={14} /> : <Eye size={14} />}
          label={serverView ? "server view [on]" : "server view"}
        />
        <SidebarItem
          active={false}
          onClick={onShowHowItWorks}
          icon={<Info size={14} />}
          label="how it works"
        />
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-stats">
        <div className="sidebar-stats-row">storage</div>
        <div className="sidebar-stats-value mono">{formatBytes(totalBytes)}</div>
        <div className="sidebar-stats-hint">
          {fileCount} encrypted file{fileCount === 1 ? "" : "s"}
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({
  active, onClick, icon, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button className={`sidebar-item ${active ? "active" : ""}`} onClick={onClick}>
      <span style={{ display: "inline-flex" }}>{icon}</span>
      <span className="sidebar-item-label">{label}</span>
      {badge !== undefined && <span className="sidebar-item-badge">{badge}</span>}
    </button>
  );
}
