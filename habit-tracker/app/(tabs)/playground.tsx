import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as _FileSystem from "expo-file-system";
const FileSystem = _FileSystem as any;
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import React, { useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator, Alert, Clipboard, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProject } from "@/context/ProjectContext";
import { DEFAULT_CFG } from "@/context/ProjectContext";
import { extractArchive, guessConfig, decodeFileToText } from "@/lib/archive";
import { ghCreateRepo, ghPushFiles, ghImportRepo } from "@/lib/github";
import JSZip from "jszip";

const BG = "#080c18";
const CARD = "#0f1629";
const BORDER = "#1e293b";
const ACCENT = "#6366f1";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";
const GREEN = "#4ade80";
const RED = "#f87171";
const YELLOW = "#fbbf24";
const CODE_BG = "#050810";

const FILE_ICONS: Record<string, string> = {
  html: "🌐", css: "🎨", scss: "🎨", js: "⚡", ts: "🔷", jsx: "⚛️", tsx: "⚛️",
  json: "📋", md: "📝", txt: "📄", py: "🐍", go: "🐹", rs: "🦀",
  java: "☕", kt: "🟪", swift: "🍎", sh: "⚙️", yaml: "⚙️", yml: "⚙️",
  toml: "⚙️", env: "🔐", lock: "🔒", png: "🖼️", jpg: "🖼️", svg: "🖼️",
  gif: "🖼️", ico: "🖼️", woff: "🔤", woff2: "🔤", ttf: "🔤",
};

function fileIcon(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? "📄";
}

interface TreeNode { name: string; path: string; isDir: boolean; children?: TreeNode[]; }

function buildTree(files: { path: string }[]): TreeNode[] {
  function make(prefix: string): TreeNode[] {
    const sep = prefix ? prefix + "/" : "";
    const seen = new Set<string>();
    const nodes: TreeNode[] = [];
    for (const f of files) {
      const rel = f.path.startsWith("/") ? f.path.slice(1) : f.path;
      if (!rel.startsWith(sep)) continue;
      const rest = rel.slice(sep.length);
      const parts = rest.split("/");
      const name = parts[0];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (parts.length === 1) nodes.push({ name, path: f.path, isDir: false });
      else nodes.push({ name, path: sep + name, isDir: true, children: make(sep + name) });
    }
    nodes.sort((a, b) => a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name));
    return nodes;
  }
  return make("");
}

function TreeItem({ node, depth, selectedPath, onSelect, expanded, toggleExpand }: {
  node: TreeNode; depth: number; selectedPath: string;
  onSelect: (p: string) => void;
  expanded: Set<string>; toggleExpand: (p: string) => void;
}) {
  const isExpanded = expanded.has(node.path);
  const isSel = selectedPath === node.path;
  return (
    <>
      <Pressable
        onPress={() => node.isDir ? toggleExpand(node.path) : onSelect(node.path)}
        style={[tr.item, isSel && { backgroundColor: ACCENT + "22" }]}
      >
        <View style={{ width: depth * 14 }} />
        {node.isDir
          ? <Feather name={isExpanded ? "chevron-down" : "chevron-right"} size={13} color={MUTED} />
          : <Text style={{ fontSize: 13, width: 18 }}>{fileIcon(node.name)}</Text>}
        <Text style={[tr.name, node.isDir && { color: "#a5b4fc" }, isSel && { color: ACCENT }]} numberOfLines={1}>
          {node.isDir ? " " : " "}{node.name}
        </Text>
        {!node.isDir && (
          <Pressable onPress={() => onSelect(node.path)} style={{ padding: 4 }}>
            <Feather name="eye" size={11} color={isSel ? ACCENT : MUTED} />
          </Pressable>
        )}
      </Pressable>
      {node.isDir && isExpanded && node.children?.map(c => (
        <TreeItem key={c.path} node={c} depth={depth + 1}
          selectedPath={selectedPath} onSelect={onSelect}
          expanded={expanded} toggleExpand={toggleExpand} />
      ))}
    </>
  );
}

