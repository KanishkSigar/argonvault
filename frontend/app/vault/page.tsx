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
  FolderOpen,
  FolderPlus,
  Home,
  Image as ImageIcon,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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

type Tab = "files" | "trash";
type Crumb = { id: string | null; name: string };
type UploadJob = { id: string; name: string; status: "uploading" | "done" | "error"; error?: string };

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function VaultPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("files");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "Home" }]);
  const [items, setItems] = useState<DecryptedNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const fileInput = useRef<HTMLInputElement>(null);

  // ---- bootstrap ----
  useEffect(() => {
    const s = getVaultSession();
    if (!s) { router.replace("/login"); return; }
    setEmail(s.email);
  }, [router]);

  // ---- list refresh ----
  const refresh = useCallback(async () => {
    try {
      const raw = tab === "trash" ? await nodesApi.listTrash() : await nodesApi.list(currentId);
      const decrypted = await decryptNodes(raw.items);
      setItems(decrypted);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); return; }
      setError("Could not load");
    }
  }, [tab, currentId, router]);

  useEffect(() => { refresh(); }, [refresh]);

  // ---- nav ----
  function openFolder(node: DecryptedNode) {
    setCurrentId(node.id);
    setCrumbs((cs) => [...cs, { id: node.id, name: node.name }]);
  }
  function gotoCrumb(idx: number) {
    const next = crumbs.slice(0, idx + 1);
    setCrumbs(next);
    setCurrentId(next[next.length - 1].id);
  }
  function switchTab(t: Tab) {
    setTab(t);
    if (t === "files") {
      // reset to root on Files tab so the breadcrumb makes sense
      setCrumbs([{ id: null, name: "Home" }]);
      setCurrentId(null);
    }
  }

  // ---- uploads ----
  async function runUpload(file: File) {
    const id = `${Date.now()}-${file.name}-${Math.random()}`;
    setUploads((u) => [...u, { id, name: file.name, status: "uploading" }]);
    try {
      await uploadFile(currentId, file);
      setUploads((u) => u.map((j) => (j.id === id ? { ...j, status: "done" as const } : j)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload failed";
      setUploads((u) => u.map((j) => (j.id === id ? { ...j, status: "error" as const, error: msg } : j)));
    }
  }
  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    await Promise.all(arr.map(runUpload));
    refresh();
    setTimeout(() => setUploads((u) => u.filter((j) => j.status !== "done")), 1500);
  }
  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files);
    if (fileInput.current) fileInput.current.value = "";
  }
  function onDragEnter(e: DragEvent) { e.preventDefault(); if (tab === "files") setDragOver(true); }
  function onDragOver(e: DragEvent) { e.preventDefault(); if (tab === "files") setDragOver(true); }
  function onDragLeave(e: DragEvent) { e.preventDefault(); if (e.currentTarget === e.target) setDragOver(false); }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (tab !== "files") return;
    const files = e.dataTransfer?.files;
    if (files?.length) handleFiles(files);
  }

  // ---- folder + rename ----
  async function submitNewFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(currentId, name);
      setShowNewFolder(false);
      setNewFolderName("");
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "create folder failed"); }
  }
  function startRename(n: DecryptedNode) { setRenameNodeId(n.id); setRenameValue(n.name); }
  async function submitRename() {
    if (!renameNodeId) return;
    const newName = renameValue.trim();
    if (!newName) return setRenameNodeId(null);
    try { await renameNode(renameNodeId, newName); setRenameNodeId(null); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "rename failed"); }
  }

  // ---- trash actions ----
  async function onTrash(n: DecryptedNode) {
    try { await nodesApi.trash(n.id); refresh(); }
    catch { setError("could not move to trash"); }
  }
  async function onRestore(n: DecryptedNode) {
    try { await nodesApi.restore(n.id); refresh(); }
    catch { setError("restore failed"); }
  }
  async function onPermanentlyDelete(n: DecryptedNode) {
    if (!confirm(`Permanently delete "${n.name}"? This cannot be undone.`)) return;
    try { await nodesApi.deletePermanently(n.id); refresh(); }
    catch { setError("delete failed"); }
  }

  // ---- preview / download ----
  async function onOpenPreview(n: DecryptedNode) {
    setPreviewNode(n); setPreviewUrl(null); setPreviewMime(null);
    try {
      const { url, mime } = await previewBlobUrl(n.id, n.name);
      setPreviewUrl(url); setPreviewMime(mime);
    } catch (e) {
      setError(e instanceof Error ? e.message : "preview failed");
      setPreviewNode(null);
    }
  }
  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewNode(null); setPreviewUrl(null); setPreviewMime(null);
  }
  async function onDownload(n: DecryptedNode) {
    try { await downloadAndSave(n.id, n.name); }
    catch (e) { setError(e instanceof Error ? e.message : "download failed"); }
  }
  async function onLogout() { await logout(); router.replace("/login"); }

  const activeUploads = useMemo(() => uploads.filter((u) => u.status !== "done"), [uploads]);
  const isFilesTab = tab === "files";

  return (
    <main className="container">
      <header className="app-header">
        <div className="app-brand">
          <Lock size={16} className="accent" />
          <span>ArgonVault</span>
        </div>
        <div className="row">
          {email && <span className="muted mono" style={{ fontSize: 12 }}>{email}</span>}
          <button className="ghost" onClick={onLogout}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${isFilesTab ? "active" : ""}`} onClick={() => switchTab("files")}>
          <FolderOpen size={14} /> Files
        </button>
        <button className={`tab ${!isFilesTab ? "active" : ""}`} onClick={() => switchTab("trash")}>
          <Trash2 size={14} /> Trash
        </button>
      </div>

      <div className="toolbar">
        {isFilesTab ? (
          <nav className="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c.id ?? "root"}-${i}`} className="row" style={{ gap: 2 }}>
                {i > 0 && <span className="sep"><ChevronRight size={14} /></span>}
                <span
                  className={`crumb ${i === crumbs.length - 1 ? "current" : ""}`}
                  onClick={() => i !== crumbs.length - 1 && gotoCrumb(i)}
                >
                  {i === 0 ? <Home size={13} /> : null}
                  {c.name}
                </span>
              </span>
            ))}
          </nav>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>
            Items in trash · restore or delete permanently
          </span>
        )}

        {isFilesTab && (
          <div className="row">
            <button className="ghost" onClick={() => setShowNewFolder(true)}>
              <FolderPlus size={14} /> New folder
            </button>
            <button onClick={() => fileInput.current?.click()}>
              <Upload size={14} /> Upload
            </button>
            <input ref={fileInput} type="file" multiple onChange={onPickFile} style={{ display: "none" }} />
          </div>
        )}
      </div>

      {activeUploads.length > 0 && (
        <div className="status-strip">
          {activeUploads.map((u) => (
            <div key={u.id} className="upload-row">
              <span className="row" style={{ gap: 8, overflow: "hidden", flex: 1 }}>
                {u.status === "uploading"
                  ? <Loader2 size={14} className="spin" style={{ color: "var(--accent)" }} />
                  : <X size={14} style={{ color: "var(--danger)" }} />}
                <span className="name mono">{u.name}</span>
              </span>
              <span className={u.status === "error" ? "error" : "muted"} style={{ fontSize: 12 }}>
                {u.status === "uploading" ? "encrypting + uploading…" : u.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="status-strip error-strip">
          <div className="upload-row">
            <span className="error">{error}</span>
            <button className="subtle" onClick={() => setError(null)}>dismiss</button>
          </div>
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
            <span>Loading…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <Inbox size={36} className="icon" />
            <span>
              {isFilesTab
                ? "Empty folder. Drag files here or use the buttons above."
                : "Trash is empty."}
            </span>
          </div>
        ) : (
          <div className="node-grid">
            {items.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                inTrash={!isFilesTab}
                onOpenFolder={() => openFolder(n)}
                onPreview={() => onOpenPreview(n)}
                onDownload={() => onDownload(n)}
                onTrash={() => onTrash(n)}
                onRestore={() => onRestore(n)}
                onPermanentlyDelete={() => onPermanentlyDelete(n)}
                onRename={() => startRename(n)}
              />
            ))}
          </div>
        )}
      </div>

      {/* new folder */}
      {showNewFolder && (
        <div className="modal-backdrop" onClick={() => setShowNewFolder(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New folder</h2>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              autoFocus
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNewFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
            />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => setShowNewFolder(false)}>Cancel</button>
              <button onClick={submitNewFolder} disabled={!newFolderName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* rename */}
      {renameNodeId && (
        <div className="modal-backdrop" onClick={() => setRenameNodeId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Rename</h2>
            <input
              type="text"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenameNodeId(null); }}
            />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => setRenameNodeId(null)}>Cancel</button>
              <button onClick={submitRename} disabled={!renameValue.trim()}>Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* preview */}
      {previewNode && (
        <div className="modal-backdrop" onClick={closePreview}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <span className="name">
                {iconForName(previewNode.name, 16)}
                <span className="mono">{previewNode.name}</span>
              </span>
              <div className="row">
                <button className="ghost" onClick={() => onDownload(previewNode)}>
                  <Download size={14} /> Download
                </button>
                <button className="icon" onClick={closePreview} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="body">
              {!previewUrl ? (
                <span className="muted row" style={{ gap: 8 }}>
                  <Loader2 size={16} className="spin" /> Decrypting…
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
                <span className="muted">No preview for this file type. Download instead.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function NodeCard({
  node, inTrash, onOpenFolder, onPreview, onDownload, onTrash, onRestore, onPermanentlyDelete, onRename,
}: {
  node: DecryptedNode;
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

  function onClick() {
    if (inTrash) return;
    if (isFolder) onOpenFolder();
    else if (previewable) onPreview();
    else onDownload();
  }
  function clickAction(e: MouseEvent, fn: () => void) { e.stopPropagation(); fn(); }

  return (
    <div className={`node ${isFolder ? "folder" : ""}`} onClick={onClick} title={node.name}>
      <div className="node-icon">{iconForName(node.name, 22, isFolder)}</div>
      <div className="node-name">{node.name}</div>
      <div className="node-meta">
        {isFolder ? "folder" : formatBytes(node.size)}
      </div>
      <div className="node-actions">
        {inTrash ? (
          <>
            <button className="icon" onClick={(e) => clickAction(e, onRestore)} title="Restore">
              <RotateCcw size={14} />
            </button>
            <button className="icon danger" onClick={(e) => clickAction(e, onPermanentlyDelete)} title="Delete forever">
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            {!isFolder && (
              <button className="icon" onClick={(e) => clickAction(e, onDownload)} title="Download">
                <Download size={14} />
              </button>
            )}
            <button className="icon" onClick={(e) => clickAction(e, onRename)} title="Rename">
              <Pencil size={14} />
            </button>
            <button className="icon danger" onClick={(e) => clickAction(e, onTrash)} title="Move to trash">
              <Trash2 size={14} />
            </button>
          </>
        )}
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
