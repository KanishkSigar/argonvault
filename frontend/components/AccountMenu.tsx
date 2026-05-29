"use client";

import { ChevronDown, KeyRound, LogOut, ShieldCheck, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  email: string;
  onLogout: () => void;
};

export function AccountMenu({ email, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div className="account-menu" ref={ref}>
      <button className="account-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <User size={14} />
        <span className="mono account-email">{email}</span>
        <ChevronDown size={13} className={`account-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="account-popover" role="menu">
          <div className="account-popover-head">
            <span className="muted" style={{ fontSize: 11 }}>Signed in as</span>
            <span className="mono" style={{ fontSize: 12 }}>{email}</span>
          </div>
          <div className="account-popover-status">
            <ShieldCheck size={13} className="accent" />
            <span>Vault unlocked in this tab</span>
          </div>
          <div className="account-popover-section">
            <button className="account-item" disabled title="Coming soon">
              <KeyRound size={14} /> Change password
              <span className="account-item-tag">soon</span>
            </button>
          </div>
          <div className="account-popover-divider" />
          <button className="account-item danger" onClick={onLogout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
