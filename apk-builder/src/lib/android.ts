import JSZip from "jszip";
import type { ArchiveFile } from "./archive";

/* ══════════════════════════════════════════════════════════
   Detecta automaticamente onde está o index.html e normaliza
   todos os caminhos para a raiz — corrige o problema de
   projetos com dist/, build/, www/, out/, public/ etc.
══════════════════════════════════════════════════════════ */
export function detectWebRoot(files: ArchiveFile[]): string {
  const paths = files.map(f => f.path.replace(/^\/+/, "").toLowerCase());
  if (paths.some(p => p === "index.html")) return "";
  for (const dir of ["dist", "www", "public", "build", "out", "html", "app", "static"]) {
    if (paths.some(p => p === `${dir}/index.html`)) return `${dir}/`;
  }
  const found = files.map(f => f.path.replace(/^\/+/, "")).find(p => p.toLowerCase().endsWith("/index.html"));
  if (found) {
    const lastSlash = found.lastIndexOf("/");
    return lastSlash >= 0 ? found.slice(0, lastSlash + 1) : "";
  }
  return "";
}

export function normalizeWebFiles(files: ArchiveFile[]): ArchiveFile[] {
  const root = detectWebRoot(files);
  if (!root) return files.map(f => ({ ...f, path: f.path.replace(/^\/+/, "") }));
  const result: ArchiveFile[] = [];
  for (const f of files) {
    const p = f.path.replace(/^\/+/, "");
    if (p.startsWith(root)) {
      result.push({ ...f, path: p.slice(root.length) });
    }
  }
  return result;
}

export interface AppConfig {
  appName: string;
  appId: string;
  versionName: string;
  versionCode: number;
  themeColor: string;
  bgColor: string;
  orientation: "portrait" | "landscape" | "any";
  minSdk: number;
}

export const DEFAULT_CFG: AppConfig = {
  appName: "", appId: "", versionName: "1.0.0", versionCode: 1,
  themeColor: "#6366f1", bgColor: "#0f172a", orientation: "portrait", minSdk: 21,
};

export function genCapacitorConfig(c: AppConfig) {
  return `/* Não usado — projeto Android puro (sem Capacitor) */\n// appId: '${c.appId}'\n// appName: '${c.appName}'\n`;
}

/* ══════════════════════════════════════════════════════════
   VERSÕES — atualizar aqui centraliza tudo
══════════════════════════════════════════════════════════ */
const AGP_VERSION    = "8.7.3";
const GRADLE_VERSION = "8.11.1";
const COMPILE_SDK    = 35;
const TARGET_SDK     = 35;
const BUILD_TOOLS    = "35.0.0";

/* ══════════════════════════════════════════════════════════
   ANDROID PURO — WebView nativo, sem Capacitor, sem npm
══════════════════════════════════════════════════════════ */

export function genRootGradle(): string {
  return `plugins {
    id 'com.android.application' version '${AGP_VERSION}' apply false
}\n`;
}

export function genSettingsGradle(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9]/g, "");
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = '${safe || "MeuApp"}'
include ':app'\n`;
}

export function genGradleWrapperProperties(): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists\n`;
}

export function genGradlewScript(): string {
  return `#!/usr/bin/env sh
##############################################################################
# Gradle Wrapper — gerado pelo APK Builder (Android Puro)
##############################################################################
set -e
APP_HOME="$(cd "$(dirname "$0")" && pwd)"
CLASSPATH="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
if [ -n "$JAVA_HOME" ]; then
    JAVACMD="$JAVA_HOME/bin/java"
else
    JAVACMD="java"
fi
exec "$JAVACMD" -classpath "$CLASSPATH" \\
    -Xmx64m -Xms64m \\
    org.gradle.wrapper.GradleWrapperMain "$@"\n`;
}

