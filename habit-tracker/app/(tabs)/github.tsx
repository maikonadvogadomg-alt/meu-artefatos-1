import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as _FileSystem from "expo-file-system";
const FileSystem = _FileSystem as any;
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View, Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProject } from "@/context/ProjectContext";
import { DEFAULT_CFG } from "@/context/ProjectContext";
import type { AppConfig } from "@/context/ProjectContext";
import {
  ghGetUser, ghListRepos, ghImportRepo, ghImportPublicRepo, ghCreateRepo, ghPushFiles,
  type GhUser, type GhRepo,
} from "@/lib/github";

const BG = "#080c18";
const CARD = "#0f1629";
const BORDER = "#1e293b";
const ACCENT = "#6366f1";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";
const GREEN = "#4ade80";
const RED = "#f87171";
const YELLOW = "#fbbf24";

type Tab = "import" | "push" | "analyze" | "config";

function Field({ label, value, onChange, placeholder, mono, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; hint?: string;
}) {
  return (
    <View style={{ gap: 3, marginBottom: 10 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {hint ? <Text style={[s.hint, { color: MUTED }]}>{hint}</Text> : null}
    </View>
  );
}

function ToggleRow({ label, value, onChange, sub }: { label: string; value: boolean; onChange: (v: boolean) => void; sub?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={s.toggleSwitchRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        {sub ? <Text style={[s.hint, { color: MUTED }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        thumbColor={value ? ACCENT : "#334155"}
        trackColor={{ false: "#1e293b", true: ACCENT + "55" }}
      />
    </Pressable>
  );
}

export default function GitHubScreen() {
  const insets = useSafeAreaInsets();
  const { ghToken, setGhToken, setFiles, setCfg, cfg, setSource, setProjectReady, setResult, files, source } = useProject();

  const [user, setUser] = useState<GhUser | null>(null);
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [tokenInput, setTokenInput] = useState(ghToken);
  const [tab, setTab] = useState<Tab>("import");

  // Import público sem token
  const [publicInput, setPublicInput] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicMsg, setPublicMsg] = useState("");

  // Push state
  const [pushRepo, setPushRepo] = useState("");
  const [pushBranch, setPushBranch] = useState("main");
  const [pushMsg, setPushMsg] = useState("Update via APK Builder");
  const [pushPrivate, setPushPrivate] = useState(false);
  const [enablePages, setEnablePages] = useState(false);
  const [enableActions, setEnableActions] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState("");

  // Analyze state
  const [selectedRepo, setSelectedRepo] = useState<GhRepo | null>(null);
  const [repoTree, setRepoTree] = useState<Array<{ path: string; type: string; size?: number }>>([]);
  const [treeFilter, setTreeFilter] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Config state (mirrors export cfg)
  const [localCfg, setLocalCfg] = useState<AppConfig>(cfg);
  useEffect(() => { setLocalCfg(cfg); }, [cfg]);

  // Auto-save token
  useEffect(() => {
    if (!tokenInput.trim() || tokenInput.trim().length < 10) return;
    const t = setTimeout(() => setGhToken(tokenInput.trim()), 600);
    return () => clearTimeout(t);
  }, [tokenInput]);

  useEffect(() => {
    if (!ghToken || ghToken.length < 10) { setUser(null); setRepos([]); return; }
    const t = setTimeout(async () => {
      setMsg("🔄 Conectando ao GitHub...");
      try {
        const u = await ghGetUser(ghToken);
        setUser(u);
        const r = await ghListRepos(ghToken);
        setRepos(r);
        setMsg(`✅ @${u.login} — ${r.length} repositórios`);
        setTab("import");
      } catch (e) {
        setUser(null); setMsg("❌ Token inválido: " + String(e));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [ghToken]);

  async function doPublicImport() {
    if (!publicInput.trim()) return;
    setPublicLoading(true);
    setPublicMsg("Verificando repositório público...");
    try {
      const { files: imported, repoName, branch } = await ghImportPublicRepo(publicInput, setPublicMsg);
      const newCfg: AppConfig = {
        ...DEFAULT_CFG,
        appName: repoName,
        appId: `com.github.${repoName.replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
      };
      setCfg(() => newCfg);
      setLocalCfg(newCfg);
      setFiles(imported);
      setSource(`GitHub público: ${publicInput.trim()}@${branch}`);
      setProjectReady(true);
      setResult("", "");
      setPublicMsg(`✅ ${imported.length} arquivos importados de ${repoName}!`);
      router.push("/(tabs)/playground");
    } catch (e) {
      setPublicMsg("❌ " + String(e));
    } finally {
      setPublicLoading(false);
    }
  }

  async function doImport(repo: GhRepo) {
    setLoading(true);
    setMsg(`Importando ${repo.full_name}...`);
    try {
      const [owner, name] = repo.full_name.split("/");
      const imported = await ghImportRepo(ghToken, owner, name, repo.default_branch, setMsg);
      const newCfg: AppConfig = {
        ...DEFAULT_CFG,
        appName: repo.name,
        appId: `com.github.${name.replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
      };
      setCfg(() => newCfg);
      setLocalCfg(newCfg);
      setFiles(imported);
      setSource(`GitHub: ${repo.full_name}@${repo.default_branch}`);
      setProjectReady(true);
      setResult("", "");
      setMsg(`✅ ${imported.length} arquivos importados de ${repo.full_name}!`);
      router.push("/(tabs)/playground");
    } catch (e) {
      setMsg("❌ " + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadRepoTree(repo: GhRepo) {
    setTreeLoading(true);
    setSelectedRepo(repo);
    setRepoTree([]);
    setSelectedFile(null);
    setTab("analyze");
    try {
      const [owner, name] = repo.full_name.split("/");
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/git/trees/${repo.default_branch}?recursive=1`,
        { headers: { Authorization: `token ${ghToken}`, Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRepoTree(data.tree ?? []);
      setMsg(`✅ Árvore carregada: ${(data.tree ?? []).length} itens`);
    } catch (e) {
      setMsg("❌ Erro ao carregar árvore: " + String(e));
    } finally {
      setTreeLoading(false);
    }
  }

  async function loadFileContent(path: string) {
    if (!selectedRepo) return;
    setLoadingFile(true);
    setSelectedFile(null);
    try {
      const [owner, name] = selectedRepo.full_name.split("/");
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${path}`,
        { headers: { Authorization: `token ${ghToken}`, Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let content = "";
      if (data.encoding === "base64") {
        content = atob(data.content.replace(/\n/g, ""));
      } else {
        content = data.content ?? "";
      }
      setSelectedFile({ path, content: content.slice(0, 20000) });
    } catch (e) {
      setSelectedFile({ path, content: `Erro ao carregar: ${String(e)}` });
    } finally {
      setLoadingFile(false);
    }
  }

  async function importFromAnalyze() {
    if (!selectedRepo) return;
    setTab("import");
    doImport(selectedRepo);
  }

  function publishAsApp(repo: GhRepo) {
    const [owner, name] = repo.full_name.split("/");
    const url = `https://github.com/${owner}/${name}/settings/pages`;
    Alert.alert(
      "Publicar como App Web",
      `Vai abrir as configurações do GitHub Pages para ${repo.full_name}.\n\nEscolha Branch: main / Pasta: / (root) ou /docs`,
      [
        { text: "Cancelar" },
        { text: "Abrir no GitHub", onPress: () => Linking.openURL(url) },
      ]
    );
  }

  async function doPush() {
    if (!pushRepo.trim()) { setPushResult("❌ Digite o nome do repositório."); return; }
    if (!ghToken) { setPushResult("❌ Conecte seu token primeiro."); return; }
    if (!files.length) { setPushResult("❌ Importe um projeto primeiro na aba Importar."); return; }
    setPushing(true); setPushResult("Criando repositório...");
    try {
      const repo = await ghCreateRepo(ghToken, pushRepo.trim(), `Criado pelo APK Builder · ${source || ""}`, pushPrivate);
      setPushResult("Enviando arquivos...");
      const [owner, rname] = repo.full_name.split("/");

      // Add GitHub Actions workflow if requested
      const filesToPush = [...files];
      if (enableActions) {
        const workflowYaml = [
          "name: Build APK",
          "on: [push, workflow_dispatch]",
          "jobs:",
          "  build:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: actions/checkout@v4",
          "      - uses: actions/setup-java@v4",
          "        with: { distribution: temurin, java-version: '17' }",
          "      - name: Install Gradle",
          "        run: |",
          "          wget -q https://services.gradle.org/distributions/gradle-8.4-bin.zip",
          "          unzip -q gradle-8.4-bin.zip -d /opt/gradle",
          "          echo \"/opt/gradle/gradle-8.4/bin\" >> $GITHUB_PATH",
          "      - name: Build APK",
          "        working-directory: android",
          "        run: gradle assembleRelease --no-daemon",
          "      - uses: actions/upload-artifact@v4",
          "        with:",
          "          name: app-release.apk",
          "          path: android/app/build/outputs/apk/release/*.apk",
        ].join("\n");
        filesToPush.push({
          path: ".github/workflows/build-apk.yml",
          data: btoa(unescape(encodeURIComponent(workflowYaml))),
        });
      }

      await ghPushFiles(ghToken, owner, rname, filesToPush, pushMsg || "Initial commit via APK Builder", setPushResult);

      if (enablePages) {
        setPushResult("Habilitando GitHub Pages...");
        await fetch(`https://api.github.com/repos/${owner}/${rname}/pages`, {
          method: "POST",
          headers: { Authorization: `token ${ghToken}`, "Content-Type": "application/json", Accept: "application/vnd.github+json" },
          body: JSON.stringify({ source: { branch: pushBranch, path: "/" } }),
        });
        const pageUrl = `https://${owner}.github.io/${rname}`;
        setTimeout(() => Linking.openURL(pageUrl), 2000);
        setPushResult(`✅ Publicado como App Web!\n${pageUrl}`);
      } else {
        setPushResult(`✅ Push concluído!\n${repo.html_url}`);
      }

      const newRepos = await ghListRepos(ghToken).catch(() => repos);
      setRepos(newRepos);
    } catch (e) {
      setPushResult("❌ " + String(e));
    } finally {
      setPushing(false);
    }
  }

  function saveConfig() {
    setCfg(() => localCfg);
    Alert.alert("✅ Configurações salvas", "As configurações do APK foram atualizadas.");
  }

  async function generateSystemReport() {
    const now = new Date().toLocaleString("pt-BR");
    const report = [
      "╔══════════════════════════════════════════════════╗",
      "║         APK BUILDER — RELATÓRIO DO SISTEMA       ║",
      "╚══════════════════════════════════════════════════╝",
      `Gerado em: ${now}`,
      `Plataforma: ${Platform.OS} ${Platform.Version}`,
      "",
      "══ IMPORTAÇÃO DE PROJETOS ══════════════════════════",
      "✅ ZIP local (qualquer tamanho)",
      "✅ TAR / TAR.GZ / TGZ local",
      "✅ GitHub via token (PAT) — repo ZIP completo",
      "✅ URL direta (download via proxy CORS)",
      "✅ Sem limite de número de arquivos",
      "✅ Sem limite de tamanho imposto pelo app",
      "   (limite real: memória do dispositivo)",
      "⚠️  Repos GitHub muito grandes (>500MB no servidor)",
      "   podem falhar por timeout da API do GitHub",
      "",
      "══ FILTROS AUTOMÁTICOS NO IMPORT ═══════════════════",
      "🚫 Ignora: node_modules/, .git/, .DS_Store",
      "🚫 Ignora: *.exe, *.dll, *.so, *.dylib (binários)",
      "🚫 Ignora: *.zip, *.tar, *.gz aninhados",
      "🚫 Ignora: __pycache__/, .gradle/, .idea/",
      "✅ Aceita: HTML, CSS, JS, TS, JSON, imagens, fontes",
      "✅ Aceita: qualquer arquivo de texto/código",
      "",
      "══ DETECÇÃO INTELIGENTE DE PASTA WEB ═══════════════",
      "O app detecta automaticamente a pasta de saída:",
      "  1º dist/        → usa dist/ como root do APK",
      "  2º build/       → usa build/ como root do APK",
      "  3º www/         → usa www/ como root do APK",
      "  4º raiz         → usa todos os arquivos importados",
      "",
      "══ GERAÇÃO DO PROJETO ANDROID ══════════════════════",
      "✅ Gera ZIP com projeto Android nativo completo",
      "✅ Pure WebView — SEM Capacitor ou Ionic",
      "✅ Usa WebViewAssetLoader (scheme https seguro)",
      "✅ JavaScript habilitado, DOM Storage, IndexedDB",
      "✅ Links externos abrem no navegador do sistema",
      "✅ Botão voltar do Android navega no histórico",
      "✅ Full screen (sem barra de título)",
      "✅ Inclui workflow GitHub Actions para build APK",
      "✅ Compatível: Android 5.1+ (API 22) até 14 (API 34)",
      "⚠️  NÃO suporta: câmera, GPS, Bluetooth, notificações",
      "⚠️  NÃO suporta: APIs nativas (só o que o WebView tem)",
      "",
      "══ COMPILAÇÃO DO APK ═══════════════════════════════",
      "OPÇÃO 1 — GitHub Actions (GRÁTIS, recomendado):",
      "  • Faça push do ZIP gerado para um repo GitHub",
      "  • O workflow compila automaticamente",
      "  • Baixe o APK em: Actions → último run → Artifacts",
      "",
      "OPÇÃO 2 — EAS Build (Expo, requer token):",
      "  • Cole seu token EAS na aba APK/Exportar",
      "  • O servidor Expo compila em ~10-15 minutos",
      "  • Baixe direto do expo.dev",
      "",
      "OPÇÃO 3 — Android Studio (local, avançado):",
      "  • Extraia o ZIP → abra pasta android/ no Studio",
      "  • Build → Generate Signed APK",
      "",
      "══ GITHUB — O QUE O APP FAZ ════════════════════════",
      "✅ Login via token PAT (ghp_...)",
      "✅ Lista seus repositórios (público e privado)",
      "✅ Importa repo completo via API zipball",
      "✅ Analisa árvore de arquivos de qualquer repo",
      "✅ Visualiza conteúdo de arquivos texto",
      "✅ Cria novo repo e faz push de projeto",
      "✅ Habilita GitHub Pages (URL pública)",
      "✅ Adiciona workflow de build automático",
      "⚠️  Token precisa de escopos: repo + workflow + pages",
      "",
      "══ PLAYGROUND / EDITOR ═════════════════════════════",
      "✅ Editor de código com syntax highlight",
      "✅ Cria, edita, renomeia e deleta arquivos",
      "✅ Preview ao vivo do app importado (WebView)",
      "✅ Upload de arquivos do dispositivo",
      "✅ Compartilha arquivos individuais",
      "",
      "══ LIMITAÇÕES CONHECIDAS ════════════════════════════",
      "❌ Não compila APK localmente (precisa de Gradle/JDK)",
      "❌ Não suporta apps React Native nativos",
      "❌ Não suporta Flutter (.dart)",
      "❌ Não assina APK (gerado sem assinatura release)",
      "❌ Sem suporte a notificações push no APK gerado",
      "❌ Sem suporte a deep links no APK gerado",
      "❌ Repos privados exigem token com escopo 'repo'",
      "",
      "══ VERSÃO ══════════════════════════════════════════",
      "APK Builder Mobile v1.5",
      "Runtime: Expo SDK 53 / React Native",
      "Compilação APK: Android Gradle Plugin 8.2.2",
      "WebView: AndroidX WebKit 1.11.0",
      "GitHub API: v3 REST + zipball",
      "EAS Build: API v2",
      "",
      "══ SUPORTE ═════════════════════════════════════════",
      "OAB/MG 183712 — Maikon Caldeira",
      "Ferramenta: APK Builder by SK Tools",
      "═══════════════════════════════════════════════════",
    ].join("\n");

    try {
      const fileName = `sistema-apk-builder-${Date.now()}.txt`;
      const uri = (FileSystem.cacheDirectory ?? "") + fileName;
      await FileSystem.writeAsStringAsync(uri, report, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/plain",
          dialogTitle: "Relatório do Sistema — APK Builder",
          UTI: "public.plain-text",
        });
      } else {
        Alert.alert("Relatório do Sistema", report.slice(0, 1000) + "\n\n[...]");
      }
    } catch (e) {
      Alert.alert("Relatório do Sistema", report.slice(0, 1200));
    }
  }

  const filtered = repos.filter(r => !filter || r.name.toLowerCase().includes(filter.toLowerCase()));
  const filteredTree = repoTree.filter(n => !treeFilter || n.path.toLowerCase().includes(treeFilter.toLowerCase()));

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: "import", label: "Importar", icon: "download-cloud" },
    { id: "push", label: "Enviar", icon: "upload-cloud" },
    { id: "analyze", label: "Analisar", icon: "eye" },
    { id: "config", label: "Config APK", icon: "settings" },
  ];

  return (
    <View style={[s.root, { backgroundColor: BG }]}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>🐙 GitHub</Text>

        {/* ── Import Público SEM token ── */}
        <View style={[s.card, { borderColor: "#166534", backgroundColor: "#040d08" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <Feather name="globe" size={14} color={GREEN} />
            <Text style={[s.sectionLabel, { color: GREEN, letterSpacing: 0.5 }]}>REPO PÚBLICO — SEM TOKEN</Text>
          </View>
          <Text style={[s.hint, { color: MUTED, marginBottom: 6 }]}>
            Cole o link ou caminho do repo público. Ex: usuario/repositorio ou https://github.com/usuario/repo
          </Text>
          <TextInput
            style={[s.input, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 }]}
            value={publicInput}
            onChangeText={setPublicInput}
            placeholder="usuario/repositorio  ou  https://github.com/..."
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!publicLoading}
          />
          {publicMsg !== "" && (
            <View style={[
              { borderRadius: 8, padding: 8, borderWidth: 1 },
              publicMsg.startsWith("✅") ? { backgroundColor: "#052e16", borderColor: "#166534" }
                : publicMsg.startsWith("❌") ? { backgroundColor: "#1c0505", borderColor: "#7f1d1d" }
                  : { backgroundColor: "#060d1a", borderColor: "#1e3a5f" },
            ]}>
              <Text style={[s.hint, {
                color: publicMsg.startsWith("✅") ? GREEN : publicMsg.startsWith("❌") ? RED : WHITE,
                lineHeight: 17,
              }]}>{publicMsg}</Text>
            </View>
          )}
          <Pressable
            onPress={doPublicImport}
            disabled={publicLoading || !publicInput.trim()}
            style={({ pressed }) => [
              s.btn, { backgroundColor: "#166534" },
              (publicLoading || !publicInput.trim()) && s.btnDisabled,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {publicLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="download-cloud" size={16} color={GREEN} />}
            <Text style={[s.btnText, { color: GREEN }]}>
              {publicLoading ? "Baixando..." : "Importar repositório público"}
            </Text>
          </Pressable>
        </View>

        {/* Token Card */}
        <View style={[s.card, user && { borderColor: "#166534" }]}>
          {user ? (
            <View style={s.userRow}>
              <Image source={{ uri: user.avatar_url }} style={s.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: GREEN }]}>{user.name || user.login}</Text>
                <Text style={[s.hint, { color: MUTED }]}>@{user.login} · {repos.length} repos · ✅ Conectado</Text>
              </View>
              <Pressable onPress={() => { setGhToken(""); setTokenInput(""); setUser(null); setRepos([]); }} style={{ padding: 6 }}>
                <Feather name="log-out" size={16} color={MUTED} />
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={s.sectionLabel}>COLE SEU TOKEN GITHUB (PAT) — CONECTA AUTOMATICAMENTE</Text>
              <TextInput
                style={s.input}
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={MUTED}
                secureTextEntry={tokenInput.length > 0}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={() => Linking.openURL("https://github.com/settings/tokens/new?scopes=repo,workflow,pages&description=APK+Builder")}>
                <Text style={[s.hint, { color: ACCENT }]}>
                  ➕ Gerar token no GitHub (repo ✓ + workflow ✓ + pages ✓)
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Status */}
        {msg !== "" && (
          <View style={[s.card,
            msg.startsWith("✅") ? s.successCard :
              msg.startsWith("❌") ? s.errorCard : s.infoCard,
            { padding: 10 }]}>
            <Text style={[s.hint, {
              color: msg.startsWith("✅") ? GREEN : msg.startsWith("❌") ? RED : WHITE,
              lineHeight: 18,
            }]}>{msg}</Text>
          </View>
        )}

        {/* Tab Switcher */}
        {user && (
          <View style={s.tabGrid}>
            {tabs.map(t => (
              <Pressable key={t.id} onPress={() => setTab(t.id)}
                style={[s.tabBtn, tab === t.id && s.tabBtnActive]}>
                <Feather name={t.icon as any} size={14} color={tab === t.id ? "#fff" : MUTED} />
                <Text style={[s.tabTxt, tab === t.id && { color: "#fff" }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ═══ IMPORT TAB ═══ */}
        {user && tab === "import" && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>MEUS REPOSITÓRIOS ({repos.length})</Text>
            <TextInput
              style={[s.input, { marginBottom: 4 }]}
              value={filter}
              onChangeText={setFilter}
              placeholder="Filtrar por nome..."
              placeholderTextColor={MUTED}
            />
            {filtered.slice(0, 60).map(r => (
              <View key={r.full_name} style={s.repoRow}>
                <Text style={s.repoIcon}>{r.private ? "🔒" : "🌐"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.repoName} numberOfLines={1}>{r.name}</Text>
                  {r.description ? <Text style={[s.hint, { color: MUTED }]} numberOfLines={1}>{r.description}</Text> : null}
                  <Text style={[s.hint, { color: MUTED }]}>{r.default_branch} · {r.language ?? "—"}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pressable onPress={() => !loading && loadRepoTree(r)} disabled={loading}
                    style={[s.miniBtn, { backgroundColor: "#1e3a5f" }]}>
                    <Feather name="eye" size={13} color={ACCENT} />
                  </Pressable>
                  <Pressable onPress={() => !loading && doImport(r)} disabled={loading}
                    style={s.miniBtn}>
                    {loading ? <ActivityIndicator size="small" color={MUTED} /> : <Feather name="download" size={13} color={GREEN} />}
                  </Pressable>
                </View>
              </View>
            ))}
            {filtered.length === 0 && (
              <Text style={[s.hint, { textAlign: "center", paddingVertical: 16 }]}>Nenhum repositório encontrado</Text>
            )}
          </View>
        )}

        {/* ═══ ANALYZE TAB ═══ */}
        {user && tab === "analyze" && (
          <View style={{ gap: 10 }}>
            {!selectedRepo ? (
              <View style={s.card}>
                <Text style={[s.hint, { color: MUTED, textAlign: "center", paddingVertical: 20 }]}>
                  Na aba Importar, toque em 👁 para analisar um repositório
                </Text>
              </View>
            ) : (
              <>
                {/* Repo header */}
                <View style={[s.card, { borderColor: "#1e3a5f" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 20 }}>{selectedRepo.private ? "🔒" : "🌐"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.label, { color: WHITE }]}>{selectedRepo.full_name}</Text>
                      <Text style={[s.hint, { color: MUTED }]}>
                        Branch: {selectedRepo.default_branch} · {repoTree.length} arquivos
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <Pressable onPress={importFromAnalyze} disabled={loading}
                      style={[s.actionBtn, { backgroundColor: "#166534", flex: 1 }]}>
                      <Feather name="download-cloud" size={14} color={GREEN} />
                      <Text style={[s.actionBtnTxt, { color: GREEN }]}>Importar para APK</Text>
                    </Pressable>
                    <Pressable onPress={() => publishAsApp(selectedRepo)}
                      style={[s.actionBtn, { backgroundColor: "#1e3a5f", flex: 1 }]}>
                      <Feather name="globe" size={14} color={ACCENT} />
                      <Text style={[s.actionBtnTxt, { color: ACCENT }]}>Publicar como App</Text>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL(`https://github.com/${selectedRepo.full_name}`)}
                      style={[s.actionBtn, { backgroundColor: "#1a2540" }]}>
                      <Feather name="external-link" size={14} color={MUTED} />
                    </Pressable>
                  </View>
                </View>

                {/* File viewer */}
                {selectedFile && (
                  <View style={[s.card, { borderColor: "#1e3a5f" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <Feather name="file-text" size={14} color={ACCENT} />
                      <Text style={[s.hint, { color: ACCENT, flex: 1 }]} numberOfLines={1}>{selectedFile.path}</Text>
                      <Pressable onPress={() => setSelectedFile(null)}>
                        <Feather name="x" size={16} color={MUTED} />
                      </Pressable>
                    </View>
                    <ScrollView style={{ maxHeight: 320 }} horizontal={false} showsVerticalScrollIndicator>
                      <ScrollView horizontal showsHorizontalScrollIndicator>
                        <Text style={{
                          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                          fontSize: 11, color: "#e2e8f0", lineHeight: 17,
                        }} selectable>
                          {selectedFile.content}
                        </Text>
                      </ScrollView>
                    </ScrollView>
                  </View>
                )}

                {/* Tree */}
                <View style={s.card}>
                  <Text style={s.sectionLabel}>ÁRVORE DE ARQUIVOS</Text>
                  <TextInput
                    style={[s.input, { marginBottom: 6 }]}
                    value={treeFilter}
                    onChangeText={setTreeFilter}
                    placeholder="Filtrar arquivos..."
                    placeholderTextColor={MUTED}
                  />
                  {treeLoading && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16 }}>
                      <ActivityIndicator size="small" color={ACCENT} />
                      <Text style={[s.hint, { color: MUTED }]}>Carregando árvore...</Text>
                    </View>
                  )}
                  {loadingFile && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
                      <ActivityIndicator size="small" color={ACCENT} />
                      <Text style={[s.hint, { color: MUTED }]}>Carregando arquivo...</Text>
                    </View>
                  )}
                  {filteredTree.slice(0, 200).map(node => {
                    const depth = node.path.split("/").length - 1;
                    const name = node.path.split("/").pop() ?? node.path;
                    const isDir = node.type === "tree";
                    const ext = name.split(".").pop() ?? "";
                    const icon = isDir ? "folder" :
                      ["ts", "tsx", "js", "jsx"].includes(ext) ? "code" :
                        ["json", "yaml", "yml", "toml"].includes(ext) ? "settings" :
                          ["md", "txt"].includes(ext) ? "file-text" :
                            ["png", "jpg", "svg", "ico", "webp"].includes(ext) ? "image" :
                              "file";
                    const iconColor = isDir ? YELLOW :
                      ["ts", "tsx"].includes(ext) ? "#60a5fa" :
                        ["js", "jsx"].includes(ext) ? "#fbbf24" :
                          ["json", "yaml"].includes(ext) ? "#a78bfa" :
                            GREEN;

                    return (
                      <Pressable
                        key={node.path}
                        onPress={() => !isDir && loadFileContent(node.path)}
                        style={[s.treeRow, { paddingLeft: 8 + depth * 14 }]}
                      >
                        <Feather name={icon as any} size={13} color={iconColor} />
                        <Text style={[s.treeName, isDir && { color: YELLOW, fontFamily: "Inter_600SemiBold" }]}
                          numberOfLines={1}>
                          {name}{isDir ? "/" : ""}
                        </Text>
                        {node.size && node.size > 0 ? (
                          <Text style={[s.hint, { color: MUTED, fontSize: 10 }]}>
                            {node.size > 1024 ? `${(node.size / 1024).toFixed(1)}KB` : `${node.size}B`}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {filteredTree.length > 200 && (
                    <Text style={[s.hint, { textAlign: "center", paddingVertical: 8 }]}>
                      Mostrando 200 de {filteredTree.length} itens. Use o filtro para encontrar arquivos.
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {/* ═══ PUSH TAB ═══ */}
        {user && tab === "push" && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>ENVIAR PROJETO PARA O GITHUB</Text>

            {!files.length ? (
              <View style={[s.badge, { borderColor: "#b45309", backgroundColor: "#1c1000" }]}>
                <Feather name="alert-triangle" size={13} color={YELLOW} />
                <Text style={[s.hint, { color: YELLOW }]}>Importe um projeto primeiro na aba Importar ou no Editor.</Text>
              </View>
            ) : (
              <View style={[s.badge, { borderColor: "#166534", backgroundColor: "#052e16" }]}>
                <Feather name="package" size={13} color={GREEN} />
                <Text style={[s.hint, { color: GREEN }]}>{files.length} arquivos prontos · {source}</Text>
              </View>
            )}

            <Field label="Nome do repositório *" value={pushRepo} onChange={setPushRepo}
              placeholder="meu-projeto-web"
              hint={`Vai criar: github.com/${user?.login ?? "usuario"}/${pushRepo || "meu-projeto"}`} />

            <Field label="Branch" value={pushBranch} onChange={setPushBranch} placeholder="main" />

            <Field label="Mensagem do commit" value={pushMsg} onChange={setPushMsg}
              placeholder="Initial commit via APK Builder" />

            <View style={[s.toggleRow, { marginBottom: 8 }]}>
              <Pressable onPress={() => setPushPrivate(false)} style={[s.toggle, !pushPrivate && s.toggleActive]}>
                <Text style={[s.toggleTxt, !pushPrivate && { color: "#fff" }]}>🌐 Público</Text>
              </Pressable>
              <Pressable onPress={() => setPushPrivate(true)} style={[s.toggle, pushPrivate && s.toggleActive]}>
                <Text style={[s.toggleTxt, pushPrivate && { color: "#fff" }]}>🔒 Privado</Text>
              </Pressable>
            </View>

            <ToggleRow
              label="📡 Publicar como App Web (GitHub Pages)"
              value={enablePages}
              onChange={setEnablePages}
              sub={enablePages ? `URL: https://${user?.login ?? "usuario"}.github.io/${pushRepo || "app"}` : "Cria URL pública para o app"}
            />

            <ToggleRow
              label="⚙️ GitHub Actions (Build APK automático)"
              value={enableActions}
              onChange={setEnableActions}
              sub="Adiciona workflow que compila o APK quando você fizer push"
            />

            {pushResult !== "" && (
              <View style={[s.statusBox,
                pushResult.startsWith("✅") ? { borderColor: "#166534" } :
                  pushResult.startsWith("❌") ? { borderColor: "#7f1d1d" } : {}]}>
                <Text style={[s.hint, {
                  color: pushResult.startsWith("✅") ? GREEN : pushResult.startsWith("❌") ? RED : WHITE,
                  lineHeight: 18,
                }]}>{pushResult}</Text>
                {pushResult.startsWith("✅") && pushResult.includes("http") && (
                  <Pressable onPress={() => {
                    const url = pushResult.split("\n").find(l => l.startsWith("http"));
                    if (url) Linking.openURL(url);
                  }}>
                    <Text style={[s.hint, { color: ACCENT, marginTop: 4 }]}>Abrir no navegador →</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Pressable
              onPress={doPush}
              disabled={pushing || !files.length || !ghToken}
              style={({ pressed }) => [s.btn, (!files.length || !ghToken) && s.btnDisabled, pressed && { opacity: 0.85 }]}
            >
              {pushing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="upload-cloud" size={18} color="#fff" />}
              <Text style={s.btnText}>{pushing ? "Enviando..." : "Criar repositório e fazer push"}</Text>
            </Pressable>
          </View>
        )}

        {/* ═══ CONFIG APK TAB ═══ */}
        {user && tab === "config" && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>CONFIGURAÇÕES DO APK</Text>
            <Text style={[s.hint, { color: MUTED, marginBottom: 8 }]}>
              Essas configurações são usadas ao gerar o projeto Android na aba Exportar.
            </Text>

            <Field label="Nome do App *" value={localCfg.appName}
              onChange={v => setLocalCfg(c => ({ ...c, appName: v }))} placeholder="Meu App" />

            <Field label="Package ID *" value={localCfg.appId}
              onChange={v => setLocalCfg(c => ({ ...c, appId: v }))} placeholder="com.empresa.app"
              hint="Formato: com.suaempresa.nomeapp (sem espaços, só letras/números/pontos)" />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Versão (nome)" value={localCfg.versionName}
                  onChange={v => setLocalCfg(c => ({ ...c, versionName: v }))} placeholder="1.0.0" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Versão (código)" value={String(localCfg.versionCode)}
                  onChange={v => setLocalCfg(c => ({ ...c, versionCode: parseInt(v) || 1 }))} placeholder="1" />
              </View>
            </View>

            <Field label="Cor do tema (hex)" value={localCfg.themeColor}
              onChange={v => setLocalCfg(c => ({ ...c, themeColor: v }))} placeholder="#6366f1" />

            <Field label="Cor de fundo (hex)" value={localCfg.bgColor}
              onChange={v => setLocalCfg(c => ({ ...c, bgColor: v }))} placeholder="#0f172a" />

            <View style={{ marginBottom: 10 }}>
              <Text style={s.fieldLabel}>Orientação</Text>
              <View style={s.toggleRow}>
                {(["portrait", "landscape", "any"] as const).map(o => (
                  <Pressable key={o} onPress={() => setLocalCfg(c => ({ ...c, orientation: o }))}
                    style={[s.toggle, localCfg.orientation === o && s.toggleActive, { flex: 1 }]}>
                    <Text style={[s.toggleTxt, localCfg.orientation === o && { color: "#fff" }]}>
                      {o === "portrait" ? "📱 Retrato" : o === "landscape" ? "🔄 Paisagem" : "↕️ Ambos"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Field label="Android mínimo (API level)" value={String(localCfg.minSdk)}
              onChange={v => setLocalCfg(c => ({ ...c, minSdk: parseInt(v) || 22 }))} placeholder="22"
              hint="22 = Android 5.1+ · 26 = Android 8.0+ · 33 = Android 13+" />

            <Pressable onPress={saveConfig} style={[s.btn, { backgroundColor: "#166534" }]}>
              <Feather name="save" size={18} color={GREEN} />
              <Text style={[s.btnText, { color: GREEN }]}>Salvar configurações</Text>
            </Pressable>

            <Text style={[s.hint, { color: MUTED, textAlign: "center", marginTop: 4 }]}>
              Essas configurações ficam salvas e sincronizam com a aba Exportar
            </Text>
          </View>
        )}

        {/* ═══ RELATÓRIO DO SISTEMA (sempre visível no fundo) ═══ */}
        <View style={[s.card, { borderColor: "#1e3a5f", backgroundColor: "#060d1a" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Feather name="info" size={15} color={ACCENT} />
            <Text style={[s.sectionLabel, { color: ACCENT, letterSpacing: 0.5 }]}>RELATÓRIO DO SISTEMA</Text>
          </View>
          <Text style={[s.hint, { color: MUTED, lineHeight: 17 }]}>
            Gera um documento completo com todas as capacidades, limitações, formatos suportados e instruções de uso do APK Builder.
          </Text>
          <Pressable
            onPress={generateSystemReport}
            style={({ pressed }) => [s.btn, { backgroundColor: "#1e3a5f", opacity: pressed ? 0.85 : 1, marginTop: 4 }]}
          >
            <Feather name="file-text" size={16} color={ACCENT} />
            <Text style={[s.btnText, { color: ACCENT }]}>Gerar e compartilhar relatório</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 14, gap: 10 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: WHITE, letterSpacing: -0.5 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 14, gap: 6 },
  successCard: { borderColor: "#166534", backgroundColor: "#052e16" },
  errorCard: { borderColor: "#7f1d1d", backgroundColor: "#1c0505" },
  infoCard: { borderColor: "#1e3a5f", backgroundColor: "#060d1a" },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED, marginBottom: 3 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: WHITE },
  input: {
    backgroundColor: "#0a0f1e", borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 13, fontFamily: "Inter_400Regular", color: WHITE,
  },
  btn: {
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 13,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4,
  },
  btnDisabled: { backgroundColor: "#1e293b" },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  tabGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, backgroundColor: "#0a0f1e",
    flex: 1, justifyContent: "center", minWidth: "45%",
  },
  tabBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  tabTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggle: {
    flex: 1, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, backgroundColor: "#0a0f1e", alignItems: "center",
  },
  toggleActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  toggleTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED },
  toggleSwitchRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 6,
  },
  repoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER },
  repoIcon: { fontSize: 16 },
  repoName: { fontSize: 14, fontFamily: "Inter_500Medium", color: WHITE },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  statusBox: { backgroundColor: "#060d1a", borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, marginBottom: 8 },
  miniBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#052e16", alignItems: "center", justifyContent: "center" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  actionBtnTxt: { fontSize: 12, fontFamily: "Inter_500Medium" },
  treeRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: BORDER + "55" },
  treeName: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: WHITE },
});