// ── FILE VIEWER MODAL ─────────────────────────────────────────────────────────
function FileViewerModal({ visible, filePath, content, onClose }: {
  visible: boolean; filePath: string; content: string; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[fv.root, { paddingTop: insets.top + 12 }]}>
        <View style={fv.header}>
          <View style={{ flex: 1 }}>
            <Text style={fv.title} numberOfLines={1}>{fileIcon(filePath)} {filePath.split("/").pop()}</Text>
            <Text style={[fv.hint, { color: MUTED }]}>{filePath}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => { Clipboard.setString(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={fv.btn}>
              <Feather name={copied ? "check" : "copy"} size={14} color={copied ? GREEN : WHITE} />
              <Text style={[fv.btnTxt, copied && { color: GREEN }]}>{copied ? "Copiado!" : "Copiar"}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[fv.btn, { backgroundColor: "#1a2540" }]}>
              <Feather name="x" size={18} color={WHITE} />
            </Pressable>
          </View>
        </View>
        {isImage ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <Text style={{ fontSize: 60, marginBottom: 16 }}>🖼️</Text>
            <Text style={[fv.hint, { color: MUTED, textAlign: "center" }]}>Imagem binária — não pode ser visualizada como texto.</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text selectable style={fv.code}>{content || "(arquivo vazio)"}</Text>
            </ScrollView>
          </ScrollView>
        )}
        <View style={[fv.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={[fv.hint, { color: MUTED }]}>{content.length} chars · {ext.toUpperCase()}</Text>
        </View>
      </View>
    </Modal>
  );
}

// ── PUSH MODAL ────────────────────────────────────────────────────────────────
function PushModal({ visible, onClose, mode, ghToken, files, source }: {
  visible: boolean; onClose: () => void;
  mode: "vscode" | "publish" | "push";
  ghToken: string; files: Array<{ path: string; data: string }>; source: string;
}) {
  const insets = useSafeAreaInsets();
  const [repoName, setRepoName] = useState("");
  const [branch, setBranch] = useState("main");
  const [isPrivate, setIsPrivate] = useState(false);
  const [pages, setPages] = useState(mode === "publish");
  const [msg, setMsg] = useState("");
  const [pushing, setPushing] = useState(false);
  const [done, setDone] = useState(false);
  const [pushedOwner, setPushedOwner] = useState("");
  const [pushedRepo, setPushedRepo] = useState("");

  const title = mode === "vscode" ? "Abrir no VS Code" : mode === "publish" ? "Publicar como App" : "Enviar ao GitHub";
  const btnColor = mode === "vscode" ? "#1e3a5f" : mode === "publish" ? "#166534" : ACCENT;
  const btnTxt = mode === "vscode" ? "Subir e Abrir VS Code" : mode === "publish" ? "Publicar no GitHub Pages" : "Criar repositório e enviar";

  async function doPush() {
    if (!repoName.trim()) { Alert.alert("Nome obrigatório", "Digite o nome do repositório."); return; }
    if (!ghToken) { Alert.alert("Token GitHub necessário", "Configure seu token na aba Config."); return; }
    if (!files.length) { Alert.alert("Sem arquivos", "Importe um projeto primeiro."); return; }
    setPushing(true); setMsg("Criando repositório..."); setDone(false);
    try {
      const repo = await ghCreateRepo(ghToken, repoName.trim(), `Criado pelo APK Builder · ${source}`, isPrivate);
      const [owner, rname] = repo.full_name.split("/");
      setMsg(`Enviando ${files.length} arquivos (sem exceção)...`);
      await ghPushFiles(ghToken, owner, rname, files, `APK Builder: ${source}`, (progress) => setMsg(progress));

      if (pages) {
        setMsg("Ativando GitHub Pages...");
        await fetch(`https://api.github.com/repos/${owner}/${rname}/pages`, {
          method: "POST",
          headers: { Authorization: `token ${ghToken}`, "Content-Type": "application/json", Accept: "application/vnd.github+json" },
          body: JSON.stringify({ source: { branch, path: "/" } }),
        });
      }

      setPushedOwner(owner); setPushedRepo(rname);
      setMsg(`✅ ${files.length} arquivos enviados!${pages ? `\n🌐 App: https://${owner}.github.io/${rname}/` : ""}`);
      setDone(true);

      if (mode === "vscode") {
        setTimeout(() => Linking.openURL(`https://vscode.dev/github/${owner}/${rname}`), 800);
      }
    } catch (e) {
      setMsg("❌ " + String(e));
    } finally {
      setPushing(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[fv.root, { paddingTop: insets.top + 12 }]}>
        <View style={fv.header}>
          <Text style={fv.title}>{title}</Text>
          <Pressable onPress={onClose} style={[fv.btn, { backgroundColor: "#1a2540" }]}>
            <Feather name="x" size={18} color={WHITE} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>NOME DO REPOSITÓRIO</Text>
          <TextInput style={s.input} value={repoName} onChangeText={setRepoName}
            placeholder="meu-projeto" placeholderTextColor={MUTED}
            autoCapitalize="none" autoCorrect={false} />

          <Text style={s.fieldLabel}>BRANCH</Text>
          <TextInput style={s.input} value={branch} onChangeText={setBranch}
            placeholder="main" placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} />

          <Pressable onPress={() => setIsPrivate(v => !v)} style={[s.toggleRow, { marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>REPOSITÓRIO PRIVADO</Text>
              <Text style={[fv.hint, { color: MUTED }]}>Apenas você poderá ver</Text>
            </View>
            <View style={[s.toggle, isPrivate && s.toggleOn]}>
              <View style={[s.toggleKnob, isPrivate && s.toggleKnobOn]} />
            </View>
          </Pressable>

          {(mode === "publish") && (
            <Pressable onPress={() => setPages(v => !v)} style={[s.toggleRow, { marginBottom: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>GITHUB PAGES</Text>
                <Text style={[fv.hint, { color: MUTED }]}>Publica como site web</Text>
              </View>
              <View style={[s.toggle, pages && s.toggleOn]}>
                <View style={[s.toggleKnob, pages && s.toggleKnobOn]} />
              </View>
            </Pressable>
          )}

          <View style={{ backgroundColor: "#060d1a", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#1e3a5f" }}>
            <Text style={[fv.hint, { color: "#60a5fa" }]}>
              📦 {files.length} arquivos serão enviados — TODOS, sem exceção, sem apagar nada
            </Text>
          </View>

          {msg !== "" && (
            <View style={{ backgroundColor: msg.startsWith("✅") ? "#052e16" : msg.startsWith("❌") ? "#1c0505" : "#0a1628", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: msg.startsWith("✅") ? "#166534" : msg.startsWith("❌") ? "#7f1d1d" : "#1e3a5f" }}>
              <Text style={{ color: msg.startsWith("✅") ? GREEN : msg.startsWith("❌") ? RED : WHITE, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 20 }}>{msg}</Text>
            </View>
          )}

          {done && pushedOwner && (
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => Linking.openURL(`https://github.com/${pushedOwner}/${pushedRepo}`)}
                style={[s.actionBtn, { backgroundColor: "#1a2a1a" }]}>
                <Feather name="github" size={16} color={GREEN} />
                <Text style={[s.actionBtnTxt, { color: GREEN }]}>Abrir no GitHub</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(`https://vscode.dev/github/${pushedOwner}/${pushedRepo}`)}
                style={[s.actionBtn, { backgroundColor: "#1e3a5f" }]}>
                <Feather name="code" size={16} color="#60a5fa" />
                <Text style={[s.actionBtnTxt, { color: "#60a5fa" }]}>Abrir no VS Code Web</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(`https://github.dev/${pushedOwner}/${pushedRepo}`)}
                style={[s.actionBtn, { backgroundColor: "#1e2a40" }]}>
                <Feather name="edit-2" size={16} color="#a5b4fc" />
                <Text style={[s.actionBtnTxt, { color: "#a5b4fc" }]}>Abrir no github.dev</Text>
              </Pressable>
              {pages && (
                <Pressable onPress={() => Linking.openURL(`https://${pushedOwner}.github.io/${pushedRepo}/`)}
                  style={[s.actionBtn, { backgroundColor: "#052e16" }]}>
                  <Feather name="globe" size={16} color={GREEN} />
                  <Text style={[s.actionBtnTxt, { color: GREEN }]}>Abrir App Publicado 🌐</Text>
                </Pressable>
              )}
            </View>
          )}

          {!done && (
            <Pressable onPress={doPush} disabled={pushing}
              style={[s.actionBtn, { backgroundColor: pushing ? "#1e293b" : btnColor }]}>
              {pushing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="upload-cloud" size={16} color="#fff" />}
              <Text style={s.actionBtnTxt}>{pushing ? "Enviando..." : btnTxt}</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── MAIN PLAYGROUND ───────────────────────────────────────────────────────────
type PGTab = "import" | "tree";

export default function PlaygroundScreen() {
  const insets = useSafeAreaInsets();
  const { files, source, projectReady, ghToken, setFiles, setCfg, setSource, setProjectReady, setResult } = useProject();

  const [pgTab, setPgTab] = useState<PGTab>("import");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");

  // GitHub import
  const [ghRepo, setGhRepo] = useState("");
  const [ghLoading, setGhLoading] = useState(false);
  const [ghMsg, setGhMsg] = useState("");

  // File tree
  const [selectedPath, setSelectedPath] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerContent, setViewerContent] = useState("");
  const [search, setSearch] = useState("");

  // Push modal
  const [pushMode, setPushMode] = useState<"vscode" | "publish" | "push">("push");
  const [pushVisible, setPushVisible] = useState(false);

  const nodes = useMemo(() => buildTree(files), [files]);

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter(f => f.path.toLowerCase().includes(q));
  }, [files, search]);

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes;
    return buildTree(filteredFiles);
  }, [filteredFiles, search, nodes]);

  function toggleExpand(path: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  }

  function openFile(path: string) {
    setSelectedPath(path);
    const file = files.find(f => f.path === path);
    if (!file) return;
    setViewerContent(decodeFileToText(file.data));
    setViewerVisible(true);
  }

  async function handlePickZip() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-tar", "application/gzip", "application/x-gzip", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setLoading(true); setLoadMsg(`📦 Lendo ${asset.name}...`);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setLoadMsg("🔍 Extraindo arquivos...");
      const extracted = await extractArchive(base64, asset.name);
      const { name, id } = guessConfig(extracted, asset.name);
      setCfg(prev => ({ ...DEFAULT_CFG, ...prev, appName: name, appId: id }));
      setFiles(extracted);
      setSource(`Arquivo: ${asset.name}`);
      setProjectReady(true);
      setResult("", "");
      setLoadMsg(`✅ ${extracted.length} arquivos carregados!`);
      setPgTab("tree");
      setExpanded(new Set());
    } catch (e) {
      setLoadMsg("❌ " + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleGhImport() {
    const raw = ghRepo.trim();
    if (!raw) { Alert.alert("Digite o repositório", "Formato: usuario/repo ou URL completa do GitHub"); return; }
    if (!ghToken) { Alert.alert("Token necessário", "Configure o token GitHub na aba Config."); return; }

    let owner = "", repo = "";
    const match = raw.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) { owner = match[1]; repo = match[2].replace(/\.git$/, ""); }
    else {
      const parts = raw.split("/");
      if (parts.length >= 2) { owner = parts[0]; repo = parts[1].replace(/\.git$/, ""); }
      else { Alert.alert("Formato inválido", "Use: usuario/repositorio"); return; }
    }

    setGhLoading(true);
    setGhMsg(`📥 Baixando árvore de ${owner}/${repo}...`);
    try {
      const repoFiles = await ghImportRepo(ghToken, owner, repo, "main", (p) => setGhMsg(`📥 ${p}`));
      const { name, id } = guessConfig(repoFiles, repo);
      setCfg(prev => ({ ...DEFAULT_CFG, ...prev, appName: name, appId: id }));
      setFiles(repoFiles);
      setSource(`GitHub: ${owner}/${repo}`);
      setProjectReady(true);
      setResult("", "");
      setGhMsg(`✅ ${repoFiles.length} arquivos baixados!`);
      setPgTab("tree");
      setExpanded(new Set());
    } catch (e) {
      setGhMsg("❌ " + String(e));
    } finally {
      setGhLoading(false);
    }
  }

  async function exportZip() {
    if (!files.length) return;
    try {
      const zip = new JSZip();
      for (const f of files) {
        const filePath = f.path.replace(/^\//, "");
        if (!filePath) continue;
        if (f.data) zip.file(filePath, f.data, { base64: true });
        else zip.file(filePath, "");
      }

      if (Platform.OS === "web") {
        // No browser: gera Blob e faz download direto
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "projeto-exportado.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        // No celular: salva em cache e abre compartilhamento
        const b64 = await zip.generateAsync({ type: "base64" });
        const dir = FileSystem.cacheDirectory;
        if (!dir) throw new Error("Cache directory não disponível");
        const outPath = dir + "projeto-exportado.zip";
        await FileSystem.writeAsStringAsync(outPath, b64, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) throw new Error("Compartilhamento não disponível neste dispositivo");
        await Sharing.shareAsync(outPath, { mimeType: "application/zip", dialogTitle: "Exportar projeto ZIP" });
      }
    } catch (e) { Alert.alert("Erro ao exportar ZIP", String(e)); }
  }

  function openPush(mode: "vscode" | "publish" | "push") {
    if (!files.length) { Alert.alert("Sem projeto", "Importe um projeto primeiro."); return; }
    setPushMode(mode); setPushVisible(true);
  }

  return (
    <View style={[s.root, { backgroundColor: BG }]}>
      <FileViewerModal
        visible={viewerVisible}
        filePath={selectedPath}
        content={viewerContent}
        onClose={() => setViewerVisible(false)}
      />
      <PushModal
        visible={pushVisible}
        onClose={() => setPushVisible(false)}
        mode={pushMode}
        ghToken={ghToken}
        files={files}
        source={source}
      />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={s.title}>🎮 Playground</Text>
            <View style={{ backgroundColor: "#3b1d8a", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#6366f133" }}>
              <Text style={{ fontSize: 9, color: "#a5b4fc", fontFamily: "Inter_600SemiBold" }}>v1.5</Text>
            </View>
          </View>
          <Text style={[s.hint, { color: MUTED }]}>
            {projectReady ? `${files.length} arquivos · ${source}` : "Importe um projeto para começar"}
          </Text>
        </View>
        {projectReady && (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable onPress={exportZip} style={s.headerBtn}>
              <Feather name="download" size={15} color={WHITE} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Sub-tabs */}
      <View style={s.subTabs}>
        {([["import", "📥 Importar"], ["tree", `🌳 Árvore${files.length ? ` (${files.length})` : ""}`]] as const).map(([id, label]) => (
          <Pressable key={id} onPress={() => setPgTab(id)}
            style={[s.subTab, pgTab === id && s.subTabActive]}>
            <Text style={[s.subTabTxt, pgTab === id && { color: "#fff" }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── IMPORT TAB ─────────────────────────────────────────── */}
      {pgTab === "import" && (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">

          {/* ZIP / File import */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>IMPORTAR ARQUIVO COMPACTADO</Text>
            <Pressable onPress={handlePickZip} disabled={loading}
              style={({ pressed }) => [s.dropZone, projectReady && s.dropLoaded, pressed && { opacity: 0.8 }]}>
              {loading ? (
                <View style={{ alignItems: "center", gap: 10 }}>
                  <ActivityIndicator size="large" color={ACCENT} />
                  <Text style={[s.hint, { color: ACCENT }]}>{loadMsg}</Text>
                </View>
              ) : projectReady ? (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Feather name="check-circle" size={38} color={GREEN} />
                  <Text style={[s.dropTitle, { color: GREEN }]}>Projeto carregado!</Text>
                  <Text style={[s.hint, { color: MUTED }]}>{source}</Text>
                  <Text style={[s.hint, { color: MUTED }]}>{files.length} arquivos · toque para reimportar</Text>
                </View>
              ) : (
                <View style={{ alignItems: "center", gap: 8 }}>
                  <Feather name="upload-cloud" size={42} color={ACCENT} />
                  <Text style={s.dropTitle}>Toque para importar</Text>
                  <Text style={[s.hint, { color: MUTED, textAlign: "center" }]}>Selecione um arquivo do gerenciador</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    {[".zip", ".tar", ".tar.gz", ".tgz"].map(f => (
                      <View key={f} style={s.fmtBadge}><Text style={s.fmtTxt}>{f}</Text></View>
                    ))}
                  </View>
                </View>
              )}
            </Pressable>
            {loadMsg !== "" && !loading && (
              <Text style={[s.hint, { color: loadMsg.startsWith("✅") ? GREEN : loadMsg.startsWith("❌") ? RED : WHITE }]}>
                {loadMsg}
              </Text>
            )}
          </View>

          {/* GitHub import */}
          <View style={s.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 20 }}>🐙</Text>
              <Text style={s.sectionLabel}>IMPORTAR DO GITHUB</Text>
              {!ghToken && (
                <View style={[s.fmtBadge, { backgroundColor: YELLOW + "22", borderColor: YELLOW + "44" }]}>
                  <Text style={{ fontSize: 9, color: YELLOW }}>Token em Config</Text>
                </View>
              )}
            </View>
            <TextInput style={s.input} value={ghRepo} onChangeText={setGhRepo}
              placeholder="usuario/repositorio ou URL completa do GitHub"
              placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false}
              onSubmitEditing={handleGhImport} returnKeyType="done" />
            <Pressable onPress={handleGhImport} disabled={ghLoading || !ghRepo.trim()}
              style={[s.actionBtn, { backgroundColor: ghLoading ? "#1e293b" : "#1a2a1a" }]}>
              {ghLoading ? <ActivityIndicator size="small" color={GREEN} /> : <Feather name="download" size={15} color={GREEN} />}
              <Text style={[s.actionBtnTxt, { color: GREEN }]}>
                {ghLoading ? "Baixando árvore completa..." : "Baixar repositório completo"}
              </Text>
            </Pressable>
            {ghMsg !== "" && (
              <Text style={[s.hint, { color: ghMsg.startsWith("✅") ? GREEN : ghMsg.startsWith("❌") ? RED : "#60a5fa" }]}>
                {ghMsg}
              </Text>
            )}
          </View>

          {/* Quick actions if project loaded */}
          {projectReady && (
            <View style={s.card}>
              <Text style={s.sectionLabel}>AÇÕES RÁPIDAS</Text>
              <View style={{ gap: 8 }}>
                <Pressable onPress={() => setPgTab("tree")} style={[s.actionBtn, { backgroundColor: "#1e2a4a" }]}>
                  <Feather name="folder" size={15} color={ACCENT} />
                  <Text style={[s.actionBtnTxt, { color: ACCENT }]}>Ver árvore de arquivos</Text>
                </Pressable>
                <Pressable onPress={() => openPush("push")} style={[s.actionBtn, { backgroundColor: "#1a2a1a" }]}>
                  <Feather name="github" size={15} color={GREEN} />
                  <Text style={[s.actionBtnTxt, { color: GREEN }]}>Enviar para GitHub</Text>
                </Pressable>
                <Pressable onPress={() => openPush("publish")} style={[s.actionBtn, { backgroundColor: "#052e16" }]}>
                  <Feather name="globe" size={15} color={GREEN} />
                  <Text style={[s.actionBtnTxt, { color: GREEN }]}>Publicar como App (Pages)</Text>
                </Pressable>
                <Pressable onPress={() => openPush("vscode")} style={[s.actionBtn, { backgroundColor: "#1e3a5f" }]}>
                  <Feather name="code" size={15} color="#60a5fa" />
                  <Text style={[s.actionBtnTxt, { color: "#60a5fa" }]}>Abrir no VS Code Web</Text>
                </Pressable>
                <Pressable onPress={exportZip} style={[s.actionBtn, { backgroundColor: "#1a1a2e" }]}>
                  <Feather name="download" size={15} color="#a5b4fc" />
                  <Text style={[s.actionBtnTxt, { color: "#a5b4fc" }]}>Exportar ZIP completo</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── TREE TAB ───────────────────────────────────────────── */}
      {pgTab === "tree" && (
        <View style={{ flex: 1 }}>
          {files.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
              <Text style={{ fontSize: 48 }}>📂</Text>
              <Text style={[s.dropTitle, { color: MUTED }]}>Nenhum projeto importado</Text>
              <Pressable onPress={() => setPgTab("import")} style={[s.actionBtn, { backgroundColor: ACCENT }]}>
                <Feather name="upload" size={15} color="#fff" />
                <Text style={s.actionBtnTxt}>Importar projeto</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Search + actions */}
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <TextInput style={[s.input, { marginBottom: 0 }]}
                  value={search} onChangeText={setSearch}
                  placeholder={`Buscar em ${files.length} arquivos...`}
                  placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable onPress={() => openPush("push")} style={s.treeBtn}>
                      <Feather name="github" size={13} color={GREEN} />
                      <Text style={[s.treeBtnTxt, { color: GREEN }]}>GitHub</Text>
                    </Pressable>
                    <Pressable onPress={() => openPush("publish")} style={s.treeBtn}>
                      <Feather name="globe" size={13} color="#22d3ee" />
                      <Text style={[s.treeBtnTxt, { color: "#22d3ee" }]}>Publicar</Text>
                    </Pressable>
                    <Pressable onPress={() => openPush("vscode")} style={s.treeBtn}>
                      <Feather name="code" size={13} color="#60a5fa" />
                      <Text style={[s.treeBtnTxt, { color: "#60a5fa" }]}>VS Code</Text>
                    </Pressable>
                    <Pressable onPress={exportZip} style={s.treeBtn}>
                      <Feather name="download" size={13} color={WHITE} />
                      <Text style={s.treeBtnTxt}>ZIP</Text>
                    </Pressable>
                    <Pressable onPress={() => setExpanded(new Set(files.map(f => f.path.split("/").slice(0, -1).join("/"))))} style={s.treeBtn}>
                      <Feather name="maximize-2" size={13} color={MUTED} />
                      <Text style={s.treeBtnTxt}>Expandir</Text>
                    </Pressable>
                    <Pressable onPress={() => setExpanded(new Set())} style={s.treeBtn}>
                      <Feather name="minimize-2" size={13} color={MUTED} />
                      <Text style={s.treeBtnTxt}>Recolher</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>

              {/* Tree */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                showsVerticalScrollIndicator={false}>
                {filteredNodes.map(node => (
                  <TreeItem key={node.path} node={node} depth={0}
                    selectedPath={selectedPath} onSelect={openFile}
                    expanded={expanded} toggleExpand={toggleExpand} />
                ))}
                {filteredFiles.length === 0 && search.trim() && (
                  <View style={{ padding: 24, alignItems: "center" }}>
                    <Text style={[s.hint, { color: MUTED }]}>Nenhum arquivo encontrado para "{search}"</Text>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: CARD, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BORDER },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: WHITE },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16 },
  subTabs: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  subTab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  subTabActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  subTabTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: MUTED },
  content: { paddingHorizontal: 12, paddingTop: 12, gap: 10 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 14, gap: 10 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8 },
  fieldLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8, marginBottom: 4 },
  dropZone: { borderWidth: 2, borderStyle: "dashed", borderColor: BORDER, borderRadius: 16, padding: 32, alignItems: "center", justifyContent: "center", minHeight: 160, gap: 8 },
  dropLoaded: { borderStyle: "solid", borderColor: "#166534", backgroundColor: "#052e16" },
  dropTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: WHITE, textAlign: "center" },
  fmtBadge: { backgroundColor: "#1e293b", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#1e3a5f" },
  fmtTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#a5b4fc" },
  input: { backgroundColor: "#06091a", borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular", color: WHITE },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  actionBtnTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  treeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  treeBtnTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: WHITE },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 6 },
  toggle: { width: 46, height: 26, borderRadius: 13, backgroundColor: "#1e293b", justifyContent: "center", paddingHorizontal: 2 },
  toggleOn: { backgroundColor: ACCENT },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#64748b" },
  toggleKnobOn: { backgroundColor: "#fff", transform: [{ translateX: 20 }] },
});

const tr = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 12, gap: 4, borderBottomWidth: 1, borderBottomColor: "#0d1526" },
  name: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: WHITE },
});

const fv = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 10 },
  title: { fontSize: 15, fontFamily: "Inter_700Bold", color: WHITE },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  btnTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: WHITE },
  code: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, color: "#e2e8f0", lineHeight: 18 },
  footer: { borderTopWidth: 1, borderTopColor: BORDER, padding: 10, paddingHorizontal: 16 },
});