export function genAppGradle(c: AppConfig): string {
  return `plugins {
    id 'com.android.application'
}

android {
    namespace '${c.appId}'
    compileSdk ${COMPILE_SDK}

    defaultConfig {
        applicationId '${c.appId}'
        minSdk ${c.minSdk}
        targetSdk ${TARGET_SDK}
        versionCode ${c.versionCode}
        versionName '${c.versionName}'
    }

    buildTypes {
        debug {
            debuggable true
        }
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    packagingOptions {
        resources { excludes += ['META-INF/**'] }
    }
}

// Android puro — sem Capacitor, sem npm, sem Node.js
dependencies {
    implementation 'androidx.appcompat:appcompat:1.7.0'
}\n`;
}

export function genManifest(c: AppConfig): string {
  const screen = c.orientation === "portrait" ? "portrait"
    : c.orientation === "landscape" ? "landscape" : "unspecified";
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

    <application
        android:allowBackup="true"
        android:label="${c.appName}"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|keyboardHidden|screenSize"
            android:screenOrientation="${screen}"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

    </application>
</manifest>\n`;
}

export function genStrings(c: AppConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${c.appName}</string>
</resources>\n`;
}

export function genStyles(c: AppConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="colorPrimary">${c.themeColor}</item>
        <item name="android:windowBackground">${c.bgColor}</item>
        <item name="android:statusBarColor">${c.bgColor}</item>
    </style>
</resources>\n`;
}

export function genMainActivity(c: AppConfig): string {
  const pkg = c.appId;
  return `package ${pkg};

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
}

export function genReadme(c: AppConfig, _source: string): string {
  return `# ${c.appName || "Meu App"} — Android WebView APK

Projeto Android puro gerado pelo **APK Builder** (sem Capacitor, sem npm, sem Node.js).

## Estrutura
\`\`\`
android/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── assets/        ← Seus arquivos web (HTML/CSS/JS)
│       ├── java/.../
│       │   └── MainActivity.java
│       └── AndroidManifest.xml
├── build.gradle
├── settings.gradle
└── gradlew
.github/workflows/build-apk.yml  ← CI automático
\`\`\`

## Config
- **Package:** \`${c.appId}\`
- **Versão:** ${c.versionName} (code: ${c.versionCode})
- **Min SDK:** Android ${c.minSdk}+
- **Target SDK:** ${TARGET_SDK}
- **AGP:** ${AGP_VERSION}
- **Gradle:** ${GRADLE_VERSION}
- **Orientação:** ${c.orientation}
- **Dependências:** apenas \`androidx.appcompat:appcompat:1.7.0\`

## Opções para compilar

### ✅ Opção 1 — GitHub Actions (Gratuito, Automático)
1. Crie um repositório no GitHub
2. Faça push deste projeto: \`git init && git add . && git commit -m "APK" && git remote add origin URL && git push\`
3. O build inicia automaticamente → aguarde ~5 min
4. Baixe o APK em: **Repositório → Releases → latest-apk**

### 🖥️ Opção 2 — Android Studio (Local)
1. Instale [Android Studio](https://developer.android.com/studio)
2. Abra a pasta \`android/\` no Android Studio
3. **Build → Build Bundle(s)/APK(s) → Build APK(s)**
4. APK em: \`android/app/build/outputs/apk/debug/\`

### 💻 Opção 3 — Terminal Linux/Mac
\`\`\`bash
# Precisa de: Java 17 e Android SDK
export ANDROID_HOME=/path/to/sdk
cd android && chmod +x gradlew && ./gradlew assembleDebug
\`\`\`
`;
}

export function genPackageJson(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "meu-app";
  return JSON.stringify({
    name: safe,
    version: c.versionName,
    private: true,
    scripts: {
      build: "cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon",
    },
    "_note": "Este projeto é Android puro — sem Capacitor, sem npm install necessário para compilar",
  }, null, 2);
}

