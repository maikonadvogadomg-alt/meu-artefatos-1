import pako from "pako";

export interface ArchiveFile {
  path: string;
  content: ArrayBuffer;
}

/* ── Binary detection ────────────────────────────────────── */
export function isBinary(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf.byteLength > 8000 ? buf.slice(0, 8000) : buf);
  let nulls = 0;
  let high = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) nulls++;
    if (bytes[i] > 127) high++;
  }
  if (nulls > 0) return true;
  return bytes.length > 0 && high / bytes.length > 0.30;
}

export function getEncoding(buf: ArrayBuffer, charset?: string): string {
  if (!charset || charset === "utf-8") return "utf-8";
  return charset;
}

export function decodeText(buf: ArrayBuffer, charset?: string): string {
  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(buf);
  } catch {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(buf); } catch { return ""; }
  }
}

/* ── TAR parser ─────────────────────────────────────────── */
function readString(buf: Uint8Array, offset: number, len: number): string {
  let s = "";
  for (let i = offset; i < offset + len; i++) {
    if (buf[i] === 0) break;
    s += String.fromCharCode(buf[i]);
  }
  return s;
}

export function parseTar(buffer: ArrayBuffer): ArchiveFile[] {
  const bytes = new Uint8Array(buffer);
  const files: ArchiveFile[] = [];
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512);
    const name = readString(header, 0, 100).trim();
    const prefix = readString(header, 345, 155).trim();
    const fullName = prefix ? prefix + "/" + name : name;
    if (!fullName || fullName === "./" || fullName === ".") { offset += 512; continue; }

    const sizeStr = readString(header, 124, 12).trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const typeFlag = String.fromCharCode(header[156]);
    offset += 512;

    if ((typeFlag === "0" || typeFlag === "\0" || typeFlag === "") && size > 0) {
      const content = buffer.slice(offset, offset + size);
      const cleanPath = fullName.replace(/^\.\//, "").replace(/^[^/]+\//, "");
      if (cleanPath) files.push({ path: cleanPath, content });
    }

    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

const SKIP = /(?:^|\/)(node_modules|\.git|\.svn|\.hg|__pycache__|\.DS_Store)(?:\/|$)/i;

/* ── Detect & extract any archive ──────────────────────── */
export interface ExtractResult {
  files: ArchiveFile[];
  skipped: number;
  failed: string[];
}

export async function extractArchive(
  file: File,
  options?: { skipNodeModules?: boolean }
): Promise<ExtractResult> {
  const skipNodeModules = options?.skipNodeModules === true; // default: NÃO filtrar
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (e) {
    const code = e instanceof DOMException ? ` (código ${e.code})` : "";
    throw new Error(`Falha ao ler o arquivo${code}. Se o arquivo for muito grande, pode haver limitação de memória do navegador — tente fechar outras abas.`);
  }
  const name = file.name.toLowerCase();

  // TAR.GZ / TGZ
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) {
    const decompressed = pako.ungzip(new Uint8Array(buffer)).buffer;
    const all = parseTar(decompressed);
    const skipped = skipNodeModules ? all.filter(f => SKIP.test(f.path)).length : 0;
    const files = skipNodeModules ? all.filter(f => !SKIP.test(f.path)) : all;
    return { files, skipped, failed: [] };
  }

  // TAR.BZ2 — not supported natively, graceful error
  if (name.endsWith(".tar.bz2") || name.endsWith(".tbz2")) {
    throw new Error("Formato .tar.bz2 não suportado diretamente. Converta para .zip ou .tar.gz e reimporte.");
  }

  // RAR — tenta como arquivo único se não conseguir extrair
  // Plain TAR
  if (name.endsWith(".tar")) {
    const all = parseTar(buffer);
    const skipped = skipNodeModules ? all.filter(f => SKIP.test(f.path)).length : 0;
    const files = skipNodeModules ? all.filter(f => !SKIP.test(f.path)) : all;
    return { files, skipped, failed: [] };
  }

  // ZIP (default) — se falhar, inclui o arquivo como asset único sem restrição
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip> | null = null;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    // Tenta decodificação Latin-1 / CP437 para ZIPs legados com nomes não-UTF8
    try {
      zip = await JSZip.loadAsync(buffer, {
        decodeFileName: (bytes: Uint8Array) =>
          Array.from(bytes).map(b => String.fromCharCode(b)).join(""),
      });
    } catch {
      // Não é um ZIP — inclui como arquivo único (exe, dll, dmg, etc.)
      return { files: [{ path: file.name, content: buffer }], skipped: 0, failed: [] };
    }
  }
  const entries = Object.entries(zip!.files);

  const keys = entries.filter(([, v]) => !v.dir).map(([k]) => k);

  // Remove apenas o prefixo raiz único que o GitHub/ZIP adiciona (ex: "repo-main/")
  const tops = [...new Set(keys.map(k => k.split("/")[0]))];
  const prefix = tops.length === 1 ? tops[0] + "/" : "";

  const result: ArchiveFile[] = [];
  let skipped = 0;
  const failed: string[] = [];
  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    if (skipNodeModules && SKIP.test(path)) { skipped++; continue; }
    const rel = prefix ? path.slice(prefix.length) : path;
    if (!rel) continue;
    try {
      const content = await entry.async("arraybuffer");
      result.push({ path: rel, content });
    } catch {
      failed.push(rel || path);
    }
  }
  return { files: result, skipped, failed };
}

