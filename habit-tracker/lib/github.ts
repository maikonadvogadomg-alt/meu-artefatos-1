import JSZip from "jszip";
import { Platform } from "react-native";
import type { ProjectFile } from "./archive";

const GH = "https://api.github.com";

function hdrs(token: string): Record<string, string> {
  const base: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) base["Authorization"] = `token ${token}`;
  return base;
}

/* ── Proxy server-side (resolve CORS no web/Expo preview) ── */
function proxyBase(): string {
  if (Platform.OS === "web") {
    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
    return domain ? `https://${domain}/api` : "/api";
  }
  // Nativo (APK/iOS): usa diretamente a URL do servidor publicado
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  return domain ? `https://${domain}/api` : "https://api.github.com"; // fallback seguro
}

function proxyZipUrl(owner: string, repo: string, branch: string, token?: string): string {
  const base = proxyBase();
  const p = new URLSearchParams({ owner, repo, branch });
  if (token) p.set("token", token);
  return `${base}/gh-proxy/zipball?${p}`;
}

function proxyRepoUrl(owner: string, repo: string, token?: string): string {
  const base = proxyBase();
  const p = new URLSearchParams({ owner, repo });
  if (token) p.set("token", token);
  return `${base}/gh-proxy/repo?${p}`;
}

/* ── Usa proxy no web, GitHub direto no nativo ──────────── */
async function fetchZip(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  onProgress: (m: string) => void
): Promise<Response> {
  if (Platform.OS !== "web") {
    // Nativo: sem CORS, busca direto
    onProgress(`Baixando ${owner}/${repo}...`);
    let r = await fetch(`${GH}/repos/${owner}/${repo}/zipball/${branch}`, {
      headers: hdrs(token),
    });
    if (!r.ok && branch === "main") {
      r = await fetch(`${GH}/repos/${owner}/${repo}/zipball/master`, {
        headers: hdrs(token),
      });
    }
    if (!r.ok) throw new Error(`Erro ao baixar repositório: ${r.status}`);
    return r;
  }

  // Web (Expo preview / browser): usa proxy para evitar CORS
  onProgress(`Baixando ${owner}/${repo} via proxy...`);
  const r = await fetch(proxyZipUrl(owner, repo, branch, token || undefined));
  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err.error || `Erro ao baixar repositório: ${r.status}`);
  }
  return r;
}

async function fetchRepoInfo(
  owner: string,
  repo: string,
  token: string
): Promise<GhRepo> {
  if (Platform.OS !== "web") {
    const r = await fetch(`${GH}/repos/${owner}/${repo}`, { headers: hdrs(token) });
    if (!r.ok) throw new Error(`Repo não encontrado: ${r.status}`);
    return r.json();
  }
  const r = await fetch(proxyRepoUrl(owner, repo, token || undefined));
  if (!r.ok) throw new Error(`Repo não encontrado: ${r.status}`);
  return r.json();
}

/* ── Tipos ───────────────────────────────────────────────── */
export interface GhUser { login: string; name: string; avatar_url: string; }
export interface GhRepo {
  full_name: string; name: string; description: string;
  default_branch: string; private: boolean; html_url: string;
  language?: string; stargazers_count?: number; size?: number;
}

/* ── Auth ────────────────────────────────────────────────── */
export async function ghGetUser(token: string): Promise<GhUser> {
  const r = await fetch(`${GH}/user`, { headers: hdrs(token) });
  if (!r.ok) throw new Error(`Token inválido: ${r.status}`);
  return r.json();
}

export async function ghListRepos(token: string): Promise<GhRepo[]> {
  const r = await fetch(`${GH}/user/repos?per_page=100&sort=updated`, { headers: hdrs(token) });
  if (!r.ok) throw new Error(`Erro ao listar repos: ${r.status}`);
  return r.json();
}

export async function ghGetRepo(token: string, owner: string, repo: string): Promise<GhRepo> {
  return fetchRepoInfo(owner, repo, token);
}