/* ── GitHub Actions CORRIGIDO — baixa wrapper JAR automaticamente ── */
export function genGithubActionsWorkflow(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9]/g, "-");
  return `name: Build APK — ${safe}

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Java 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      # ── Baixar gradle-wrapper.jar (necessário para ./gradlew funcionar) ──
      - name: Baixar Gradle Wrapper JAR
        run: |
          mkdir -p android/gradle/wrapper
          # Baixar distribuição Gradle e extrair o wrapper JAR
          curl -fsSLo /tmp/gradle.zip \\
            "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"
          unzip -qj /tmp/gradle.zip \\
            "gradle-${GRADLE_VERSION}/lib/gradle-cli-main.jar" \\
            "gradle-${GRADLE_VERSION}/lib/gradle-launcher-${GRADLE_VERSION}.jar" \\
            -d /tmp/gradle-jars/ 2>/dev/null || true
          # Alternativa: usar gradle diretamente via PATH
          echo "/tmp/gradle-bin/bin" >> $GITHUB_PATH
          mkdir -p /tmp/gradle-bin
          unzip -q /tmp/gradle.zip -d /tmp/gradle-extract/
          ln -sf /tmp/gradle-extract/gradle-${GRADLE_VERSION} /tmp/gradle-bin/gradle-dist
          echo "/tmp/gradle-extract/gradle-${GRADLE_VERSION}/bin" >> $GITHUB_PATH
          # Criar wrapper JAR a partir do jar nativo
          find /tmp/gradle-extract -name "gradle-wrapper*.jar" 2>/dev/null | head -1 | \\
            xargs -I{} cp {} android/gradle/wrapper/gradle-wrapper.jar 2>/dev/null || true

      # SEM Node.js, SEM npm, SEM Capacitor — Android puro WebView
      - name: Permissão gradlew
        working-directory: android
        run: chmod +x gradlew

      - name: Build APK (gradlew)
        working-directory: android
        timeout-minutes: 25
        continue-on-error: true
        id: build_wrapper
        env:
          GRADLE_OPTS: "-Xmx3g -Dorg.gradle.daemon=false -Dfile.encoding=UTF-8"
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: ./gradlew assembleDebug --no-daemon --stacktrace

      # Fallback: usar gradle direto caso o wrapper falhe
      - name: Build APK (gradle direto — fallback)
        if: steps.build_wrapper.outcome == 'failure'
        working-directory: android
        timeout-minutes: 25
        env:
          GRADLE_OPTS: "-Xmx3g -Dorg.gradle.daemon=false"
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          GRADLE_BIN=$(find /tmp/gradle-extract -name "gradle" -type f 2>/dev/null | head -1)
          echo "Usando Gradle: $GRADLE_BIN"
          "$GRADLE_BIN" assembleDebug --no-daemon --stacktrace

      - name: Verificar APK gerado
        run: |
          APK=$(find android -name "*.apk" 2>/dev/null | head -1)
          if [ -z "$APK" ]; then echo "❌ APK não encontrado!"; exit 1; fi
          echo "✅ APK: $APK"
          ls -lh "$APK"
          echo "APK_PATH=$APK" >> $GITHUB_ENV

      - name: Renomear APK
        run: |
          cp "$APK_PATH" "${safe}-v${c.versionName}.apk"

      - name: Deletar release anterior
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh release delete latest-apk --yes 2>/dev/null || true

      - name: Publicar Release com APK
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create latest-apk \\
            --title "✅ ${safe} v${c.versionName} — APK" \\
            --notes "## APK gerado automaticamente

          **Como instalar no celular:**
          1. Clique no arquivo **.apk** abaixo para baixar
          2. No Android: Configurações → Segurança → **Fontes desconhecidas** ✓
          3. Abra o arquivo .apk → **Instalar**

          > Gerado com Android ${TARGET_SDK}, AGP ${AGP_VERSION}, Gradle ${GRADLE_VERSION}" \\
            --latest \\
            "${safe}-v${c.versionName}.apk"
`;
}