/* ── Guess config (package.json + Android + Capacitor + Expo) ── */
export function guessConfig(files: ArchiveFile[], fallbackName: string) {
  let name = fallbackName.replace(/\.(zip|tar\.gz|tgz|tar)$/i, "").replace(/[_-]/g, " ");
  let id = "com.meuapp." + fallbackName.replace(/\.(zip|tar\.gz|tgz|tar)$/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

  function decode(f: ArchiveFile): string {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(f.content); } catch { return ""; }
  }

  // 1. package.json
  const pkgFile = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (pkgFile) {
    try {
      const pkg = JSON.parse(decode(pkgFile));
      if (pkg.name) { name = pkg.name; id = "com.meuapp." + pkg.name.replace(/[^a-z0-9]/gi, "").toLowerCase(); }
    } catch {}
  }

  // 2. capacitor.config.ts/js/json
  const capFile = files.find(f => /capacitor\.config\.(ts|js|json)$/.test(f.path));
  if (capFile) {
    const txt = decode(capFile);
    const idM = txt.match(/appId\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    const nmM = txt.match(/appName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (idM) id = idM[1];
    if (nmM) name = nmM[1];
  }

  // 3. app.json (Expo)
  const appJson = files.find(f => f.path === "app.json" || f.path.endsWith("/app.json"));
  if (appJson) {
    try {
      const j = JSON.parse(decode(appJson));
      const expo = j.expo ?? j;
      if (expo.name) name = expo.name;
      if (expo.android?.package) id = expo.android.package;
    } catch {}
  }

  // 4. AndroidManifest.xml
  const manifest = files.find(f => f.path.endsWith("AndroidManifest.xml"));
  if (manifest) {
    const txt = decode(manifest);
    const m = txt.match(/package\s*=\s*["']([^"']+)["']/);
    if (m) id = m[1];
    const lm = txt.match(/android:label\s*=\s*["']([^"'@]+)["']/);
    if (lm) name = lm[1];
  }

  // 5. app/build.gradle
  const gradle = files.find(f => /app[/\\]build\.gradle(\.kts)?$/.test(f.path));
  if (gradle) {
    const txt = decode(gradle);
    const m = txt.match(/applicationId\s+["']([^"']+)["']/);
    if (m) id = m[1];
  }

  // 6. settings.gradle
  const settings = files.find(f => /settings\.gradle(\.kts)?$/.test(f.path));
  if (settings) {
    const txt = decode(settings);
    const m = txt.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
    if (m && !name) name = m[1];
  }

  return { name: name || fallbackName, id };
}

/* ── File tree builder ──────────────────────────────────── */
export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
  binary?: boolean;
  size?: number;
}

export function buildFileTree(files: ArchiveFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };

  for (const f of files) {
    const parts = f.path.replace(/^\//, "").split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const isLast = i === parts.length - 1;
      if (isLast) {
        node.children!.push({
          name: part,
          path: f.path,
          type: "file",
          binary: isBinary(f.content),
          size: f.content.byteLength,
        });
      } else {
        let dir = node.children!.find(c => c.type === "dir" && c.name === part);
        if (!dir) {
          dir = { name: part, path: parts.slice(0, i + 1).join("/"), type: "dir", children: [] };
          node.children!.push(dir);
        }
        node = dir;
      }
    }
  }

  // Sort: dirs first, then files, both alphabetical
  function sortNode(n: TreeNode) {
    if (!n.children) return;
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNode);
  }
  sortNode(root);
  return root.children!;
}