/* ── Extrai ZIP — SEM LIMITE, todos os arquivos ─────────── */
async function _extractZip(zipRes: Response, onProgress: (m: string) => void): Promise<ProjectFile[]> {
  onProgress("Lendo ZIP...");
  const buf = await zipRes.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const entries = Object.entries(zip.files);
  const allFiles = entries.filter(([, v]) => !v.dir).map(([k]) => k);
  const tops = [...new Set(allFiles.map(k => k.split("/")[0]))];
  const prefix = tops.length === 1 ? tops[0] + "/" : "";

  const files: ProjectFile[] = [];
  let processed = 0;
  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    const rel = prefix ? path.slice(prefix.length) : path;
    if (!rel) continue;
    try {
      const b64 = await entry.async("base64");
      files.push({ path: rel, data: b64 });
    } catch { /* ignora arquivo corrompido */ }
    processed++;
    if (processed % 500 === 0) onProgress(`Extraindo... ${files.length} arquivos`);
  }

  if (files.length === 0) throw new Error("ZIP não contém arquivos.");
  onProgress(`✅ ${files.length} arquivos importados`);
  return files;
}

/* ── Import com token (público ou privado) ───────────────── */
export async function ghImportRepo(
  token: string, owner: string, repo: string, branch: string,
  onProgress: (msg: string) => void
): Promise<ProjectFile[]> {
  onProgress("Verificando repositório...");
  let defaultBranch = branch;
  try {
    const info = await fetchRepoInfo(owner, repo, token);
    defaultBranch = branch || info.default_branch || "main";
  } catch { /* ignora, tenta com branch fornecido */ }

  const zipRes = await fetchZip(owner, repo, defaultBranch, token, onProgress);
  return _extractZip(zipRes, onProgress);
}

/* ── Import repo público SEM token ─────────────────────── */
export async function ghImportPublicRepo(
  repoInput: string,
  onProgress: (msg: string) => void
): Promise<{ files: ProjectFile[]; repoName: string; branch: string }> {
  const clean = repoInput.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Formato inválido. Use: usuario/repositorio ou https://github.com/usuario/repositorio");

  const owner = parts[0];
  const repoName = parts[1];

  onProgress(`Verificando ${owner}/${repoName}...`);
  const info = await fetchRepoInfo(owner, repoName, "");
  if (info.private) throw new Error(`Repositório privado. Use seu token GitHub para importar.`);

  const branch = info.default_branch || "main";
  const zipRes = await fetchZip(owner, repoName, branch, "", onProgress);
  const files = await _extractZip(zipRes, onProgress);
  return { files, repoName: info.name, branch };
}

/* ── Push / Export ───────────────────────────────────────── */
export async function ghCreateRepo(token: string, name: string, desc: string, isPrivate: boolean) {
  const r = await fetch(`${GH}/user/repos`, {
    method: "POST",
    headers: { ...hdrs(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: desc, private: isPrivate, auto_init: true }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as Record<string, string>).message || `Erro ao criar: ${r.status}`);
  }
  return r.json() as Promise<{ html_url: string; full_name: string }>;
}

export async function ghPushFiles(
  token: string, owner: string, repo: string, files: ProjectFile[],
  message: string, onProgress: (msg: string) => void
) {
  const refRes = await fetch(`${GH}/repos/${owner}/${repo}/git/refs/heads/main`, { headers: hdrs(token) });
  const baseSha = refRes.ok ? (await refRes.json()).object?.sha : undefined;

  const blobs: { path: string; sha: string }[] = [];
  let done = 0;
  for (const f of files) {
    try {
      const r = await fetch(`${GH}/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        headers: { ...hdrs(token), "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.data, encoding: "base64" }),
      });
      if (r.ok) blobs.push({ path: f.path, sha: (await r.json()).sha });
    } catch { /* skip */ }
    done++;
    if (done % 10 === 0) onProgress(`Enviando ${done}/${files.length}...`);
  }

  const treeRes = await fetch(`${GH}/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers: { ...hdrs(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseSha,
      tree: blobs.map(b => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new Error(`Tree: ${treeRes.status}`);
  const treeData = await treeRes.json();

  const commitRes = await fetch(`${GH}/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    headers: { ...hdrs(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: treeData.sha, ...(baseSha ? { parents: [baseSha] } : {}) }),
  });
  if (!commitRes.ok) throw new Error(`Commit: ${commitRes.status}`);
  const commit = await commitRes.json();

  const patchRes = await fetch(`${GH}/repos/${owner}/${repo}/git/refs/heads/main`, {
    method: "PATCH",
    headers: { ...hdrs(token), "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
  if (!patchRes.ok) {
    await fetch(`${GH}/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: { ...hdrs(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "refs/heads/main", sha: commit.sha }),
    });
  }
  onProgress("✅ Push concluído!");
}