/* ── PWA ──────────────────────────────────────────────────────── */
export function genWebManifest(c: AppConfig): string {
  return JSON.stringify({
    name: c.appName,
    short_name: c.appName.split(" ")[0],
    description: `Aplicativo ${c.appName}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: c.orientation === "any" ? "any" : c.orientation === "landscape" ? "landscape" : "portrait",
    background_color: c.bgColor,
    theme_color: c.themeColor,
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }, null, 2);
}

export function genServiceWorker(c: AppConfig): string {
  return `/* ${c.appName} — Service Worker v${c.versionName} */
const CACHE = "app-cache-v${c.versionCode}";
const BASE = "/";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, BASE + "index.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/api/")) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request);
    const fresh = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => cached);
    return cached || fresh;
  }));
});
`;
}

/* ── EAS (mantido para compatibilidade com App.tsx) ─────────── */
const EXPO_OWNER = "maikons-individual";
const EXPO_PROJECT_ID = "749b59c7-e313-4419-9e11-1d5bf51ce364";

export function genEasAppJson(c: AppConfig): string {
  const slug = c.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meu-app";
  return JSON.stringify({
    expo: {
      name: c.appName, slug, version: c.versionName, owner: EXPO_OWNER,
      orientation: c.orientation === "landscape" ? "landscape" : "portrait",
      backgroundColor: c.bgColor,
      splash: { backgroundColor: c.bgColor, resizeMode: "contain" },
      android: { package: c.appId, versionCode: c.versionCode, adaptiveIcon: { backgroundColor: c.bgColor }, splash: { backgroundColor: c.bgColor } },
      plugins: ["./plugins/withCopyWww"],
      extra: { eas: { projectId: EXPO_PROJECT_ID } },
    },
  }, null, 2);
}

export function genEasAppTsx(c: AppConfig): string {
  return `import { SafeAreaView, StyleSheet, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="${c.bgColor}" barStyle="light-content"/>
      <WebView source={{ uri: 'file:///android_asset/www/index.html' }} style={styles.webview}
        javaScriptEnabled domStorageEnabled allowFileAccess allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs originWhitelist={['*']} mixedContentMode="always"/>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '${c.bgColor}' }, webview: { flex: 1 } });
`;
}

export function genEasBabelConfig(): string {
  return `module.exports = function(api) { api.cache(true); return { presets: ['babel-preset-expo'] }; };\n`;
}

export function genEasPackageJson(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "meu-app";
  return JSON.stringify({
    name: safe, version: c.versionName, main: "node_modules/expo/AppEntry.js", private: true,
    scripts: { start: "expo start", android: "expo run:android" },
    dependencies: { expo: "~52.0.0", "expo-status-bar": "~2.0.0", react: "18.3.2", "react-native": "0.76.5", "react-native-webview": "13.12.4" },
    devDependencies: { "@babel/core": "^7.25.0", "@expo/config-plugins": "~8.0.0", "typescript": "~5.3.3" },
  }, null, 2);
}

export function genEasJson(): string {
  return JSON.stringify({ cli: { version: ">= 14.0.0", appVersionSource: "local" }, build: { apk: { android: { buildType: "apk" } }, production: { android: { buildType: "app-bundle" } } } }, null, 2);
}

export function genCopyWwwPlugin(): string {
  return `const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs'); const path = require('path');
module.exports = withDangerousMod(config => config, (config, phase) => {
  if (phase === 'prepare') {
    const src = path.join(__dirname, '../www');
    const dst = path.join(config.modRequest.projectRoot, 'android/app/src/main/assets/www');
    if (fs.existsSync(src)) {
      fs.mkdirSync(dst, { recursive: true });
      fs.readdirSync(src).forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
    }
  }
  return config;
});
`;
}

export function genEASCloudWorkflow(c: AppConfig): string {
  const safe = c.appName.replace(/[^a-zA-Z0-9]/g, "-");
  return `name: EAS Build — ${safe}
on:
  push:
    branches: [main, master]
  workflow_dispatch:
jobs:
  eas-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g eas-cli
      - run: npm install
      - name: EAS Build APK
        env:
          EXPO_TOKEN: \${{ secrets.EXPO_TOKEN }}
        run: eas build --platform android --profile apk --non-interactive --no-wait
