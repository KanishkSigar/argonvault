"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { signup } from "@/lib/vault";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("passwords don't match");
    if (password.length < 8) return setError("password must be at least 8 characters");
    if (!ack) return setError("please acknowledge the recovery warning");

    setBusy(true);
    try {
      await signup(email.trim().toLowerCase(), password);
      router.replace("/vault");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("that email is already registered");
      else if (err instanceof ApiError && err.status === 429) setError("too many attempts — wait a few minutes");
      else if (err instanceof Error) setError(err.message.toLowerCase());
      else setError("signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="dots"><span /><span /><span /></span>
          <span>argonvault — bash · auth register</span>
        </div>
        <div className="auth-card-body">
          <h1 className="auth-title">Create vault</h1>
          <p className="auth-sub">Generates your vault key locally and wraps it under your password.</p>

          <form onSubmit={onSubmit}>
            <div className="auth-field">
              <label htmlFor="email">email</label>
              <input id="email" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            </div>
            <div className="auth-field">
              <label htmlFor="password">password</label>
              <input id="password" type="password" placeholder="at least 8 characters"
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="auth-field">
              <label htmlFor="confirm">confirm</label>
              <input id="confirm" type="password" placeholder="repeat password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>

            <div className="auth-warning">
              <AlertTriangle size={15} className="amber" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Your password is the <strong>only</strong> way to decrypt your files.
                If you forget it, your data cannot be recovered. There is no reset.
              </span>
            </div>

            <label className="row" style={{ gap: 8, alignItems: "center", margin: "8px 0" }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span className="muted" style={{ fontSize: 11 }}>
                I understand and accept this trade-off.
              </span>
            </label>

            {error && <p className="red" style={{ margin: "4px 0", fontSize: 12 }}>! {error}</p>}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <><Loader2 size={13} className="spin" /> generating + wrapping vault key</> : <>create vault <ArrowRight size={13} /></>}
            </button>
          </form>
        </div>
        <div className="auth-foot">
          already have one? <Link href="/login">sign in →</Link>
        </div>
      </div>
    </main>
  );
}
