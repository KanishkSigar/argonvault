"use client";

import { Eye, EyeOff, FolderOpen, HardDrive, Info, Lock, Trash2 } from "lucide-react";
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
        <Lock size={16} className="accent" />
        <span>ArgonVault</span>
      </div>

      <nav className="sidebar-nav">
        <SidebarItem
          active={view === "files"}
          onClick={() => onView("files")}
          icon={<FolderOpen size={15} />}
          label="Files"
          badge={fileCount}
        />
        <SidebarItem
          active={view === "trash"}
          onClick={() => onView("trash")}
          icon={<Trash2 size={15} />}
          label="Trash"
          badge={trashCount}
        />
      </nav>

      <div className="sidebar-section">View</div>
      <nav className="sidebar-nav">
        <SidebarItem
          active={serverView}
          onClick={() => onServerView(!serverView)}
          icon={serverView ? <EyeOff size={15} /> : <Eye size={15} />}
          label={serverView ? "Server view: ON" : "Server view"}
          hint={serverView ? "showing what storage sees" : "show what storage sees"}
        />
        <SidebarItem
          active={false}
          onClick={onShowHowItWorks}
          icon={<Info size={15} />}
          label="How it works"
          hint="cryptography explained"
        />
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-stats">
        <div className="sidebar-stats-row">
          <HardDrive size={13} className="muted" />
          <span className="muted">Storage</span>
        </div>
        <div className="sidebar-stats-value mono">{formatBytes(totalBytes)}</div>
        <div className="sidebar-stats-hint">across {fileCount} encrypted file{fileCount === 1 ? "" : "s"}</div>
      </div>
    </aside>
  );
}

function SidebarItem({
  active, onClick, icon, label, badge, hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
  hint?: string;
}) {
  return (
    <button className={`sidebar-item ${active ? "active" : ""}`} onClick={onClick} title={hint}>
      <span className="sidebar-item-icon">{icon}</span>
      <span className="sidebar-item-label">{label}</span>
      {badge !== undefined && <span className="sidebar-item-badge">{badge}</span>}
    </button>
  );
}