`;
}

function genVsCodeSettings(): string {
  return JSON.stringify({ "java.configuration.updateBuildConfiguration": "automatic", "java.compile.nullAnalysis.mode": "disabled" }, null, 2);
}

function genVsCodeExtensions(): string {
  return JSON.stringify({ recommendations: ["vscjava.vscode-java-pack", "mathiasfrohlich.kotlin"] }, null, 2);
}

function genDevContainer(): string {
  return JSON.stringify({
    name: "Android Development",
    image: "mcr.microsoft.com/devcontainers/java:1-17",
    postCreateCommand: "bash .devcontainer/setup-android.sh",
    remoteUser: "vscode",
    customizations: { vscode: { extensions: ["vscjava.vscode-java-pack"], settings: { "terminal.integrated.defaultProfile.linux": "bash" } } },
  }, null, 2);
}

export function genDevContainerSetup(): string {
  return `#!/bin/bash
set -e
echo "=== Instalando Android SDK ==="
SDK_DIR="/usr/local/lib/android/sdk"
sudo mkdir -p "$SDK_DIR/cmdline-tools"
curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdtools.zip
unzip -q /tmp/cmdtools.zip -d /tmp/cmdtools-ext
sudo mv /tmp/cmdtools-ext/cmdline-tools "$SDK_DIR/cmdline-tools/latest"
sudo rm -rf /tmp/cmdtools.zip /tmp/cmdtools-ext
export ANDROID_HOME="$SDK_DIR"
export PATH="$PATH:$SDK_DIR/cmdline-tools/latest/bin:$SDK_DIR/platform-tools"
yes | sdkmanager --licenses >/dev/null 2>&1
sdkmanager "platforms;android-${TARGET_SDK}" "build-tools;${BUILD_TOOLS}" "platform-tools" 2>&1 | tail -3
echo 'export ANDROID_HOME=/usr/local/lib/android/sdk' >> ~/.bashrc
echo 'export PATH=\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools' >> ~/.bashrc
chmod +x android/gradlew
echo "✅ Pronto! Execute: ./build.sh"
`;
}

export function genBuildScript(): string {
  return `#!/bin/bash
# Build script — Android puro (sem npm, sem Capacitor)
# Precisa de: Java 17 e Android SDK
set -e
export ANDROID_HOME="\${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
echo "=== 🔨 Compilando APK Android ==="
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs=-Xmx3g
APK="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  SIZE=$(du -h "$APK" | cut -f1)
  echo ""
  echo "✅ APK pronto: android/$APK ($SIZE)"
  echo "📥 No VS Code: clique com botão direito no arquivo → Download"
else
  echo "❌ APK não encontrado — verifique os erros acima"
  exit 1
fi
`;
}

export function genGitpodYml(): string {
  return `tasks:
  - init: bash .devcontainer/setup-android.sh
    command: echo "✅ Ambiente pronto! Execute: ./build.sh"
vscode:
  extensions:
    - vscjava.vscode-java-pack
