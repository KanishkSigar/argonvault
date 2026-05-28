"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { ApiError } from "@/lib/api";
import { login } from "@/lib/vault";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/vault");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("Wrong email or password");
      else if (err instanceof ApiError && err.status === 429) setError("Too many attempts — wait a moment");
      else if (err instanceof Error) setError(err.message);
      else setError("Login failed");
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
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Your files. End-to-end encrypted, in your browser.</p>

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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <p className="error" style={{ margin: "4px 0", fontSize: 13 }}>{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? <><Loader2 size={14} className="spin" /> Unlocking…</> : "Sign in"}
          </button>
        </form>

        <div className="auth-foot">
          No account? <Link href="/signup">Create one</Link>
        </div>
      </div>
    </main>
  );
}
