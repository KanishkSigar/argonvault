"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
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
      if (err instanceof ApiError && err.status === 401) setError("wrong email or password");
      else if (err instanceof ApiError && err.status === 429) setError("too many attempts — wait a moment");
      else if (err instanceof Error) setError(err.message.toLowerCase());
      else setError("login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-head">
          <span className="dots"><span /><span /><span /></span>
          <span>argonvault — bash · auth login</span>
        </div>
        <div className="auth-card-body">
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">Decrypt locally; the server stays blind.</p>

          <form onSubmit={onSubmit}>
            <div className="auth-field">
              <label htmlFor="email">email</label>
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
              <label htmlFor="password">password</label>
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

            {error && <p className="red" style={{ margin: "4px 0", fontSize: 12 }}>! {error}</p>}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <><Loader2 size={13} className="spin" /> deriving + verifying</> : <>sign in <ArrowRight size={13} /></>}
            </button>
          </form>
        </div>
        <div className="auth-foot">
          no account? <Link href="/signup">create one →</Link>
        </div>
      </div>
    </main>
  );
}
