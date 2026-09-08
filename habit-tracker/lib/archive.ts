import pako from "pako";
import JSZip from "jszip";

export interface ProjectFile {
  path: string;
  data: string; // base64
}

// ── Conversão binária robusta ─────────────────────────────────────────────────
// Usa chunks para evitar stack overflow em arquivos grandes
function uint8ToBase64(arr: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode(...arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Limpa base64 (remove quebras de linha, espaços) antes do atob
function cleanBase64(b64: string): string {
  return b64.replace(/[\r\n\s]/g, "");
}

function base64ToUint8Array(b64: string): Uint8Array {
  const clean = cleanBase64(b64);
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Parser TAR ────────────────────────────────────────────────────────────────
function readString(buf: Uint8Array, offset: number, len: number): string {
  let s = "";
  for (let i = offset; i < offset + len; i++) {
    if (buf[i] === 0) break;
    s += String.fromCharCode(buf[i]);
  }
  return s;
}

function parseTar(buffer: ArrayBuffer): ProjectFile[] {
  const bytes = new Uint8Array(buffer);
  const files: ProjectFile[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512);
    const name = readString(header, 0, 100).trim();
    const prefix = readString(header, 345, 155).trim();
    const fullName = prefix ? `${prefix}/${name}` : name;
    if (!fullName || fullName === "./" || fullName === ".") { offset += 512; continue; }
    const sizeStr = readString(header, 124, 12).trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const typeFlag = String.fromCharCode(header[156]);
    offset += 512;
    if ((typeFlag === "0" || typeFlag === "\0" || typeFlag === "") && size > 0) {
      const chunk = bytes.slice(offset, offset + size);
      const cleanPath = fullName.replace(/^\.\//, "").replace(/^[^/]+\//, "");
      if (cleanPath) {
        try {
          files.push({ path: cleanPath, data: uint8ToBase64(chunk) });
        } catch {
          // Arquivo binário problemático — armazena vazio
          files.push({ path: cleanPath, data: "" });
        }
      }
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

// ── Extração principal ────────────────────────────────────────────────────────
export async function extractArchive(base64Input: string, fileName: string): Promise<ProjectFile[]> {
  // Limpa o base64 antes de tudo (FileSystem às vezes inclui \n)
  const bytes = base64ToUint8Array(base64Input);
  const buffer = bytes.buffer as ArrayBuffer;
  const name = fileName.toLowerCase();

  // tar.gz / tgz
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) {
    let decompressed: ArrayBuffer;
    try {
      decompressed = pako.ungzip(bytes).buffer as ArrayBuffer;
    } catch {
      decompressed = pako.inflate(bytes).buffer as ArrayBuffer;
    }
    return parseTar(decompressed);
  }

  // tar
  if (name.endsWith(".tar")) return parseTar(buffer);

  // ZIP (padrão) — JSZip lida nativamente com base64
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.entries(zip.files);
  const keys = entries.filter(([, v]) => !v.dir).map(([k]) => k);

  // Detecta prefixo automático (pasta raiz ou dist/www/out — NÃO "build" genérico)
  // Projetos Android têm app/build/ (Gradle), mas isso NÃO é um output web
  const isAndroid = keys.some(k =>
    k.endsWith("build.gradle") || k.endsWith("build.gradle.kts") ||
    k.endsWith("settings.gradle") || k.endsWith("AndroidManifest.xml") ||
    k.endsWith("gradlew") || k.includes("gradle/wrapper/")
  );

  let prefix = "";
  if (!isAndroid) {
    // Só aplica stripping de prefixo para projetos web (não Android)
    const distMatch = keys.find(k => /^[^/]+\/(dist|build|www|out)\//i.test(k));
    if (distMatch) {
      const m = distMatch.match(/^([^/]+\/(dist|build|www|out)\/)/i);
      if (m) prefix = m[1];
    } else {
      const tops = [...new Set(keys.map(k => k.split("/")[0]))];
      if (tops.length === 1) prefix = tops[0] + "/";
    }
  } else {
    // Android: remove apenas o wrapper de pasta única se houver (ex: "meu-projeto/app/...")
    const tops = [...new Set(keys.map(k => k.split("/")[0]))];
    // Só remove prefix se tiver UMA pasta raiz E ela contiver subpastas de Android
    if (tops.length === 1) {
      const singleTop = tops[0] + "/";
      const hasAndroidStructure = keys.some(k => k.startsWith(singleTop) && (
        k.includes("/app/src/") || k.includes("/gradle/")
      ));
      if (hasAndroidStructure) prefix = singleTop;
    }
  }

  const result: ProjectFile[] = [];
  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    const rel = prefix ? path.replace(prefix, "") : path;
    if (!rel) continue;
    try {
      // JSZip .async("base64") é o mais confiável para qualquer tipo de arquivo
      const b64 = await entry.async("base64");
      result.push({ path: rel, data: b64 });
    } catch {
      // Entra como arquivo vazio se falhar (não interrompe a extração)
      result.push({ path: rel, data: "" });
    }
  }
  return result;
}

// ── Detecção de configuração (package.json + Android + Capacitor) ─────────────
export function guessConfig(files: ProjectFile[], fallbackName: string) {
  let name = fallbackName.replace(/\.(zip|tar\.gz|tgz|tar)$/i, "").replace(/[_-]/g, " ");
  let id = "com.meuapp." + fallbackName.replace(/\.(zip|tar\.gz|tgz|tar)$/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

  function decode(f: ProjectFile): string {
    try { return atob(cleanBase64(f.data)); } catch { return ""; }
  }

  // 1. package.json (Node/PWA/React)
  const pkgFile = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (pkgFile?.data) {
    try {
      const pkg = JSON.parse(decode(pkgFile));
      if (pkg.name) { name = pkg.name; id = "com.meuapp." + pkg.name.replace(/[^a-z0-9]/gi, "").toLowerCase(); }
    } catch {}
  }

  // 2. capacitor.config.ts/js — sobrescreve se encontrar appId
  const capFile = files.find(f => /capacitor\.config\.(ts|js|json)$/.test(f.path));
  if (capFile?.data) {
    const txt = decode(capFile);
    const idM = txt.match(/appId\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    const nmM = txt.match(/appName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (idM) id = idM[1];
    if (nmM) name = nmM[1];
  }

  // 3. app.json (Expo)
  const appJson = files.find(f => f.path === "app.json" || f.path.endsWith("/app.json"));
  if (appJson?.data) {
    try {
      const j = JSON.parse(decode(appJson));
      const expo = j.expo ?? j;
      if (expo.name) name = expo.name;
      if (expo.android?.package) id = expo.android.package;
    } catch {}
  }

  // 4. AndroidManifest.xml
  const manifest = files.find(f => f.path.endsWith("AndroidManifest.xml"));
  if (manifest?.data) {
    const txt = decode(manifest);
    const m = txt.match(/package\s*=\s*["']([^"']+)["']/);
    if (m) id = m[1];
    const lm = txt.match(/android:label\s*=\s*["']([^"'@]+)["']/);
    if (lm) name = lm[1];
  }

  // 5. build.gradle / build.gradle.kts
  const gradle = files.find(f => /app[/\\]build\.gradle(\.kts)?$/.test(f.path));
  if (gradle?.data) {
    const txt = decode(gradle);
    const m = txt.match(/applicationId\s+["']([^"']+)["']/);
    if (m) id = m[1];
  }

  // 6. settings.gradle / settings.gradle.kts
  const settings = files.find(f => /settings\.gradle(\.kts)?$/.test(f.path));
  if (settings?.data) {
    const txt = decode(settings);
    const m = txt.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
    if (m && !name) name = m[1];
  }

  return { name: name || fallbackName, id };
}

// ── Utilitário: decodifica base64 para texto (para visualizador) ──────────────
export function decodeFileToText(b64: string): string {
  if (!b64) return "(arquivo vazio)";
  try {
    const clean = cleanBase64(b64);
    // Detecta se é binário verificando bytes não-texto
    const raw = atob(clean);
    // Checa se há muitos bytes não-printáveis (arquivo binário)
    let nonPrint = 0;
    const checkLen = Math.min(raw.length, 512);
    for (let i = 0; i < checkLen; i++) {
      const c = raw.charCodeAt(i);
      if (c < 9 || (c > 13 && c < 32) || c === 127) nonPrint++;
    }
    if (nonPrint / checkLen > 0.1) return "[Arquivo binário — não pode ser visualizado como texto]";
    // Decodifica UTF-8 corretamente
    try {
      const bytes2 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes2[i] = raw.charCodeAt(i);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes2);
    } catch {
      return raw;
    }
  } catch {
    return "(erro ao decodificar arquivo)";
  }
}
