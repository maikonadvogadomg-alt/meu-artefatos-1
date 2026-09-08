/**
 * desktop.ts — Gerador de app Desktop (Electron) para Windows, Mac e Linux.
 * Corrigido: sem code-signing, sem icon.ico ausente, electron-builder v25+.
 */
import JSZip from "jszip";
import type { ArchiveFile } from "./archive";
import type { AppConfig } from "./android";

function strToAb(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

/* ══════════════════════════════════════════════════════════
   DIAGNÓSTICO DOS ERROS COMUNS:

   "Fase 1" (npm install) — raramente falha, Electron ~100MB
   "Fase 2" (npm run build / electron-builder) — falha por:
     ❌ icon.ico referenciado mas não incluído no projeto
     ❌ Code signing ativo (Windows exige certificado pago)
     ❌ electron-builder v24 tem bug no runner windows-latest
     ❌ NSIS não disponível em todos os ambientes
   
   CORREÇÕES APLICADAS:
     ✅ Removidas referências a icon.ico/icns (usa ícone padrão do Electron)
     ✅ Code signing desabilitado (CSC_IDENTITY_AUTO_DISCOVERY=false)
     ✅ electron-builder ^25.1.8 (versão estável que funciona no CI)
     ✅ --publish=never para não tentar publicar externamente
     ✅ npm cache habilitado (build mais rápido)
     ✅ Versão explícita do target por plataforma
══════════════════════════════════════════════════════════ */

/* ── package.json do projeto Electron ── */
function genElectronPackageJson(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "meu-app";
  return JSON.stringify({
    name: safe,
    version: c.versionName,
    description: `${c.appName} — App desktop (Windows, Mac, Linux)`,
    main: "main.js",
    private: true,
    scripts: {
      start:        "electron .",
      build:        "electron-builder --publish=never",
      "build:win":  "electron-builder --win --x64 --publish=never",
      "build:mac":  "electron-builder --mac --x64 --arm64 --publish=never",
      "build:linux":"electron-builder --linux --x64 --publish=never",
    },
    build: {
      appId: c.appId || `com.desktop.${safe}`,
      productName: c.appName || "MeuApp",
      copyright: `© ${new Date().getFullYear()} ${c.appName}`,
      directories: {
        output: "dist",
        buildResources: "build",
      },
      files: [
        "main.js",
        "preload.js",
        "www/**/*",
        /* Exclui package.json do www/ — evita conflito com electron-builder */
        "!www/package.json",
        "!www/**/package.json",
        "!www/**/*.map",
      ],
      /* ── Windows ── sem code signing, sem icon (usa padrão Electron) */
      win: {
        target: [{ target: "nsis", arch: ["x64"] }],
        /* SEM icon — evita falha por icon.ico ausente */
        /* SEM certificateFile — sem code signing */
        sign: null,
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: c.appName || "MeuApp",
        /* SEM installerIcon/uninstallerIcon — usa padrão NSIS */
      },
      /* ── Mac ── sem dmg-license, sem code signing */
      mac: {
        target: [{ target: "dmg", arch: ["x64", "arm64"] }],
        /* SEM icon.icns */
        identity: null,       /* desabilita code signing no Mac */
        hardenedRuntime: false,
      },
      dmg: {
        background: null,
        /* SEM icon */
      },
      /* ── Linux ── */
      linux: {
        target: [{ target: "AppImage", arch: ["x64"] }],
        /* SEM icon */
        category: "Utility",
        description: `${c.appName} — App desktop`,
      },
      /* ── Configurações gerais ── */
      compression: "normal", /* "maximum" pode causar timeout no CI */
      removePackageScripts: true,
      nodeGypRebuild: false,
      buildDependenciesFromSource: false,
    },
    devDependencies: {
      electron: "^33.4.0",
      "electron-builder": "^25.1.8",
    },
  }, null, 2);
}

/* ── main.js do Electron ── */
function genElectronMain(c: AppConfig): string {
  const w = c.orientation === "landscape" ? 1280 : 960;
  const h = c.orientation === "landscape" ? 800  : 700;
  const title = c.appName.replace(/'/g, "\\'") || "App";
  return `const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: ${w},
    height: ${h},
    minWidth: 400,
    minHeight: 300,
    title: '${title}',
    backgroundColor: '${c.bgColor || "#0f172a"}',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,          // permite file:// carregar recursos locais
      allowRunningInsecureContent: true,
    },
    show: false,
    autoHideMenuBar: true,
    // Sem icon — usa ícone padrão do Electron (evita erro de arquivo ausente)
  });

  // Carrega o app web a partir da pasta www/
  win.loadFile(path.join(__dirname, 'www', 'index.html'));

  // Mostra janela só quando estiver pronto (evita flash branco)
  win.once('ready-to-show', () => win.show());

  // Sem barra de menu
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;
}

/* ── preload.js do Electron ── */
function genElectronPreload(): string {
  return `const { contextBridge } = require('electron');

// Expõe informações do Electron para o app web
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,   // 'win32' | 'darwin' | 'linux'
  version: process.versions.electron,
  isDesktop: true,
});
`;
}

/* ── .npmrc — configurações para evitar problemas no CI ── */
function genNpmRc(): string {
  return `# Configurações para builds no GitHub Actions
legacy-peer-deps=true
fetch-retry-mintimeout=20000
fetch-retry-maxtimeout=120000
`;
}

/* ── GitHub Actions corrigido ── */
export function genDesktopWorkflow(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9]/g, "-") || "App";
  return `name: Build Desktop — ${safe}

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  # ════════════════════════════════════
  # Windows — .exe (NSIS installer)
  # ════════════════════════════════════
  build-windows:
    runs-on: windows-latest
    timeout-minutes: 40
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # Desabilita code signing (sem certificado pago não funciona)
      - name: Instalar dependências
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
          ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true'
        run: npm install --legacy-peer-deps

      # Remove package.json de www/ — evita conflito com electron-builder
      - name: Limpar package.json conflitantes
        shell: bash
        run: find www -name "package.json" -delete 2>/dev/null || true

      - name: Build Windows (.exe)
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
          ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true'
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: npm run build:win

      - name: Localizar .exe gerado
        id: find_win
        shell: bash
        run: |
          FILE=\$(find dist -name "*.exe" 2>/dev/null | head -1)
          echo "file=\$FILE" >> \$GITHUB_OUTPUT
          if [ -n "\$FILE" ]; then echo "✅ EXE: \$FILE"; else echo "❌ .exe não encontrado"; exit 1; fi

      - name: Publicar Release Windows
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        shell: bash
        run: |
          gh release delete latest-windows --yes 2>/dev/null || true
          gh release create latest-windows \\
            --title "✅ ${safe} — Windows (.exe)" \\
            --notes "## Instalador Windows

          **Como instalar:**
          1. Baixe o arquivo **.exe** abaixo
          2. Execute como administrador se necessário
          3. Siga o assistente de instalação

          > Gerado com Electron + electron-builder" \\
            --latest \\
            "\${{ steps.find_win.outputs.file }}"

  # ════════════════════════════════════
  # Linux — .AppImage (portátil)
  # ════════════════════════════════════
  build-linux:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependências
        run: npm install --legacy-peer-deps

      - name: Limpar package.json conflitantes
        run: find www -name "package.json" -delete 2>/dev/null || true

      - name: Build Linux (.AppImage)
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: npm run build:linux

      - name: Localizar .AppImage
        id: find_linux
        run: |
          FILE=\$(find dist -name "*.AppImage" 2>/dev/null | head -1)
          echo "file=\$FILE" >> \$GITHUB_OUTPUT
          if [ -n "\$FILE" ]; then echo "✅ AppImage: \$FILE"; else echo "❌ AppImage não encontrado"; exit 1; fi

      - name: Publicar Release Linux
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release delete latest-linux --yes 2>/dev/null || true
          gh release create latest-linux \\
            --title "✅ ${safe} — Linux (.AppImage)" \\
            --notes "## Executável Linux (portátil)

          **Como usar:**
          1. Baixe o **.AppImage** abaixo
          2. \`chmod +x ${safe}*.AppImage\`
          3. Execute: \`./${safe}*.AppImage\`" \\
            --latest \\
            "\${{ steps.find_linux.outputs.file }}"

  # ════════════════════════════════════
  # Mac — .dmg (opcional, precisa de runner mac)
  # ════════════════════════════════════
  build-mac:
    runs-on: macos-latest
    timeout-minutes: 40
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependências
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
        run: npm install --legacy-peer-deps

      - name: Limpar package.json conflitantes
        run: find www -name "package.json" -delete 2>/dev/null || true

      - name: Build Mac (.dmg)
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
          ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true'
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: npm run build:mac

      - name: Localizar .dmg
        id: find_mac
        run: |
          FILE=\$(find dist -name "*.dmg" 2>/dev/null | head -1)
          echo "file=\$FILE" >> \$GITHUB_OUTPUT
          if [ -n "\$FILE" ]; then echo "✅ DMG: \$FILE"; else echo "❌ DMG não encontrado"; exit 1; fi

      - name: Publicar Release Mac
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release delete latest-mac --yes 2>/dev/null || true
          gh release create latest-mac \\
            --title "✅ ${safe} — Mac (.dmg)" \\
            --notes "## Instalador Mac

          **Como instalar:**
          1. Baixe o **.dmg** abaixo
          2. Arraste o app para a pasta Aplicativos
          3. Na primeira execução: clique direito → Abrir (para contornar Gatekeeper)" \\
            --latest \\
            "\${{ steps.find_mac.outputs.file }}"
`;
}