`;
}

export function genGitpodDockerfile(): string {
  return `FROM gitpod/workspace-java-17\nUSER gitpod\n`;
}

/* ══════════════════════════════════════════════════════════
   buildAndroidZip — gera o ZIP completo do projeto Android
   WEB FILES → android/app/src/main/assets/ (sem Capacitor)
══════════════════════════════════════════════════════════ */
export async function buildAndroidZip(
  cfg: AppConfig,
  files: ArchiveFile[],
  _source: string,
  iconDataUrl?: string | null,
): Promise<Blob> {
  const zip = new JSZip();
  const webFiles = normalizeWebFiles(files);
  const pkgParts = cfg.appId.split(".");

  const assetsDir = zip.folder("android")!.folder("app")!.folder("src")!.folder("main")!.folder("assets")!;
  for (const f of webFiles) {
    if (!f.path || f.path.endsWith("/")) continue;
    assetsDir.file(f.path, f.content, { binary: true });
  }

  const android = zip.folder("android")!;
  android.file("build.gradle", genRootGradle());
  android.file("settings.gradle", genSettingsGradle(cfg));
  android.file("gradle.properties", `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nandroid.enableJetifier=false\nandroid.nonTransitiveRClass=true\n`);
  android.file("gradlew", genGradlewScript(), { unixPermissions: "755" });
  android.file("gradlew.bat", `@echo off\nsetlocal\nset CLASSPATH=%~dp0gradle\\wrapper\\gradle-wrapper.jar\njava -classpath "%CLASSPATH%" -Xmx64m org.gradle.wrapper.GradleWrapperMain %*\n`);
  android.folder("gradle")!.folder("wrapper")!.file("gradle-wrapper.properties", genGradleWrapperProperties());

  /* ── IMPORTANTE: instrução para baixar gradle-wrapper.jar ── */
  android.folder("gradle")!.folder("wrapper")!.file(
    "BAIXAR-WRAPPER-JAR.txt",
    `COMO OBTER O gradle-wrapper.jar (necessário para ./gradlew funcionar localmente):

Opção 1 — Android Studio (mais fácil):
  Abra este projeto no Android Studio → ele baixa tudo automaticamente.

Opção 2 — Linha de comando:
  curl -fsSLo gradle/wrapper/gradle-wrapper.jar \\
    "https://raw.githubusercontent.com/nicefoo/gradle-wrapper-jars/main/gradle-wrapper.jar" \\
    2>/dev/null || wget -O gradle/wrapper/gradle-wrapper.jar \\
    "https://raw.githubusercontent.com/nicefoo/gradle-wrapper-jars/main/gradle-wrapper.jar"

Opção 3 — Extrair da distribuição Gradle:
  curl -fsSLo /tmp/gradle.zip https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip
  unzip -qj /tmp/gradle.zip "gradle-${GRADLE_VERSION}/lib/gradle-*wrapper*.jar" -d gradle/wrapper/
  mv gradle/wrapper/gradle-*wrapper*.jar gradle/wrapper/gradle-wrapper.jar

Opção 4 — Via GitHub Actions (CI automático, sem precisar do JAR localmente):
  Faça push para o GitHub → o arquivo .github/workflows/build-apk.yml
  baixa o Gradle automaticamente e compila o APK.
