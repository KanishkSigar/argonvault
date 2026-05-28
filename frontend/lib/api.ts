export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ----- types ----------------------------------------------------------------

export type NodeKind = "folder" | "file";

export type NodeOut = {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  name_ciphertext: string;
  name_nonce: string;
  wrapped_data_key: string | null;
  file_nonce: string | null;
  size: number | null;
  created_at: string;
  trashed_at: string | null;
};

export type PreloginResponse = {
  kdf_salt: string;
  kdf_algorithm: string;
  kdf_params: { m: number; t: number; p: number };
};
export type LoginResponse = { user_id: string; email: string; wrapped_vault_key: string };
export type InitUploadResponse = {
  file_id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
};
export type DownloadResponse = {
  download_url: string;
  wrapped_data_key: string;
  file_nonce: string;
};

// ----- transport ------------------------------------------------------------

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch { /* not json */ }
    throw new ApiError(res.status, detail);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : (undefined as T);
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

// ----- auth -----------------------------------------------------------------

export const auth = {
  prelogin: (email: string) =>
    request<PreloginResponse>(`/auth/prelogin?email=${encodeURIComponent(email)}`),

  register: (body: {
    email: string;
    auth_token: string;
    kdf_salt: string;
    kdf_algorithm: string;
    kdf_params: { m: number; t: number; p: number };
    wrapped_vault_key: string;
  }) => request<{ ok: true; user_id: string }>("/auth/register", jsonInit("POST", body)),

  login: (body: { email: string; auth_token: string }) =>
    request<LoginResponse>("/auth/login", jsonInit("POST", body)),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  me: () => request<{ user_id: string; email: string }>("/auth/me"),
};

// ----- nodes ----------------------------------------------------------------

export const nodes = {
  list: (parentId: string | null) => {
    const qs = parentId === null ? "" : `?parent_id=${encodeURIComponent(parentId)}`;
    return request<{ items: NodeOut[] }>(`/nodes${qs}`);
  },

  listTrash: () => request<{ items: NodeOut[] }>(`/nodes?trash=true`),

  createFolder: (body: { parent_id: string | null; name_ciphertext: string; name_nonce: string }) =>
    request<NodeOut>("/nodes/folder", jsonInit("POST", body)),

  initUpload: (body: {
    parent_id: string | null;
    name_ciphertext: string;
    name_nonce: string;
    wrapped_data_key: string;
    file_nonce: string;
  }) => request<InitUploadResponse>("/nodes/file/init-upload", jsonInit("POST", body)),

  completeUpload: (body: { file_id: string; size: number }) =>
    request<{ ok: true }>("/nodes/file/complete-upload", jsonInit("POST", body)),

  download: (id: string) =>
    request<DownloadResponse>(`/nodes/${encodeURIComponent(id)}/download`),

  rename: (id: string, body: { name_ciphertext: string; name_nonce: string }) =>
    request<NodeOut>(`/nodes/${encodeURIComponent(id)}/rename`, jsonInit("PATCH", body)),

  move: (id: string, new_parent_id: string | null) =>
    request<NodeOut>(`/nodes/${encodeURIComponent(id)}/move`, jsonInit("PATCH", { new_parent_id })),

  trash: (id: string) =>
    request<NodeOut>(`/nodes/${encodeURIComponent(id)}/trash`, { method: "POST" }),

  restore: (id: string) =>
    request<NodeOut>(`/nodes/${encodeURIComponent(id)}/restore`, { method: "POST" }),

  deletePermanently: (id: string) =>
    request<{ ok: true }>(`/nodes/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