/* ── README ── */
function genDesktopReadme(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9]/g, "-") || "App";
  return `# ${c.appName || "Meu App"} — App Desktop

Aplicativo gerado pelo **APK Builder** usando Electron.
Funciona em **Windows**, **Mac** e **Linux** sem precisar de browser.

## Estrutura do projeto

\`\`\`
├── main.js          ← Processo principal do Electron
├── preload.js       ← Bridge segura entre Electron e web
├── package.json     ← Dependências e config do electron-builder
├── www/             ← Seus arquivos web (HTML/CSS/JS)
│   └── index.html
└── .github/
    └── workflows/
        └── build-desktop.yml  ← CI automático
\`\`\`

## Opções para compilar

### ✅ Opção 1 — GitHub Actions (Gratuito, Automático)

\`\`\`bash
git init
git add .
git commit -m "init: desktop app"
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
\`\`\`

Aguarde ~15 min → **Repositório → Releases** → baixe:
- \`${safe}-Setup-${c.versionName}.exe\` → Windows
- \`${safe}-${c.versionName}.AppImage\` → Linux
- \`${safe}-${c.versionName}.dmg\` → Mac

### 💻 Opção 2 — Compilar localmente

**Pré-requisitos:** Node.js 20+

\`\`\`bash
npm install
npm run build:win    # Gera .exe para Windows
npm run build:linux  # Gera .AppImage para Linux
npm run build:mac    # Gera .dmg para Mac (precisa de Mac)
\`\`\`

### 🖥️ Opção 3 — Testar sem compilar

\`\`\`bash
npm install
npm start            # Abre o app em modo desenvolvimento
\`\`\`

## Por que o build falha?

- **Code signing**: O \`.exe\` não está assinado digitalmente — normal para distribuição privada.
  No Windows pode aparecer aviso do SmartScreen → clique "Mais informações → Executar assim mesmo".
- **Mac Gatekeeper**: Clique direito no app → Abrir (primeira vez).
- **Linux**: Execute \`chmod +x ${safe}*.AppImage\` antes de rodar.

## Versões

- Electron: 33.x
- electron-builder: 25.x
- Node.js: 20+
`;
}