`
  );

  const app = android.folder("app")!;
  app.file("build.gradle", genAppGradle(cfg));
  app.file("proguard-rules.pro", `-keep class ${cfg.appId}.** { *; }\n`);

  const main = app.folder("src")!.folder("main")!;
  main.file("AndroidManifest.xml", genManifest(cfg));

  const res = main.folder("res")!;
  res.folder("values")!.file("strings.xml", genStrings(cfg));
  res.folder("values")!.file("styles.xml", genStyles(cfg));

  const iconSrc = iconDataUrl || null;
  if (iconSrc) {
    const b64 = iconSrc.split(",")[1];
    if (b64) {
      for (const sz of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
        res.folder(`mipmap-${sz}`)!.file("ic_launcher.png", b64, { base64: true });
        res.folder(`mipmap-${sz}`)!.file("ic_launcher_round.png", b64, { base64: true });
      }
    }
  }

  let cur = main.folder("java")!;
  for (const part of pkgParts) cur = cur.folder(part)!;
  cur.file("MainActivity.java", genMainActivity(cfg));

  zip.folder(".github")!.folder("workflows")!.file("build-apk.yml", genGithubActionsWorkflow(cfg));

  zip.file("build.sh", genBuildScript(), { unixPermissions: "755" });
  zip.file("README.md", genReadme(cfg, _source));
  zip.file(".devcontainer/devcontainer.json", genDevContainer());
  zip.file(".devcontainer/setup-android.sh", genDevContainerSetup(), { unixPermissions: "755" });
  zip.file(".gitpod.yml", genGitpodYml());
  zip.file(".vscode/settings.json", genVsCodeSettings());
  zip.file(".vscode/extensions.json", genVsCodeExtensions());

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function toAB(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

export function buildAndroidFilesForGithub(
  cfg: AppConfig,
  files: ArchiveFile[],
  source: string,
  _iconDataUrl?: string | null,
): ArchiveFile[] {
  const webFiles = normalizeWebFiles(files);
  const pkgParts = cfg.appId.split(".");
  const pkgPath = pkgParts.join("/");
  const out: ArchiveFile[] = [];

  for (const f of webFiles) {
    if (!f.path || f.path.endsWith("/")) continue;
    out.push({ path: `android/app/src/main/assets/${f.path}`, content: f.content });
  }

  out.push({ path: "android/build.gradle", content: toAB(genRootGradle()) });
  out.push({ path: "android/settings.gradle", content: toAB(genSettingsGradle(cfg)) });
  out.push({ path: "android/gradle.properties", content: toAB(`org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nandroid.enableJetifier=false\nandroid.nonTransitiveRClass=true\n`) });
  out.push({ path: "android/gradlew", content: toAB(genGradlewScript()) });
  out.push({ path: "android/gradlew.bat", content: toAB(`@echo off\nsetlocal\nset CLASSPATH=%~dp0gradle\\wrapper\\gradle-wrapper.jar\njava -classpath "%CLASSPATH%" -Xmx64m org.gradle.wrapper.GradleWrapperMain %*\n`) });
  out.push({ path: "android/gradle/wrapper/gradle-wrapper.properties", content: toAB(genGradleWrapperProperties()) });
  out.push({ path: "android/app/build.gradle", content: toAB(genAppGradle(cfg)) });
  out.push({ path: "android/app/proguard-rules.pro", content: toAB(`-keep class ${cfg.appId}.** { *; }\n`) });
  out.push({ path: `android/app/src/main/AndroidManifest.xml`, content: toAB(genManifest(cfg)) });
  out.push({ path: `android/app/src/main/res/values/strings.xml`, content: toAB(genStrings(cfg)) });
  out.push({ path: `android/app/src/main/res/values/styles.xml`, content: toAB(genStyles(cfg)) });
  out.push({ path: `android/app/src/main/java/${pkgPath}/MainActivity.java`, content: toAB(genMainActivity(cfg)) });
  out.push({ path: ".github/workflows/build-apk.yml", content: toAB(genGithubActionsWorkflow(cfg)) });
  out.push({ path: "build.sh", content: toAB(genBuildScript()) });
  out.push({ path: "README.md", content: toAB(genReadme(cfg, source)) });
  out.push({ path: ".devcontainer/devcontainer.json", content: toAB(genDevContainer()) });
  out.push({ path: ".devcontainer/setup-android.sh", content: toAB(genDevContainerSetup()) });
  out.push({ path: ".gitpod.yml", content: toAB(genGitpodYml()) });

  return out;
}

export function buildEASFilesForGithub(
  cfg: AppConfig,
  files: ArchiveFile[],
  _source: string,
  _workflowFn?: unknown,
): ArchiveFile[] {
  const webFiles = normalizeWebFiles(files);
  const out: ArchiveFile[] = [];
  for (const f of webFiles) {
    if (!f.path || f.path.endsWith("/")) continue;
    out.push({ path: `www/${f.path}`, content: f.content });
  }
  out.push({ path: "app.json",                         content: toAB(genEasAppJson(cfg)) });
  out.push({ path: "App.tsx",                          content: toAB(genEasAppTsx(cfg)) });
  out.push({ path: "babel.config.js",                  content: toAB(genEasBabelConfig()) });
  out.push({ path: "package.json",                     content: toAB(genEasPackageJson(cfg)) });
  out.push({ path: "eas.json",                         content: toAB(genEasJson()) });
  out.push({ path: "plugins/withCopyWww.js",           content: toAB(genCopyWwwPlugin()) });
  out.push({ path: ".github/workflows/build-apk.yml",  content: toAB(genEASCloudWorkflow(cfg)) });
  return out;
}
