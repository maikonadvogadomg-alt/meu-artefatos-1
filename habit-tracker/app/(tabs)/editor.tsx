import { Feather } from "@expo/vector-icons";
import * as _FileSystem from "expo-file-system";
const FileSystem = _FileSystem as any;
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator, Alert, Clipboard, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProject } from "@/context/ProjectContext";
import { ghCreateRepo, ghPushFiles } from "@/lib/github";
import JSZip from "jszip";

const BG = "#080c18";
const CARD = "#0f1629";
const BORDER = "#1e293b";
const ACCENT = "#6366f1";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";
const GREEN = "#4ade80";
const RED = "#f87171";
const CODE_BG = "#050810";

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const icons: Record<string, string> = {
    ts: "🔷", tsx: "⚛️", js: "🟨", jsx: "⚛️", json: "📋", html: "🌐",
    css: "🎨", scss: "🎨", md: "📝", txt: "📄", py: "🐍", go: "🐹",
    rs: "🦀", java: "☕", kt: "🟪", swift: "🍎", svg: "🖼️",
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", webp: "🖼️",
    sh: "⚙️", yaml: "⚙️", yml: "⚙️", toml: "⚙️", env: "🔐",
  };
  return <Text style={{ fontSize: 14 }}>{icons[ext] ?? "📄"}</Text>;
}

interface TreeNode {
  name: string; path: string; isDir: boolean; children?: TreeNode[];
}

function buildNodes(files: { path: string; data: string }[]): TreeNode[] {
  function makeNodes(prefix: string): TreeNode[] {
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
      if (parts.length === 1) {
        nodes.push({ name, path: f.path, isDir: false });
      } else {
        nodes.push({ name, path: sep + name, isDir: true, children: makeNodes(sep + name) });
      }
    }
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }
  return makeNodes("");
}

