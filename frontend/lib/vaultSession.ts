// Holds the unlocked vault key + identity in sessionStorage so a page refresh
// inside the same tab keeps you logged in, but closing the tab drops the key.

import { b64decode, b64encode } from "./crypto";

const KEY_VAULT = "vault.key";
const KEY_EMAIL = "vault.email";
const KEY_USER_ID = "vault.userId";

export type VaultSession = { userId: string; email: string; vaultKey: Uint8Array };

export function setVaultSession(s: VaultSession) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY_VAULT, b64encode(s.vaultKey));
  sessionStorage.setItem(KEY_EMAIL, s.email);
  sessionStorage.setItem(KEY_USER_ID, s.userId);
}

export function getVaultSession(): VaultSession | null {
  if (typeof window === "undefined") return null;
  const k = sessionStorage.getItem(KEY_VAULT);
  const email = sessionStorage.getItem(KEY_EMAIL);
  const userId = sessionStorage.getItem(KEY_USER_ID);
  if (!k || !email || !userId) return null;
  return { vaultKey: b64decode(k), email, userId };
}

export function clearVaultSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY_VAULT);
  sessionStorage.removeItem(KEY_EMAIL);
  sessionStorage.removeItem(KEY_USER_ID);
}
