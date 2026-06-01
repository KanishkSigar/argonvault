"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Live AES-256-GCM logic-flow demo.
 *
 *   [INPUT] ─▶ [AES-256-GCM] ─▶ [BASE64] ─▶ [OUTPUT]
 *                   ▲
 *              [data key, generated on mount — never re-rendered server-side]
 *              [nonce 12B, fresh per encryption]
 *
 * Key generation is deferred to useEffect so the server and client agree on
 * initial render (no hydration mismatch).
 */
export function EncryptionViz() {
  const [plaintext, setPlaintext] = useState("argonvault is zero-knowledge");
  const [keyBytes, setKeyBytes] = useState<Uint8Array | null>(null);
  const [ciphertext, setCiphertext] = useState("");
  const [nonce, setNonce] = useState("");
  const [revealKey, setRevealKey] = useState(false);

  // generate the demo key only on the client
  useEffect(() => {
    setKeyBytes(randomBytes(32));
  }, []);

  const keyFull = keyBytes ? b64encode(keyBytes) : "";
  const keyFingerprint = keyFull.slice(0, 16);

  useEffect(() => {
    if (!keyBytes) return;
    let cancelled = false;
    (async () => {
      try {
        const cryptoKey = await crypto.subtle.importKey(
          "raw", keyBytes, "AES-GCM", false, ["encrypt"],
        );
        const n = randomBytes(12);
        const ct = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: n },
          cryptoKey,
          new TextEncoder().encode(plaintext || " "),
        );
        if (cancelled) return;
        const combined = new Uint8Array(n.length + ct.byteLength);
        combined.set(n, 0);
        combined.set(new Uint8Array(ct), n.length);
        setNonce(b64encode(n));
        setCiphertext(b64encode(combined));
      } catch (e) {
        setCiphertext("(error: " + (e instanceof Error ? e.message : "unknown") + ")");
      }
    })();
    return () => { cancelled = true; };
  }, [plaintext, keyBytes]);

  return (
    <div className="viz">
      <span className="viz-title">LIVE — AES-256-GCM</span>

      <div className="viz-row">
        <label className="viz-label">$ input (plaintext)</label>
        <input
          className="viz-input"
          type="text"
          value={plaintext}
          maxLength={120}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder="type anything…"
          spellCheck={false}
        />
      </div>

      <div className="viz-pipe">
        <div className="viz-pipe-line">
          <span className="viz-op">aes-256-gcm</span>
        </div>
      </div>

      <div className="viz-row" style={{ marginBottom: 0 }}>
        <label className="viz-label">→ output (sent to server)</label>
        <div className="viz-output" suppressHydrationWarning>
          {ciphertext || "—"}
        </div>
      </div>

      <div className="viz-meta">
        <div className="viz-meta-cell">
          <span className="viz-meta-key">nonce (12B)</span>
          <span className="viz-meta-val" suppressHydrationWarning>{nonce || "—"}</span>
        </div>
        <div className="viz-meta-cell">
          <span className="viz-meta-key">
            data key (32B)
            <button
              type="button"
              className="viz-reveal"
              onClick={() => setRevealKey((v) => !v)}
              aria-label="Toggle key reveal"
              style={{ marginLeft: "auto" }}
            >
              {revealKey ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </span>
          <span className="viz-meta-val" suppressHydrationWarning title={revealKey ? "" : "click the eye to reveal"}>
            {!keyBytes ? "—" : revealKey ? keyFull : `${keyFingerprint}…`}
          </span>
        </div>
      </div>

      <p className="viz-foot">
        Same primitive ArgonVault uses on every file. In the real app, the data
        key itself is wrapped under a key derived from your password — so even
        this ciphertext travels with its key already protected.
      </p>
    </div>
  );
}