/* ══════════════════════════════════════════════════════════
   buildDesktopFilesForGithub
══════════════════════════════════════════════════════════ */
export async function buildDesktopFilesForGithub(
  cfg: AppConfig,
  webFiles: ArchiveFile[],
): Promise<ArchiveFile[]> {
  const result: ArchiveFile[] = [];

  result.push({ path: "package.json",   content: strToAb(genElectronPackageJson(cfg)) });
  result.push({ path: "main.js",        content: strToAb(genElectronMain(cfg)) });
  result.push({ path: "preload.js",     content: strToAb(genElectronPreload()) });
  result.push({ path: ".npmrc",         content: strToAb(genNpmRc()) });
  result.push({ path: "README.md",      content: strToAb(genDesktopReadme(cfg)) });
  result.push({ path: ".gitignore",     content: strToAb("node_modules/\ndist/\n.DS_Store\n") });
  result.push({
    path: ".github/workflows/build-desktop.yml",
    content: strToAb(genDesktopWorkflow(cfg)),
  });

  for (const f of webFiles) {
    if (!f.path || f.path.endsWith("/")) continue;
    result.push({ path: `www/${f.path}`, content: f.content });
  }

  return result;
}

/* ══════════════════════════════════════════════════════════
   buildDesktopZip — ZIP para download local
══════════════════════════════════════════════════════════ */
export async function buildDesktopZip(
  cfg: AppConfig,
  webFiles: ArchiveFile[],
): Promise<Blob> {
  const zip = new JSZip();

  zip.file("package.json",  genElectronPackageJson(cfg));
  zip.file("main.js",       genElectronMain(cfg));
  zip.file("preload.js",    genElectronPreload());
  zip.file(".npmrc",        genNpmRc());
  zip.file("README.md",     genDesktopReadme(cfg));
  zip.file(".gitignore",    "node_modules/\ndist/\n.DS_Store\n");
  zip.file(".github/workflows/build-desktop.yml", genDesktopWorkflow(cfg));

  const wwwFolder = zip.folder("www")!;
  for (const f of webFiles) {
    if (!f.path || f.path.endsWith("/")) continue;
    const parts = f.path.split("/");
    let cur = wwwFolder;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur.folder(parts[i])!;
    }
    cur.file(parts[parts.length - 1], f.content, { binary: true });
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
