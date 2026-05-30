"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Github } from "lucide-react";
import { Bracket } from "@/components/Bracket";
import { EncryptionViz } from "@/components/EncryptionViz";
import { Schematic } from "@/components/Schematic";
import { Terminal } from "@/components/Terminal";
import { TypeWriter } from "@/components/TypeWriter";
import { auth } from "@/lib/api";
import { getVaultSession } from "@/lib/vaultSession";

const HERO_SESSION = [
  <><span className="term-prompt">$</span> argonvault auth derive</>,
  <><span className="term-comment">  → reading password from stdin (●●●●●●●●)</span></>,
  <><span className="term-arrow">  →</span> argon2id(<span className="term-out">m=64MiB, t=3, p=1</span>) <span className="term-ok">✓</span></>,
  <><span className="term-arrow">  →</span> derived: <span className="term-out">wrap_key</span> + <span className="term-out">auth_token</span></>,
  <></>,
  <><span className="term-prompt">$</span> argonvault encrypt ./design.pdf</>,
  <><span className="term-arrow">  →</span> aes-256-gcm(<span className="term-out">data_key, nonce=12B</span>) <span className="term-ok">✓</span></>,
  <><span className="term-arrow">  →</span> PUT https://storage/<span className="term-out">9f4c3a…</span> <span className="term-ok">✓ 200 OK</span></>,
  <><span className="term-comment">  // 0 bytes of plaintext left this browser</span></>,
];

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

  function primary() {
    if (loggedIn) router.push("/vault");
    else router.push("/signup");
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="accent-bar" />
          ARGONVAULT
          <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>v0.4.0</span>
        </div>
        <nav className="landing-nav-links">
          <a href="#flow" className="landing-nav-link">flow</a>
          <a href="#spec" className="landing-nav-link">spec</a>
          <a
            href="https://github.com/KanishkSigar/argonvault"
            target="_blank" rel="noopener noreferrer"
            className="landing-nav-link"
          ><Github size={12} /> source</a>
          {loggedIn ? (
            <Link href="/vault" className="landing-nav-cta">open vault <ArrowRight size={12} /></Link>
          ) : (
            <>
              <Link href="/login" className="landing-nav-link">sign in</Link>
              <Link href="/signup" className="landing-nav-cta">create vault <ArrowRight size={12} /></Link>
            </>
          )}
        </nav>
      </header>

      <section className="landing-hero">
        <div>
          <div className="hero-spec">
            DRAWING <strong>A-01</strong> · REV <strong>04</strong> · CLASSIFICATION <strong>ZERO-KNOWLEDGE</strong>
          </div>
          <h1 className="hero-title">
            Files you store.<br />
            <span className="accent">Keys you keep.</span><br />
            Server that&apos;s blind.
          </h1>
          <p className="hero-sub">
            ArgonVault is a zero-knowledge file vault. Your password derives a
            key in your browser, encrypts every file with AES-256-GCM, and uploads
            the ciphertext directly to S3. The server stores opaque blobs and
            cannot read your files, folder names, or password.
          </p>
          <div className="hero-cta">
            <button onClick={primary}>
              {loggedIn ? "open vault" : "create vault"} <ArrowRight size={13} />
            </button>
            <button className="ghost" onClick={() => window.location.assign("#flow")}>
              read the spec
            </button>
          </div>
          <div className="hero-meta">
            <span>KDF: <b>Argon2id-64M/3/1</b></span>
            <span>AEAD: <b>AES-256-GCM</b></span>
            <span>STORAGE: <b>S3-compatible</b></span>
          </div>
        </div>

        <Terminal>
          <TypeWriter lines={HERO_SESSION} pause={260} startDelay={300} />
        </Terminal>
      </section>

      {/* DATA FLOW (schematic) */}
      <section id="flow" className="landing-section">
        <div className="landing-section-head">
          <div className="section-marker">02 — data flow</div>
          <h2 className="landing-section-title">Three boxes, two wires.</h2>
          <p className="landing-section-sub">
            Crypto sits between your keyboard and the storage layer. The API in
            the middle never sees plaintext or ciphertext — it brokers keys and
            mints presigned URLs.
          </p>
        </div>
        <Schematic />
      </section>

      {/* LIVE DEMO */}
      <section className="landing-section">
        <div className="landing-section-head">
          <div className="section-marker">03 — live</div>
          <h2 className="landing-section-title">Encryption, right now.</h2>
          <p className="landing-section-sub">
            Type into the input. Watch AES-256-GCM ciphertext recompute on
            every keystroke, in your browser, with a fresh nonce per encryption.
          </p>
        </div>
        <EncryptionViz />
      </section>

      {/* SPEC SHEET */}
      <section id="spec" className="landing-section">
        <div className="landing-section-head">
          <div className="section-marker">04 — spec</div>
          <h2 className="landing-section-title">What it actually does.</h2>
          <p className="landing-section-sub">
            Every claim has a parameter. Every parameter is in the README.
          </p>
        </div>
        <div className="spec-rows">
          <Spec num="S-01" title="Zero-knowledge metadata"
            desc="Filenames and folder names are encrypted with your vault key. The server sees opaque base64 blobs at random UUIDs." />
          <Spec num="S-02" title="Memory-hard KDF"
            desc="Argon2id with 64 MiB cost makes brute-forcing a stolen password hash expensive even on GPUs." />
          <Spec num="S-03" title="Envelope encryption"
            desc="Per-file data key wrapped by the vault key, which is wrapped by the password-derived key. Same pattern as AWS KMS." />
          <Spec num="S-04" title="Anti-enumeration login"
            desc="Unknown emails receive a deterministic HMAC-derived dummy salt. Attackers can't probe for accounts." />
          <Spec num="S-05" title="Direct browser → S3"
            desc="Presigned URLs mean file bytes never traverse the API. Upload size is bounded by the browser, not the API host." />
          <Spec num="S-06" title="Rate-limited auth"
            desc="Per-IP sliding-window limits on login/prelogin/register. Threat model and self-pen-test in SECURITY.md." />
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section">
        <Bracket green>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 18 }}>
            <h2 className="landing-section-title" style={{ textAlign: "center" }}>
              Ready to encrypt.<span className="cursor-ink" />
            </h2>
            <p className="landing-section-sub" style={{ textAlign: "center" }}>
              Pick a password you&apos;ll remember. There is no reset — that&apos;s the point.
            </p>
            <button onClick={primary}>
              {loggedIn ? "open vault" : "create vault"} <ArrowRight size={13} />
            </button>
          </div>
        </Bracket>
      </section>

      {/* TITLE BLOCK FOOTER */}
      <div className="title-block">
        <div className="title-block-cell">
          <div className="k">PROJECT</div>
          <div className="v">ARGONVAULT</div>
        </div>
        <div className="title-block-cell">
          <div className="k">DRAWING</div>
          <div className="v">A-01</div>
        </div>
        <div className="title-block-cell">
          <div className="k">REV</div>
          <div className="v">04</div>
        </div>
        <div className="title-block-cell">
          <div className="k">LICENSE</div>
          <div className="v">MIT</div>
        </div>
        <div className="title-block-cell">
          <div className="k">SOURCE</div>
          <div className="v">
            <a href="https://github.com/KanishkSigar/argonvault" target="_blank" rel="noopener noreferrer">github↗</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="spec-row">
      <div className="num">{num}</div>
      <div className="body">
        <div className="title">{title}</div>
        <div className="desc">{desc}</div>
      </div>
    </div>
  );
}
