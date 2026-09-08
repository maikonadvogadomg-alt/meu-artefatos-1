import type { AppConfig } from "./android";
import type { ArchiveFile } from "./archive";

const DB_NAME = "apk-builder";
const DB_VERSION = 2;
const STORE = "project";
const CHUNK_SIZE = 500; // arquivos por chunk

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteKey(key: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 512;
  const parts: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    let s = "";
    for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
    parts.push(s);
  }
  return btoa(parts.join(""));
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/* ── Public API ─────────────────────────────────────────── */
export interface SavedSession {
  cfg: AppConfig;
  source: string;
  savedAt: number;
  fileCount: number;
}

export type SaveResult = "ok" | "quota-exceeded";

export async function saveSession(cfg: AppConfig, source: string, files: ArchiveFile[]): Promise<SaveResult> {
  // Salva metadados sempre (leve, raramente falha)
  await put("cfg", cfg);
  await put("source", source);
  await put("fileCount", files.length);
  await put("savedAt", Date.now());

  // Limpa chunks antigos
  const oldChunks = await get<number>("chunks") ?? 0;
  for (let i = 0; i < oldChunks; i++) {
    try { await deleteKey(`files_chunk_${i}`); } catch {}
  }
  try { await put("files", null); } catch {}

  // Salva arquivos em chunks (sem limite de quantidade)
  const serialized = files.map(f => ({ path: f.path, b64: toBase64(f.content) }));
  const chunks = Math.ceil(serialized.length / CHUNK_SIZE);

  try {
    for (let i = 0; i < chunks; i++) {
      const slice = serialized.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await put(`files_chunk_${i}`, slice);
    }
    await put("chunks", chunks);
    return "ok";
  } catch {
    // Quota excedida — tenta salvar só metadados
    for (let i = 0; i < chunks; i++) {
      try { await deleteKey(`files_chunk_${i}`); } catch {}
    }
    await put("chunks", 0);
    return "quota-exceeded";
  }
}

export async function loadSession(): Promise<{ cfg: AppConfig; source: string; files: ArchiveFile[] } | null> {
  const cfg = await get<AppConfig>("cfg");
  const source = await get<string>("source");
  if (!cfg || !source) return null;

  const chunks = await get<number>("chunks") ?? 0;
  const allFiles: ArchiveFile[] = [];

  if (chunks > 0) {
    // Novo formato: chunks
    for (let i = 0; i < chunks; i++) {
      const chunk = await get<{ path: string; b64?: string; content?: number[] }[]>(`files_chunk_${i}`);
      if (!chunk) continue;
      for (const f of chunk) {
        allFiles.push({
          path: f.path,
          content: f.b64 ? fromBase64(f.b64) : new Uint8Array(f.content ?? []).buffer,
        });
      }
    }
  } else {
    // Formato legado: array direto
    const rawFiles = await get<{ path: string; b64?: string; content?: number[] }[]>("files");
    if (!rawFiles) return null;
    for (const f of rawFiles) {
      allFiles.push({
        path: f.path,
        content: f.b64 ? fromBase64(f.b64) : new Uint8Array(f.content ?? []).buffer,
      });
    }
  }

  if (allFiles.length === 0) return null;
  return { cfg, source, files: allFiles };
}

export async function getSavedMeta(): Promise<SavedSession | null> {
  const cfg = await get<AppConfig>("cfg");
  const source = await get<string>("source");
  const savedAt = await get<number>("savedAt");
  const fileCount = await get<number>("fileCount");
  if (!cfg || !source) return null;
  return { cfg, source, savedAt: savedAt ?? 0, fileCount: fileCount ?? 0 };
}

export async function clearSession() {
  const chunks = await get<number>("chunks") ?? 0;
  for (let i = 0; i < chunks; i++) {
    try { await deleteKey(`files_chunk_${i}`); } catch {}
  }
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
