"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Cloud,
  Cpu,
  EyeOff,
  Github,
  KeyRound,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { EncryptionViz } from "@/components/EncryptionViz";
import { auth } from "@/lib/api";
import { getVaultSession } from "@/lib/vaultSession";

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    auth.me()
      .then(() => { if (!cancelled) setLoggedIn(getVaultSession() !== null); })
      .catch(() => { if (!cancelled) setLoggedIn(false); });
    return () => { cancelled = true; };
  }, []);

  function primaryCta() {
    if (loggedIn) router.push("/vault");
    else router.push("/signup");
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-brand">
          <Lock size={16} className="accent" />
          <span>ArgonVault</span>
        </div>
        <nav className="landing-nav-links">
          <a href="#how" className="landing-nav-link">How it works</a>
          <a href="#security" className="landing-nav-link">Security</a>
          <a
            href="https://github.com/KanishkSigar/argonvault"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-nav-link"
          >
            <Github size={13} /> GitHub
          </a>
          {loggedIn ? (
            <Link href="/vault" className="landing-nav-cta">Open vault <ArrowRight size={13} /></Link>
          ) : (
            <>
              <Link href="/login" className="landing-nav-link">Sign in</Link>
              <Link href="/signup" className="landing-nav-cta">Get started <ArrowRight size={13} /></Link>
            </>
          )}
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-badge">
          <span className="dot" /> end-to-end encrypted · open source
        </div>
        <h1 className="landing-hero-title">
          Your files. <span className="accent">Your keys.</span><br />
          Nobody else&apos;s.
        </h1>
        <p className="landing-hero-sub">
          ArgonVault is a zero-knowledge file vault. Your files are encrypted
          with <strong>AES-256-GCM</strong> in your browser using a key derived
          from your password with <strong>Argon2id</strong>. The server stores
          ciphertext at random UUIDs and cannot read your files, your folder
          names, or your password.
        </p>
        <div className="landing-hero-cta">
          <button onClick={primaryCta}>
            {loggedIn ? "Open vault" : "Create your vault"}
            <ArrowRight size={14} />
          </button>
          <a
            href="https://github.com/KanishkSigar/argonvault"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-secondary"
          >
            <Github size={13} /> View source
          </a>
        </div>
        <div className="landing-hero-stats">
          <Stat icon={<ShieldCheck size={14} />} label="Zero-knowledge" value="server-blind" />
          <Stat icon={<Cpu size={14} />} label="KDF" value="Argon2id · 64 MiB" />
          <Stat icon={<Cloud size={14} />} label="Storage" value="S3-compatible · presigned" />
        </div>
      </section>

      <section className="landing-demo">
        <EncryptionViz />
      </section>

      <section className="landing-arch" id="how">
        <h2 className="landing-section-title">How it works</h2>
        <p className="landing-section-sub">
          Three boxes. The crypto sits between your keyboard and the storage layer.
        </p>
        <div className="arch-grid">
          <ArchCard
            step="01"
            icon={<KeyRound size={18} />}
            title="Browser"
            sub="The only place plaintext exists"
            body={
              <>
                Your password runs through Argon2id (64 MiB, 3 iters).
                Half the output is your <span className="mono">wrap_key</span>;
                the other half is the <span className="mono">auth_token</span>
                {" "}sent to the server. Your <span className="mono">vault_key</span> is
                generated locally and wrapped under the <span className="mono">wrap_key</span>.
              </>
            }
          />
          <ArchCard
            step="02"
            icon={<Lock size={18} />}
            title="FastAPI broker"
            sub="Never sees plaintext"
            body={
              <>
                Verifies Argon2id auth, mints session JWTs, hands out presigned
                S3 URLs, stores wrapped data keys + encrypted filenames in
                SQLite. The server can prove who you are but cannot read what
                you store.
              </>
            }
          />
          <ArchCard
            step="03"
            icon={<Cloud size={18} />}
            title="S3-compatible storage"
            sub="Opaque ciphertext only"
            body={
              <>
                Browser PUTs straight to S3 (or MinIO) via presigned URLs.
                Objects live at random UUIDs; the bodies are <span className="mono">nonce || AES-GCM(...)</span>.
                Names, structure, sizes-by-name — none of it is reachable.
              </>
            }
          />
        </div>
      </section>

      <section className="landing-features" id="security">
        <h2 className="landing-section-title">Security at a glance</h2>
        <div className="features-grid">
          <Feature
            icon={<EyeOff size={16} />}
            title="Zero-knowledge metadata"
            body="Filenames and folder names are encrypted with your vault key. The server sees only base64 blobs."
          />
          <Feature
            icon={<Cpu size={16} />}
            title="Memory-hard KDF"
            body="Argon2id with 64 MiB cost makes brute-forcing the password on stolen DB rows expensive even on GPUs."
          />
          <Feature
            icon={<KeyRound size={16} />}
            title="Envelope encryption"
            body="Per-file data key wrapped by the vault key, which is wrapped by the password-derived key. KMS pattern."
          />
          <Feature
            icon={<ShieldCheck size={16} />}
            title="Anti-enumeration login"
            body="Unregistered emails get a deterministic dummy salt, so attackers can't probe for accounts."
          />
          <Feature
            icon={<Zap size={16} />}
            title="Direct browser → S3"
            body="Presigned URLs mean file bytes never traverse the API. Upload size is bounded by the browser, not Lambda."
          />
          <Feature
            icon={<Lock size={16} />}
            title="Rate-limited auth"
            body="Per-IP sliding-window limits on login/prelogin/register. Documented threat model and self-pen-test in SECURITY.md."
          />
        </div>
      </section>

      <section className="landing-final">
        <h2 className="landing-section-title">Ready to encrypt?</h2>
        <p className="landing-section-sub">
          Pick a password you&apos;ll remember. There is no reset — that&apos;s the point.
        </p>
        <div className="landing-hero-cta">
          <button onClick={primaryCta}>
            {loggedIn ? "Open vault" : "Create your vault"}
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      <footer className="landing-foot">
        <div className="landing-foot-row">
          <div className="row" style={{ gap: 8 }}>
            <Lock size={13} className="accent" />
            <span className="mono">ArgonVault</span>
          </div>
          <div className="row" style={{ gap: 16 }}>
            <a
              href="https://github.com/KanishkSigar/argonvault"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-nav-link"
            >
              <Github size={13} /> Source
            </a>
            <a
              href="https://github.com/KanishkSigar/argonvault/blob/main/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-nav-link"
            >
              Security
            </a>
            <span className="muted" style={{ fontSize: 12 }}>MIT licensed</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="landing-stat">
      <span className="landing-stat-icon">{icon}</span>
      <div>
        <div className="landing-stat-label">{label}</div>
        <div className="landing-stat-value mono">{value}</div>
      </div>
    </div>
  );
}

function ArchCard({
  step, icon, title, sub, body,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  body: React.ReactNode;
}) {
  return (
    <div className="arch-card">
      <div className="arch-card-step">{step}</div>
      <div className="arch-card-icon">{icon}</div>
      <div className="arch-card-title">{title}</div>
      <div className="arch-card-sub">{sub}</div>
      <p className="arch-card-body">{body}</p>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="feature-card">
      <div className="feature-card-icon">{icon}</div>
      <div className="feature-card-title">{title}</div>
      <p className="feature-card-body">{body}</p>
    </div>
  );
}
