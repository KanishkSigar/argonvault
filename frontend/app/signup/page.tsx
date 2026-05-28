"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { ApiError } from "@/lib/api";
import { signup } from "@/lib/vault";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords don't match");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (!acknowledged) return setError("Please acknowledge the recovery warning");

    setBusy(true);
    try {
      await signup(email.trim().toLowerCase(), password);
      router.replace("/vault");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("That email is already registered");
      else if (err instanceof ApiError && err.status === 429) setError("Too many attempts — wait a few minutes");
      else if (err instanceof Error) setError(err.message);
      else setError("Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <Lock size={14} />
          <span>ARGONVAULT</span>
        </div>
        <h1 className="auth-title">Create your vault</h1>
        <p className="auth-sub">Your password unlocks files only your browser can decrypt.</p>

        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="auth-warning">
            <AlertTriangle size={16} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
            <span>
              Your password is the <strong style={{ color: "var(--text)" }}>only</strong> way to decrypt your files.
              If you forget it, your data cannot be recovered.
            </span>
          </div>

          <label className="row" style={{ gap: 8, alignItems: "center", margin: "8px 0" }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              I understand and accept this
            </span>
          </label>

          {error && <p className="error" style={{ margin: "4px 0", fontSize: 13 }}>{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? <><Loader2 size={14} className="spin" /> Creating vault…</> : "Create vault"}
          </button>
        </form>

        <div className="auth-foot">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
