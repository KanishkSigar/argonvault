// High-level browser orchestration: signup/login key derivation, file
// upload/download with per-file data keys, and node-name encryption.

import { auth, nodes, NodeOut } from "./api";
import {
  aesDecryptB64,
  aesEncryptB64,
  ARGON2ID_ALGORITHM,
  b64decode,
  b64encode,
  decryptName,
  decryptToBytes,
  DEFAULT_KDF_PARAMS,
  deriveKeyAndAuth,
  encryptFile,
  encryptName,
  randomBytes,
  randomNonce,
} from "./crypto";
import { clearVaultSession, getVaultSession, setVaultSession, VaultSession } from "./vaultSession";

// ----- signup / login --------------------------------------------------------

export async function signup(email: string, password: string): Promise<VaultSession> {
  const salt = b64encode(randomBytes(16));
  const params = DEFAULT_KDF_PARAMS;

  const { wrapKey, authToken } = await deriveKeyAndAuth(password, salt, ARGON2ID_ALGORITHM, params);

  const vaultKey = randomBytes(32);
  const wrapped = await aesEncryptB64(wrapKey, vaultKey);

  const res = await auth.register({
    email,
    auth_token: authToken,
    kdf_salt: salt,
    kdf_algorithm: ARGON2ID_ALGORITHM,
    kdf_params: params,
    wrapped_vault_key: wrapped,
  });

  const session: VaultSession = { userId: res.user_id, email, vaultKey };
  setVaultSession(session);
  return session;
}

export async function login(email: string, password: string): Promise<VaultSession> {
  const pre = await auth.prelogin(email);
  const { wrapKey, authToken } = await deriveKeyAndAuth(
    password,
    pre.kdf_salt,
    pre.kdf_algorithm,
    pre.kdf_params,
  );
  const res = await auth.login({ email, auth_token: authToken });

  let vaultKey: Uint8Array;
  try {
    vaultKey = await aesDecryptB64(wrapKey, res.wrapped_vault_key);
  } catch {
    // Server accepted login but our wrap_key can't unwrap the vault key.
    // This shouldn't happen unless the DB rows are corrupt.
    throw new Error("could not unlock your vault — wrong password or corrupted account");
  }

  const session: VaultSession = { userId: res.user_id, email, vaultKey };
  setVaultSession(session);
  return session;
}

export async function logout(): Promise<void> {
  await auth.logout().catch(() => undefined);
  clearVaultSession();
}

// ----- node display (decrypt names + return display rows) -------------------

export type DecryptedNode = NodeOut & { name: string };

export async function decryptNodes(items: NodeOut[]): Promise<DecryptedNode[]> {
  const sess = getVaultSession();
  if (!sess) throw new Error("not unlocked");
  return Promise.all(
    items.map(async (n) => {
      let name: string;
      try {
        name = await decryptName(sess.vaultKey, n.name_ciphertext, n.name_nonce);
      } catch {
        name = "[unreadable]";
      }
      return { ...n, name };
    }),
  );
}

// ----- folder ops ------------------------------------------------------------

export async function createFolder(parentId: string | null, name: string): Promise<NodeOut> {
  const sess = getVaultSession();
  if (!sess) throw new Error("not unlocked");
  const { name_ciphertext, name_nonce } = await encryptName(sess.vaultKey, name);
  return nodes.createFolder({ parent_id: parentId, name_ciphertext, name_nonce });
}

export async function renameNode(id: string, newName: string): Promise<NodeOut> {
  const sess = getVaultSession();
  if (!sess) throw new Error("not unlocked");
  const enc = await encryptName(sess.vaultKey, newName);
  return nodes.rename(id, enc);
}

// ----- file upload (one file) ------------------------------------------------

export async function uploadFile(parentId: string | null, file: File): Promise<NodeOut> {
  const sess = getVaultSession();
  if (!sess) throw new Error("not unlocked");

  const dataKey = randomBytes(32);
  const fileNonce = randomNonce();
  const wrappedDataKey = await aesEncryptB64(sess.vaultKey, dataKey);
  const encName = await encryptName(sess.vaultKey, file.name);

  const init = await nodes.initUpload({
    parent_id: parentId,
    name_ciphertext: encName.name_ciphertext,
    name_nonce: encName.name_nonce,
    wrapped_data_key: wrappedDataKey,
    file_nonce: b64encode(fileNonce),
  });

  const ciphertext = await encryptFile(file, dataKey, fileNonce);

  const put = await fetch(init.upload_url, {
    method: "PUT",
    headers: init.upload_headers,
    body: ciphertext,
  });
  if (!put.ok) throw new Error(`S3 upload failed (${put.status})`);

  await nodes.completeUpload({ file_id: init.file_id, size: ciphertext.byteLength });
  // Return enough to render; size will be re-fetched on list refresh.
  return {
    id: init.file_id,
    parent_id: parentId,
    kind: "file",
    name_ciphertext: encName.name_ciphertext,
    name_nonce: encName.name_nonce,
    wrapped_data_key: wrappedDataKey,
    file_nonce: b64encode(fileNonce),
    size: ciphertext.byteLength,
    created_at: new Date().toISOString(),
    trashed_at: null,
  };
}

// ----- file download / preview ----------------------------------------------

async function fetchDecryptedBytes(id: string): Promise<ArrayBuffer> {
  const sess = getVaultSession();
  if (!sess) throw new Error("not unlocked");
  const h = await nodes.download(id);
  const dataKey = await aesDecryptB64(sess.vaultKey, h.wrapped_data_key);
  const res = await fetch(h.download_url);
  if (!res.ok) throw new Error(`storage fetch failed (${res.status})`);
  const ct = await res.arrayBuffer();
  return decryptToBytes(ct, dataKey, b64decode(h.file_nonce));
}

export async function downloadAndSave(id: string, displayName: string): Promise<void> {
  const bytes = await fetchDecryptedBytes(id);
  const blob = new Blob([bytes], { type: mimeFromName(displayName) || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = displayName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** For preview: returns a blob URL the browser can render in <img>/<iframe>.
 *  Caller must URL.revokeObjectURL when done. */
export async function previewBlobUrl(id: string, displayName: string): Promise<{ url: string; mime: string }> {
  const bytes = await fetchDecryptedBytes(id);
  const mime = mimeFromName(displayName) || "application/octet-stream";
  const blob = new Blob([bytes], { type: mime });
  return { url: URL.createObjectURL(blob), mime };
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain", md: "text/plain", json: "application/json", csv: "text/csv",
  mp3: "audio/mpeg", wav: "audio/wav",
  mp4: "video/mp4", webm: "video/webm",
};

export function mimeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] ?? null : null;
}

export function isPreviewable(name: string): boolean {
  const mime = mimeFromName(name);
  if (!mime) return false;
  return mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("video/") || mime.startsWith("audio/");
}
