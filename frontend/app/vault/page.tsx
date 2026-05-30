"use client";

import {
  ChangeEvent,
  DragEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FileAudio,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  Home,
  Image as ImageIcon,
  Inbox,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { useToast } from "@/components/Toast";
import { ApiError, nodes as nodesApi } from "@/lib/api";
import {
  createFolder,
  decryptNodes,
  DecryptedNode,
  downloadAndSave,
  isPreviewable,
  logout,
  mimeFromName,
  previewBlobUrl,
  renameNode,
  uploadFile,
} from "@/lib/vault";
import { getVaultSession } from "@/lib/vaultSession";

type View = "files" | "trash";
type Crumb = { id: string | null; name: string };
type UploadJob = { id: string; name: string; status: "uploading" | "done" | "error" };

const SERVER_VIEW_KEY = "argonvault.serverView";

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fpFromId(id: string): string {
  return id.slice(0, 6) + "…" + id.slice(-4);
}

function shortDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "2-digit", day: "2-digit" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function VaultPage() {
  const router = useRouter();
  const toast = useToast();

  const [view, setView] = useState<View>("files");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "~" }]);
  const [items, setItems] = useState<DecryptedNode[] | null>(null);
  const [trashCount, setTrashCount] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [previewNode, setPreviewNode] = useState<DecryptedNode | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameNodeId, setRenameNodeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [serverView, setServerView] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = getVaultSession();
    if (!s) { router.replace("/login"); return; }
    setEmail(s.email);
    const persisted = localStorage.getItem(SERVER_VIEW_KEY);
    if (persisted === "1") setServerView(true);
  }, [router]);

  const refresh = useCallback(async () => {
    try {
      const raw = view === "trash" ? await nodesApi.listTrash() : await nodesApi.list(currentId);
      setItems(await decryptNodes(raw.items));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); return; }
      toast({ tone: "error", title: "could not load" });
    }
  }, [view, currentId, router, toast]);

  const refreshCounters = useCallback(async () => {
    try {
      const trash = await nodesApi.listTrash();
      setTrashCount(trash.items.length);
      let total = 0;
      const queue: (string | null)[] = [null];
      const visited = new Set<string | null>();
      while (queue.length) {
        const parent = queue.shift()!;
        if (visited.has(parent)) continue;
        visited.add(parent);
        const page = await nodesApi.list(parent);
        for (const n of page.items) {
          if (n.kind === "file") total += n.size ?? 0;
          else queue.push(n.id);
        }
      }
      setTotalBytes(total);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshCounters(); }, [refreshCounters, items]);

  function openFolder(node: DecryptedNode) {
    setCurrentId(node.id);
    setCrumbs((cs) => [...cs, { id: node.id, name: node.name }]);
  }
  function gotoCrumb(idx: number) {
    const next = crumbs.slice(0, idx + 1);
    setCrumbs(next);
    setCurrentId(next[next.length - 1].id);
  }
  function switchView(v: View) {
    setView(v);
    if (v === "files") { setCrumbs([{ id: null, name: "~" }]); setCurrentId(null); }
  }
  function toggleServerView(v: boolean) {
    setServerView(v);
    localStorage.setItem(SERVER_VIEW_KEY, v ? "1" : "0");
    if (v) toast({ tone: "info", title: "server view on", description: "showing exactly what storage sees" });
  }

  // ----- uploads -----
  async function runUpload(file: File) {
    const id = `${Date.now()}-${file.name}-${Math.random()}`;
    setUploads((u) => [...u, { id, name: file.name, status: "uploading" }]);
    try {
      await uploadFile(currentId, file);
      setUploads((u) => u.map((j) => (j.id === id ? { ...j, status: "done" as const } : j)));
      toast({ tone: "success", title: "uploaded", description: file.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload failed";
      setUploads((u) => u.map((j) => (j.id === id ? { ...j, status: "error" as const } : j)));
      toast({ tone: "error", title: "upload failed", description: msg });
    }
  }
  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    await Promise.all(arr.map(runUpload));
    refresh();
    setTimeout(() => setUploads((u) => u.filter((j) => j.status === "uploading")), 1500);
  }
  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files);
    if (fileInput.current) fileInput.current.value = "";
  }
  function onDragEnter(e: DragEvent) { e.preventDefault(); if (view === "files") setDragOver(true); }
  function onDragOver(e: DragEvent) { e.preventDefault(); if (view === "files") setDragOver(true); }
  function onDragLeave(e: DragEvent) { e.preventDefault(); if (e.currentTarget === e.target) setDragOver(false); }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (view !== "files") return;
    const files = e.dataTransfer?.files;
    if (files?.length) handleFiles(files);
  }

  async function submitNewFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(currentId, name);
      setShowNewFolder(false);
      setNewFolderName("");
      toast({ tone: "success", title: "folder created", description: name });
      refresh();
    } catch (e) {
      toast({ tone: "error", title: "could not create folder", description: e instanceof Error ? e.message : "" });
    }
  }
  function startRename(n: DecryptedNode) { setRenameNodeId(n.id); setRenameValue(n.name); }
  async function submitRename() {
    if (!renameNodeId) return;
    const newName = renameValue.trim();
    if (!newName) return setRenameNodeId(null);
    try { await renameNode(renameNodeId, newName); setRenameNodeId(null); refresh(); toast({ tone: "success", title: "renamed" }); }
    catch (e) { toast({ tone: "error", title: "rename failed", description: e instanceof Error ? e.message : "" }); }
  }

  async function onTrash(n: DecryptedNode) {
    try { await nodesApi.trash(n.id); refresh(); toast({ tone: "info", title: "moved to trash", description: n.name }); }
    catch { toast({ tone: "error", title: "could not move to trash" }); }
  }
  async function onRestore(n: DecryptedNode) {
    try { await nodesApi.restore(n.id); refresh(); toast({ tone: "success", title: "restored", description: n.name }); }
    catch { toast({ tone: "error", title: "restore failed" }); }
  }
  async function onPermanentlyDelete(n: DecryptedNode) {
    if (!confirm(`permanently delete "${n.name}"? this cannot be undone.`)) return;
    try { await nodesApi.deletePermanently(n.id); refresh(); toast({ tone: "info", title: "deleted forever", description: n.name }); }
    catch { toast({ tone: "error", title: "delete failed" }); }
  }

  async function onOpenPreview(n: DecryptedNode) {
    setPreviewNode(n); setPreviewUrl(null); setPreviewMime(null);
    try {
      const { url, mime } = await previewBlobUrl(n.id, n.name);
      setPreviewUrl(url); setPreviewMime(mime);
    } catch (e) {
      toast({ tone: "error", title: "preview failed", description: e instanceof Error ? e.message : "" });
      setPreviewNode(null);
    }
  }
  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewNode(null); setPreviewUrl(null); setPreviewMime(null);
  }
  async function onDownload(n: DecryptedNode) {
    try { await downloadAndSave(n.id, n.name); }
    catch (e) { toast({ tone: "error", title: "download failed", description: e instanceof Error ? e.message : "" }); }
  }
  async function onLogout() { await logout(); router.replace("/login"); }

  const activeUploads = useMemo(() => uploads.filter((u) => u.status === "uploading"), [uploads]);
  const isFiles = view === "files";
  const fileCount = items && isFiles ? items.filter((n) => n.kind === "file").length : 0;

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onView={switchView}
        fileCount={fileCount}
        trashCount={trashCount}
        totalBytes={totalBytes}
        serverView={serverView}
        onServerView={toggleServerView}
        onShowHowItWorks={() => setShowHowItWorks(true)}
      />

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <StatusBar
          chips={[
            { key: "user", value: email ?? "—" },
            { key: "kdf", value: "argon2id-64M/3/1" },
            { key: "aead", value: "aes-256-gcm" },
            { key: "vault", value: `${fileCount}f · ${formatBytes(totalBytes)}` },
            { key: "server", value: "blind", tone: "live" },
          ]}
        />

        <main className="app-main">
          <header className="app-topbar">
            {isFiles ? (
              <nav className="breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={`${c.id ?? "root"}-${i}`} className="row" style={{ gap: 2 }}>
                    {i > 0 && <span className="sep"><ChevronRight size={13} /></span>}
                    <span
                      className={`crumb ${i === crumbs.length - 1 ? "current" : ""}`}
                      onClick={() => i !== crumbs.length - 1 && gotoCrumb(i)}
                    >
                      {i === 0 ? <Home size={12} /> : null}
                      {c.name}
                    </span>
                  </span>
                ))}
              </nav>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                // items in trash — restore or delete permanently
              </span>
            )}

            {email && <AccountMenu email={email} onLogout={onLogout} />}
          </header>

          <section className="app-toolbar">
            {isFiles && (
              <div className="row" style={{ gap: 8 }}>
                <button className="ghost" onClick={() => setShowNewFolder(true)}>
                  <FolderPlus size={13} /> new folder
                </button>
                <button onClick={() => fileInput.current?.click()}>
                  <Upload size={13} /> upload
                </button>
                <input ref={fileInput} type="file" multiple onChange={onPickFile} style={{ display: "none" }} />
              </div>
            )}
            {serverView && (
              <div className="server-banner">
                <span className="dot" /> server view · showing exactly what storage sees
              </div>
            )}
          </section>

          {activeUploads.length > 0 && (
            <div className="status-strip">
              {activeUploads.map((u) => (
                <div key={u.id} className="upload-row">
                  <span className="row" style={{ gap: 8, overflow: "hidden", flex: 1 }}>
                    <Loader2 size={13} className="spin green" />
                    <span className="name">{u.name}</span>
                  </span>
                  <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>encrypting + uploading…</span>
                </div>
              ))}
            </div>
          )}

          <div
            className={`drop-zone ${dragOver ? "dragover" : ""}`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {!items ? (
              <div className="empty">
                <Loader2 size={20} className="spin" />
                <span>loading…</span>
              </div>
            ) : items.length === 0 ? (
              <div className="empty">
                <Inbox size={32} className="icon" />
                <span>{isFiles ? "$ empty — drag files here or use the buttons above" : "$ trash is empty"}</span>
              </div>
            ) : (
              <table className={`ls ${serverView ? "server" : ""}`}>
                <thead>
                  <tr>
                    <th></th>
                    <th>{serverView ? "object_id" : "fp"}</th>
                    <th>{serverView ? "name_ct" : "name"}</th>
                    <th style={{ textAlign: "right" }}>size</th>
                    <th>created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((n) => (
                    <NodeRow
                      key={n.id}
                      node={n}
                      serverView={serverView}
                      inTrash={!isFiles}
                      onOpenFolder={() => openFolder(n)}
                      onPreview={() => onOpenPreview(n)}
                      onDownload={() => onDownload(n)}
                      onTrash={() => onTrash(n)}
                      onRestore={() => onRestore(n)}
                      onPermanentlyDelete={() => onPermanentlyDelete(n)}
                      onRename={() => startRename(n)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {showNewFolder && (
            <Modal title="$ mkdir" onClose={() => setShowNewFolder(false)}>
              <input
                type="text"
                placeholder="folder name"
                value={newFolderName}
                autoFocus
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNewFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="ghost" onClick={() => setShowNewFolder(false)}>cancel</button>
                <button onClick={submitNewFolder} disabled={!newFolderName.trim()}>create</button>
              </div>
            </Modal>
          )}

          {renameNodeId && (
            <Modal title="$ mv" onClose={() => setRenameNodeId(null)}>
              <input
                type="text"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenameNodeId(null); }}
              />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="ghost" onClick={() => setRenameNodeId(null)}>cancel</button>
                <button onClick={submitRename} disabled={!renameValue.trim()}>rename</button>
              </div>
            </Modal>
          )}

          {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}

          {previewNode && (
            <div className="modal-backdrop" onClick={closePreview}>
              <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
                <header>
                  <span className="name">
                    {iconForName(previewNode.name, 14)}
                    <span className="mono">{previewNode.name}</span>
                  </span>
                  <div className="row">
                    <button className="ghost" onClick={() => onDownload(previewNode)}>
                      <Download size={13} /> download
                    </button>
                    <button className="icon" onClick={closePreview} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>
                </header>
                <div className="body">
                  {!previewUrl ? (
                    <span className="muted row" style={{ gap: 8 }}>
                      <Loader2 size={15} className="spin" /> decrypting…
                    </span>
                  ) : previewMime?.startsWith("image/") ? (
                    <img src={previewUrl} alt={previewNode.name} />
                  ) : previewMime === "application/pdf" ? (
                    <iframe src={previewUrl} title={previewNode.name} />
                  ) : previewMime?.startsWith("video/") ? (
                    <video src={previewUrl} controls />
                  ) : previewMime?.startsWith("audio/") ? (
                    <audio src={previewUrl} controls />
                  ) : (
                    <span className="muted">no preview for this file type. download instead.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );

  function NodeRow({
    node, serverView, inTrash,
    onOpenFolder, onPreview, onDownload, onTrash, onRestore, onPermanentlyDelete, onRename,
  }: {
    node: DecryptedNode;
    serverView: boolean;
    inTrash: boolean;
    onOpenFolder: () => void;
    onPreview: () => void;
    onDownload: () => void;
    onTrash: () => void;
    onRestore: () => void;
    onPermanentlyDelete: () => void;
    onRename: () => void;
  }) {
    const isFolder = node.kind === "folder";
    const previewable = !isFolder && isPreviewable(node.name);

    function onRowClick() {
      if (inTrash || serverView) return;
      if (isFolder) onOpenFolder();
      else if (previewable) onPreview();
      else onDownload();
    }
    function clickAction(e: MouseEvent, fn: () => void) { e.stopPropagation(); fn(); }

    if (serverView) {
      return (
        <tr>
          <td className="flag">─</td>
          <td className="fp">{node.id.slice(0, 12)}…</td>
          <td className="name">
            <span className="icon">{iconForName("opaque", 13)}</span>
            <span className="mono" style={{ fontSize: 11 }}>{node.name_ciphertext.slice(0, 36)}…</span>
          </td>
          <td className="size">{node.kind === "file" ? `${node.size ?? 0} B ct` : "—"}</td>
          <td className="date">{shortDate(node.created_at)}</td>
          <td className="actions"></td>
        </tr>
      );
    }

    return (
      <tr onClick={onRowClick} title={node.name}>
        <td className="flag">{isFolder ? "d" : "-"}</td>
        <td className="fp">{fpFromId(node.id)}</td>
        <td className="name">
          <span className="icon">{iconForName(node.name, 13, isFolder)}</span>
          {node.name}
        </td>
        <td className="size">{isFolder ? "—" : formatBytes(node.size)}</td>
        <td className="date">{shortDate(node.created_at)}</td>
        <td className="actions">
          {inTrash ? (
            <>
              <button className="icon" onClick={(e) => clickAction(e, onRestore)} title="Restore">
                <RotateCcw size={13} />
              </button>
              <button className="icon danger" onClick={(e) => clickAction(e, onPermanentlyDelete)} title="Delete forever">
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              {!isFolder && (
                <button className="icon" onClick={(e) => clickAction(e, onDownload)} title="Download">
                  <Download size={13} />
                </button>
              )}
              <button className="icon" onClick={(e) => clickAction(e, onRename)} title="Rename">
                <Pencil size={13} />
              </button>
              <button className="icon danger" onClick={(e) => clickAction(e, onTrash)} title="Move to trash">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </td>
      </tr>
    );
  }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2>// crypto — flow</h2>
        <ol className="how-list">
          <li>
            <strong>password → keys (browser).</strong> argon2id (64 MiB / 3 iters) splits into
            <span className="mono"> wrap_key</span> + <span className="mono">auth_token</span>.
          </li>
          <li>
            <strong>vault key (browser).</strong> 32 random bytes, wrapped under <span className="mono">wrap_key</span>.
            Server only stores the wrapped form.
          </li>
          <li>
            <strong>per-file keys (browser).</strong> Every upload gets a fresh AES-256-GCM
            data key, wrapped under <span className="mono">vault_key</span>.
          </li>
          <li>
            <strong>direct → S3.</strong> Encrypted bytes go straight from the browser to
            storage via a presigned URL. The API never touches plaintext or ciphertext.
          </li>
          <li>
            <strong>filenames encrypted too.</strong> The server sees opaque base64. Toggle
            <em> server view</em> in the sidebar to see exactly that.
          </li>
        </ol>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button onClick={onClose}>got it</button>
        </div>
      </div>
    </div>
  );
}

function iconForName(name: string, size: number, isFolder = false) {
  if (isFolder) return <Folder size={size} />;
  const m = mimeFromName(name);
  if (!m) return <FileIcon size={size} />;
  if (m.startsWith("image/")) return <ImageIcon size={size} />;
  if (m === "application/pdf") return <FileText size={size} />;
  if (m.startsWith("video/")) return <FileVideo size={size} />;
  if (m.startsWith("audio/")) return <FileAudio size={size} />;
  if (m.startsWith("text/")) return <FileText size={size} />;
  return <FileIcon size={size} />;
}