function TreeItem({ node, depth, selectedPath, onSelect, expandedPaths, toggleExpand }: {
  node: TreeNode; depth: number; selectedPath: string;
  onSelect: (p: string) => void;
  expandedPaths: Set<string>; toggleExpand: (p: string) => void;
}) {
  const expanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  return (
    <>
      <Pressable
        onPress={() => { if (node.isDir) toggleExpand(node.path); else onSelect(node.path); }}
        style={[st.treeItem, isSelected && { backgroundColor: ACCENT + "22" }]}
      >
        <View style={{ width: depth * 14 }} />
        {node.isDir
          ? <Feather name={expanded ? "chevron-down" : "chevron-right"} size={13} color={MUTED} />
          : <FileIcon name={node.name} />}
        <Text style={[st.treeName, node.isDir && { color: "#a5b4fc" }, isSelected && { color: ACCENT }]} numberOfLines={1}>
          {node.isDir ? "  " : " "}{node.name}
        </Text>
      </Pressable>
      {node.isDir && expanded && node.children?.map(c => (
        <TreeItem key={c.path} node={c} depth={depth + 1}
          selectedPath={selectedPath} onSelect={onSelect}
          expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
      ))}
    </>
  );
}

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const { files, ghToken, source } = useProject();
  const [selectedPath, setSelectedPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [viewerOpen, setViewerOpen] = useState(false);

  // Push / publish state
  const [pushModal, setPushModal] = useState(false);
  const [publishMode, setPublishMode] = useState(false); // true = publish as app
  const [repoName, setRepoName] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(false);
  const [githubPages, setGithubPages] = useState(false);
  const [openVsCode, setOpenVsCode] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushedUrl, setPushedUrl] = useState("");
  const [pushedOwner, setPushedOwner] = useState("");
  const [pushedRepo, setPushedRepo] = useState("");

  const nodes = useMemo(() => buildNodes(files), [files]);

  function toggleExpand(path: string) {
    setExpandedPaths(prev => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  }

  const selectedFile = files.find(f => f.path === selectedPath);
  const fileContent = useMemo(() => {
    if (!selectedFile) return "";
    try { return atob(selectedFile.data); } catch { return selectedFile.data; }
  }, [selectedFile]);

  const ext = selectedPath.split(".").pop()?.toLowerCase() ?? "";
  const ghMatch = source?.match(/GitHub:\s*([\w.-]+)\/([\w.-]+)/);

  function openVSCode() {
    if (ghMatch) {
      Linking.openURL(`https://vscode.dev/github/${ghMatch[1]}/${ghMatch[2]}`);
    } else if (pushedOwner && pushedRepo) {
      Linking.openURL(`https://vscode.dev/github/${pushedOwner}/${pushedRepo}`);
    } else {
      setOpenVsCode(true);
      setPublishMode(false);
      setPushModal(true);
    }
  }

  function openGithubDev() {
    if (ghMatch) {
      Linking.openURL(`https://github.dev/${ghMatch[1]}/${ghMatch[2]}`);
    } else if (pushedOwner && pushedRepo) {
      Linking.openURL(`https://github.dev/${pushedOwner}/${pushedRepo}`);
    } else {
      setOpenVsCode(true);
      setPublishMode(false);
      setPushModal(true);
    }
  }

  function openPublishModal() {
    setPublishMode(true);
    setGithubPages(true);
    setOpenVsCode(false);
    setPushModal(true);
  }

  async function doPush() {
    if (!repoName.trim()) { Alert.alert("Nome obrigatório", "Digite um nome para o repositório."); return; }
    if (!ghToken) { Alert.alert("Token GitHub necessário", "Vá na aba GitHub e cole seu token."); return; }
    if (!files.length) { Alert.alert("Sem arquivos", "Importe um projeto primeiro."); return; }
    setPushing(true); setPushMsg("Criando repositório..."); setPushedUrl(""); setPushedOwner(""); setPushedRepo("");
    try {
      const desc = publishMode ? `App publicado pelo APK Builder · ${source || ""}` : `Criado pelo APK Builder · ${source || ""}`;
      const repo = await ghCreateRepo(ghToken, repoName.trim(), desc, repoPrivate);
      setPushMsg(`Enviando ${files.length} arquivos...`);
      const [owner, rname] = repo.full_name.split("/");
      await ghPushFiles(ghToken, owner, rname, files, "Initial commit via APK Builder", setPushMsg);
      setPushedOwner(owner); setPushedRepo(rname);

      if (githubPages || publishMode) {
        setPushMsg("Habilitando GitHub Pages...");
        await fetch(`https://api.github.com/repos/${owner}/${rname}/pages`, {
          method: "POST",
          headers: { Authorization: `token ${ghToken}`, "Content-Type": "application/json", Accept: "application/vnd.github+json" },
          body: JSON.stringify({ source: { branch: "main", path: "/" } }),
        });
        const pagesUrl = `https://${owner}.github.io/${rname}`;
        setPushedUrl(pagesUrl);
        setPushMsg(`✅ Publicado como app!\n${pagesUrl}`);
      } else {
        setPushedUrl(repo.html_url);
        setPushMsg(`✅ Push concluído!\n${repo.html_url}`);
      }

      if (openVsCode) {
        setTimeout(() => Linking.openURL(`https://github.dev/${owner}/${rname}`), 1500);
      }
    } catch (e) {
      setPushMsg("❌ " + String(e));
    } finally {
      setPushing(false);
    }
  }

  async function exportZip() {
    if (!files.length) return;
    const zip = new JSZip();
    for (const f of files) zip.file(f.path.replace(/^\//, ""), f.data, { base64: true });
    const b64 = await zip.generateAsync({ type: "base64" });
    const path = (FileSystem.cacheDirectory ?? "") + "projeto.zip";
    await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(path, { mimeType: "application/zip", dialogTitle: "Exportar projeto completo" });
  }

  if (!files.length) {
    return (
      <View style={[st.root, { backgroundColor: BG, justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>📂</Text>
        <Text style={st.title}>Editor de Arquivos</Text>
        <Text style={[st.hint, { textAlign: "center", marginTop: 8, lineHeight: 20 }]}>
          Importe um projeto na aba{" "}
          <Text style={{ color: ACCENT }}>Importar</Text>
          {" "}ou{" "}
          <Text style={{ color: ACCENT }}>GitHub</Text>
          {" "}para ver a árvore de arquivos aqui.{"\n\n"}
          Você poderá visualizar todos os arquivos, editar no VS Code Web e publicar como app.
        </Text>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: BG }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>📂 {files.length} arquivos</Text>
          <Text style={st.sub} numberOfLines={1}>{source || "Projeto importado"}</Text>
        </View>
        <Pressable onPress={exportZip} style={[st.iconBtn, { backgroundColor: "#1e3a5f" }]}>
          <Feather name="download" size={17} color={WHITE} />
        </Pressable>
        <Pressable onPress={() => { setPublishMode(false); setOpenVsCode(false); setGithubPages(false); setPushModal(true); }}
          style={[st.iconBtn, { backgroundColor: "#1e293b" }]}>
          <Feather name="github" size={17} color={WHITE} />
        </Pressable>
      </View>

      {/* Quick Action Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.quickBar} contentContainerStyle={st.quickBarContent}>
        <Pressable onPress={openVSCode} style={[st.quickBtn, { backgroundColor: "#0d1a2e" }]}>
          <Text style={{ fontSize: 14 }}>{"</>"}</Text>
          <Text style={st.quickTxt}>VS Code Web</Text>
          <Feather name="external-link" size={11} color={MUTED} />
        </Pressable>
        <Pressable onPress={openGithubDev} style={[st.quickBtn, { backgroundColor: "#0d1a2e" }]}>
          <Feather name="github" size={14} color={WHITE} />
          <Text style={st.quickTxt}>github.dev</Text>
          <Feather name="external-link" size={11} color={MUTED} />
        </Pressable>
        <Pressable onPress={openPublishModal} style={[st.quickBtn, { backgroundColor: "#4f46e5" }]}>
          <Text style={{ fontSize: 13 }}>📡</Text>
          <Text style={[st.quickTxt, { color: "#fff" }]}>Publicar como App</Text>
        </Pressable>
        <Pressable onPress={exportZip} style={[st.quickBtn, { backgroundColor: "#0d1a2e" }]}>
          <Feather name="download" size={14} color={WHITE} />
          <Text style={st.quickTxt}>Exportar ZIP</Text>
        </Pressable>
        {(ghMatch || (pushedOwner && pushedRepo)) && (
          <Pressable onPress={() => {
            const o = ghMatch ? ghMatch[1] : pushedOwner;
            const r = ghMatch ? ghMatch[2] : pushedRepo;
            Linking.openURL(`https://github.com/${o}/${r}`);
          }} style={[st.quickBtn, { backgroundColor: "#166534" }]}>
            <Feather name="eye" size={14} color={GREEN} />
            <Text style={[st.quickTxt, { color: GREEN }]}>Ver no GitHub</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Pushed success banner */}
      {pushedUrl !== "" && (
        <Pressable onPress={() => Linking.openURL(pushedUrl)} style={st.successBanner}>
          <Feather name="check-circle" size={14} color={GREEN} />
          <Text style={[st.hint, { color: GREEN, flex: 1 }]} numberOfLines={1}>{pushedUrl}</Text>
          <Feather name="external-link" size={12} color={GREEN} />
        </Pressable>
      )}

      {/* Tree + preview */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        <ScrollView style={st.tree} showsVerticalScrollIndicator={false}>
          <Text style={st.treeHeader}>ARQUIVOS ({files.length})</Text>
          {nodes.map(n => (
            <TreeItem key={n.path} node={n} depth={0}
              selectedPath={selectedPath}
              onSelect={(p) => { setSelectedPath(p); setViewerOpen(true); }}
              expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>

        {selectedPath && (
          <View style={st.preview}>
            <View style={st.previewHeader}>
              <Text style={st.previewName} numberOfLines={1}>{selectedPath.split("/").pop()}</Text>
              <Pressable onPress={() => Clipboard.setString(fileContent)} style={st.copyBtn}>
                <Feather name="copy" size={13} color={MUTED} />
              </Pressable>
              <Pressable onPress={() => setViewerOpen(true)} style={st.copyBtn}>
                <Feather name="maximize-2" size={13} color={MUTED} />
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} horizontal showsHorizontalScrollIndicator>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={st.code} selectable>{fileContent.slice(0, 4000)}</Text>
              </ScrollView>
            </ScrollView>
          </View>
        )}
      </View>

      {/* File Viewer Modal */}
      <Modal visible={viewerOpen && !!selectedPath} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewerOpen(false)}>
        <View style={[st.root, { backgroundColor: BG, paddingTop: insets.top }]}>
          <View style={st.viewerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={st.viewerName} numberOfLines={1}>{selectedPath.split("/").pop()}</Text>
              <Text style={[st.hint, { color: MUTED }]} numberOfLines={1}>{selectedPath}</Text>
            </View>
            <Pressable onPress={() => Clipboard.setString(fileContent)} style={[st.iconBtn, { backgroundColor: "#1e293b" }]}>
              <Feather name="copy" size={15} color={WHITE} />
            </Pressable>
            <Pressable onPress={() => setViewerOpen(false)} style={[st.iconBtn, { backgroundColor: "#1e293b" }]}>
              <Feather name="x" size={17} color={WHITE} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <Text style={[st.code, { padding: 16 }]} selectable>{fileContent}</Text>
            </ScrollView>
          </ScrollView>
          <View style={[st.viewerFooter, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={st.hint}>{fileContent.length.toLocaleString()} chars · {fileContent.split("\n").length} linhas · {ext.toUpperCase()}</Text>
            <Pressable onPress={() => Clipboard.setString(fileContent)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="copy" size={12} color={ACCENT} />
              <Text style={[st.hint, { color: ACCENT }]}>Copiar tudo</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Push / Publish Modal */}
      <Modal visible={pushModal} animationType="slide" transparent onRequestClose={() => setPushModal(false)}>
        <Pressable style={st.overlay} onPress={() => { if (!pushing) setPushModal(false); }} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={st.sheetTitle}>
            {publishMode ? "📡 Publicar como App (GitHub Pages)" : openVsCode ? "🖥️ Enviar e abrir no VS Code" : "🚀 Enviar para GitHub"}
          </Text>

          {!ghToken && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1c1000", borderRadius: 10, padding: 10 }}>
              <Feather name="alert-triangle" size={13} color="#fbbf24" />
              <Text style={[st.hint, { color: "#fbbf24", flex: 1 }]}>Conecte seu token na aba GitHub primeiro</Text>
            </View>
          )}

          <Text style={[st.fieldLabel, { marginTop: 8 }]}>Nome do repositório</Text>
          <TextInput
            style={st.input} value={repoName} onChangeText={setRepoName}
            placeholder="meu-projeto-web" placeholderTextColor={MUTED}
            autoCapitalize="none" autoCorrect={false}
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setRepoPrivate(false)} style={[st.toggle, !repoPrivate && st.toggleActive]}>
              <Text style={[st.toggleTxt, !repoPrivate && { color: "#fff" }]}>🌐 Público</Text>
            </Pressable>
            <Pressable onPress={() => setRepoPrivate(true)} style={[st.toggle, repoPrivate && st.toggleActive]}>
              <Text style={[st.toggleTxt, repoPrivate && { color: "#fff" }]}>🔒 Privado</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => setGithubPages(v => !v)} style={[st.toggle, githubPages && st.toggleActive]}>
            <Text style={[st.toggleTxt, githubPages && { color: "#fff" }]}>
              📡 Publicar no GitHub Pages{githubPages ? " ✓" : ""}
            </Text>
          </Pressable>

          {githubPages && (
            <Text style={[st.hint, { color: ACCENT }]}>
              URL pública: https://[usuario].github.io/{repoName || "meu-projeto"}
            </Text>
          )}

          {openVsCode && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0d1a2e", borderRadius: 10, padding: 10 }}>
              <Feather name="info" size={13} color="#60a5fa" />
              <Text style={[st.hint, { color: "#60a5fa", flex: 1 }]}>Após o push, o github.dev abrirá automaticamente com o projeto completo</Text>
            </View>
          )}

          {pushMsg !== "" && (
            <View style={[st.statusBox,
              pushMsg.startsWith("✅") ? { borderColor: "#166534", backgroundColor: "#052e16" } :
                pushMsg.startsWith("❌") ? { borderColor: "#7f1d1d", backgroundColor: "#1c0505" } :
                  { borderColor: "#1e3a5f" }
            ]}>
              <Text style={[st.hint, { color: pushMsg.startsWith("✅") ? GREEN : pushMsg.startsWith("❌") ? RED : WHITE, lineHeight: 18 }]}>{pushMsg}</Text>
              {pushedUrl !== "" && (
                <Pressable onPress={() => Linking.openURL(pushedUrl)} style={{ marginTop: 6 }}>
                  <Text style={[st.hint, { color: ACCENT }]}>Abrir: {pushedUrl}</Text>
                </Pressable>
              )}
              {pushedOwner !== "" && (
                <Pressable onPress={() => Linking.openURL(`https://github.dev/${pushedOwner}/${pushedRepo}`)} style={{ marginTop: 4 }}>
                  <Text style={[st.hint, { color: "#60a5fa" }]}>🖥️ Abrir no VS Code (github.dev)</Text>
                </Pressable>
              )}
            </View>
          )}

          <Pressable onPress={doPush} disabled={pushing || !ghToken || !files.length}
            style={[st.pushBtn, (!ghToken || pushing || !files.length) && { backgroundColor: "#1e293b" }]}>
            {pushing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name={publishMode ? "globe" : openVsCode ? "monitor" : "upload-cloud"} size={17} color="#fff" />}
            <Text style={st.btnText}>
              {pushing ? "Enviando..." : publishMode ? "Publicar como App" : openVsCode ? "Enviar e abrir VS Code" : "Push para GitHub"}
            </Text>
          </Pressable>

          <Pressable onPress={() => { if (!pushing) setPushModal(false); }} style={{ alignItems: "center", paddingTop: 10 }}>
            <Text style={[st.hint, { color: MUTED }]}>Fechar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  title: { fontSize: 16, fontFamily: "Inter_700Bold", color: WHITE },
  sub: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 1 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  quickBar: { borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: "#060c1a" },
  quickBarContent: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  quickBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  quickTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: WHITE },
  successBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#052e16", borderBottomWidth: 1, borderBottomColor: "#166534" },
  tree: { width: 180, borderRightWidth: 1, borderRightColor: BORDER, backgroundColor: "#060c1a" },
  treeHeader: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8, paddingHorizontal: 12, paddingVertical: 8 },
  treeItem: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  treeName: { fontSize: 11, fontFamily: "Inter_400Regular", color: WHITE, flex: 1 },
  preview: { flex: 1, backgroundColor: CODE_BG },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: BORDER },
  previewName: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", color: WHITE },
  copyBtn: { padding: 5 },
  code: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11, color: "#e2e8f0", lineHeight: 17 },
  viewerHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  viewerName: { fontSize: 15, fontFamily: "Inter_700Bold", color: WHITE },
  viewerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED, marginBottom: 4 },
  input: { backgroundColor: "#0a0f1e", borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular", color: WHITE, marginBottom: 8 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: CARD, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 10 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: WHITE },
  toggle: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: "#0a0f1e", alignItems: "center" },
  toggleActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  toggleTxt: { fontSize: 13, fontFamily: "Inter_500Medium", color: MUTED },
  statusBox: { backgroundColor: "#060d1a", borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10 },
  pushBtn: { backgroundColor: ACCENT, borderRadius: 13, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
