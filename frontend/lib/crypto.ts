// All crypto used by the browser. Per-file file encryption, name encryption,
// wrap key derivation, and AES-GCM wrap/unwrap of the user's vault key and
// per-file data keys. The backend sees only opaque ciphertext.

export function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomNonce(): Uint8Array {
  return randomBytes(12);
}

// ----- KDF: password -> wrap_key + auth_token --------------------------------

import { argon2id } from "hash-wasm";

export type KdfParams = { m: number; t: number; p: number };

export const ARGON2ID_ALGORITHM = "argon2id";

/** RFC 9106 "second recommended" Argon2id profile — feasible in browser. */
export const DEFAULT_KDF_PARAMS: KdfParams = { m: 65536, t: 3, p: 1 };

/** Derive 64 bytes via Argon2id and split: first 32B = wrap_key, last 32B = auth_token. */
export async function deriveKeyAndAuth(
  password: string,
  saltB64: string,
  algorithm: string,
  params: KdfParams,
): Promise<{ wrapKey: Uint8Array; authToken: string }> {
  if (algorithm !== ARGON2ID_ALGORITHM) {
    throw new Error(`unsupported KDF: ${algorithm}`);
  }
  const out = (await argon2id({
    password,
    salt: b64decode(saltB64),
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m, // KiB
    hashLength: 64,
    outputType: "binary",
  })) as Uint8Array;
  return { wrapKey: out.slice(0, 32), authToken: b64encode(out.slice(32, 64)) };
}

// ----- AES-256-GCM helpers ---------------------------------------------------

async function aesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);
}

/** Encrypt to `nonce(12) || ct||tag` and return as one base64 blob. */
export async function aesEncryptB64(key: Uint8Array, plaintext: Uint8Array): Promise<string> {
  const nonce = randomNonce();
  const k = await aesKey(key, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, plaintext);
  const combined = new Uint8Array(nonce.length + ct.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(ct), nonce.length);
  return b64encode(combined);
}

/** Inverse of aesEncryptB64. */
export async function aesDecryptB64(key: Uint8Array, blobB64: string): Promise<Uint8Array> {
  const blob = b64decode(blobB64);
  if (blob.length < 12 + 16) throw new Error("ciphertext too short");
  const nonce = blob.slice(0, 12);
  const ct = blob.slice(12);
  const k = await aesKey(key, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, ct);
  return new Uint8Array(pt);
}

// ----- file encryption (caller provides nonce so it can be persisted) --------

export async function encryptFile(file: File, dataKey: Uint8Array, nonce: Uint8Array): Promise<ArrayBuffer> {
  const k = await aesKey(dataKey, ["encrypt"]);
  return crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, await file.arrayBuffer());
}

export async function decryptToBytes(
  ciphertext: ArrayBuffer,
  dataKey: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer> {
  const k = await aesKey(dataKey, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, ciphertext);
}

// ----- name encryption (used for folder + file display names) ----------------

export type EncryptedName = { name_ciphertext: string; name_nonce: string };

export async function encryptName(vaultKey: Uint8Array, name: string): Promise<EncryptedName> {
  const nonce = randomNonce();
  const k = await aesKey(vaultKey, ["encrypt"]);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    k,
    new TextEncoder().encode(name),
  );
  return { name_ciphertext: b64encode(new Uint8Array(ct)), name_nonce: b64encode(nonce) };
}

export async function decryptName(vaultKey: Uint8Array, ct: string, nonceB64: string): Promise<string> {
  const k = await aesKey(vaultKey, ["decrypt"]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(nonceB64) },
    k,
    b64decode(ct),
  );
  return new TextDecoder().decode(pt);
}
