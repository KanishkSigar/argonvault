"use client";

import { Eye, EyeOff, Key, Lock, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// Tiny embedded helpers (decoupled from /lib so this component can be dropped
// on any marketing page without dragging the vault APIs in).
function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * A live demo of AES-256-GCM running in the browser.
 *
 *   - You type a string.
 *   - On every keystroke we encrypt it with a fresh nonce and show:
 *       · what you typed (plaintext)
 *       · the ciphertext blob the server would receive (base64)
 *       · key fingerprint (random per page load)
 *       · nonce (random per encryption)
 *
 *  The key is generated once per page mount and never leaves this component.
 */
export function EncryptionViz() {
  const [plaintext, setPlaintext] = useState("ArgonVault is zero-knowledge.");
  const [ciphertext, setCiphertext] = useState("");
  const [nonce, setNonce] = useState("");
  const [revealKey, setRevealKey] = useState(false);

  const keyBytes = useMemo(() => randomBytes(32), []);
  const keyFingerprint = useMemo(() => {
    // Stable visual digest of the key — first 8 chars of base64.
    return b64encode(keyBytes).slice(0, 16);
  }, [keyBytes]);
  const keyFull = useMemo(() => b64encode(keyBytes), [keyBytes]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
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
    }
    run();
    return () => { cancelled = true; };
  }, [plaintext, keyBytes]);

  return (
    <div className="enc-viz">
      <div className="enc-viz-head">
        <Zap size={14} className="accent" />
        <span>Live demo · AES-256-GCM in your browser</span>
      </div>

      <div className="enc-viz-row">
        <label className="enc-viz-label">Plaintext</label>
        <input
          className="enc-viz-input"
          type="text"
          value={plaintext}
          maxLength={120}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder="Type anything…"
          spellCheck={false}
        />
      </div>

      <div className="enc-viz-arrow">
        <Lock size={14} className="accent" /> encrypt
      </div>

      <div className="enc-viz-row">
        <label className="enc-viz-label">Ciphertext sent to server</label>
        <div className="enc-viz-output mono">{ciphertext}</div>
      </div>

      <div className="enc-viz-meta">
        <div className="enc-viz-meta-cell">
          <span className="enc-viz-meta-key">nonce</span>
          <span className="mono enc-viz-meta-val">{nonce}</span>
        </div>
        <div className="enc-viz-meta-cell">
          <span className="enc-viz-meta-key">
            <Key size={11} /> data key
            <button
              type="button"
              className="enc-viz-reveal"
              onClick={() => setRevealKey((v) => !v)}
              aria-label="Toggle key reveal"
            >
              {revealKey ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </span>
          <span className="mono enc-viz-meta-val" title={revealKey ? "" : "click the eye to reveal"}>
            {revealKey ? keyFull : keyFingerprint + "…"}
          </span>
        </div>
      </div>

      <p className="enc-viz-foot muted">
        This is the same primitive ArgonVault uses on every file.
        In the real app, the data key itself is wrapped under a key derived
        from your password — so even this ciphertext travels with its key
        already protected.
      </p>
    </div>
  );
}
