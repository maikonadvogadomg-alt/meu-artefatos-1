import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator, Alert, Clipboard, Keyboard,
  KeyboardAvoidingView,
  Linking, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as _FileSystem from "expo-file-system";
const FileSystem = _FileSystem as any;
import * as DocumentPicker from "expo-document-picker";
import * as Speech from "expo-speech";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProject } from "@/context/ProjectContext";
import type { ChatMsg, ChatSession, ApiKey } from "@/context/ProjectContext";
import { neonQuery, formatNeonResult } from "@/lib/neon";
import { detectProvider } from "@/lib/keyDetector";

const BG = "#06090f";
const CARD = "#0d1526";
const CARD2 = "#111927";
const BORDER = "#1a2540";
const ACCENT = "#6366f1";
const GREEN = "#4ade80";
const RED = "#f87171";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";
const CODE_BG = "#050810";
const WEB_COLOR = "#22d3ee";

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"()[\]{}|\\^`]+/g) ?? [];
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return `[Erro HTTP ${res.status} em ${url}]`;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) return `[JSON de ${url}]:\n${JSON.stringify(await res.json(), null, 2).slice(0, 6000)}`;
    const plain = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ").replace(/\s{3,}/g, "\n\n").trim().slice(0, 8000);
    return `[Conteúdo de ${url}]:\n${plain}`;
  } catch (e) { return `[Erro ao acessar ${url}: ${String(e)}]`; }
}

async function duckDuckGoSearch(query: string): Promise<string> {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=IaraBot`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return `[Busca falhou: HTTP ${res.status}]`;
    const data = await res.json();
    const parts: string[] = [];
    if (data.AbstractText) parts.push(`📌 ${data.AbstractText}`);
    if (data.AbstractURL) parts.push(`🔗 ${data.AbstractURL}`);
    if (data.Answer) parts.push(`💡 ${data.Answer}`);
    if (data.RelatedTopics?.length) {
      parts.push("\n🔎 Tópicos relacionados:");
      for (const t of (data.RelatedTopics as Array<{ Text?: string }>).slice(0, 5)) {
        if (t.Text) parts.push(`• ${t.Text}`);
      }
    }
    return parts.length ? parts.join("\n") : "[Nenhum resultado no DuckDuckGo]";
  } catch (e) { return `[Erro na busca: ${String(e)}]`; }
}

function parseContent(content: string): Array<{ type: "text" | "code"; content: string; lang?: string }> {
  const parts: Array<{ type: "text" | "code"; content: string; lang?: string }> = [];
  const rx = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = rx.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: content.slice(last, m.index) });
    parts.push({ type: "code", content: m[2].trimEnd(), lang: m[1] || "código" });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", content: content.slice(last) });
  return parts.filter(p => p.content.trim());
}

function TextWithLinks({ text, style }: { text: string; style?: object }) {
  const urlRx = /(https?:\/\/[^\s<>"()[\]{}|\\^`]+)/g;
  const parts: Array<{ url?: string; text: string }> = [];
  let last = 0; let m: RegExpExecArray | null;
  while ((m = urlRx.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ url: m[1], text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.url ? (
          <Text key={i} style={[style, st.link]} onPress={() => Linking.openURL(p.url!)} suppressHighlighting>{p.text}</Text>
        ) : <Text key={i}>{p.text}</Text>
      )}
    </Text>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { Clipboard.setString(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return (
    <View style={st.codeBox}>
      <View style={st.codeHeader}>
        <Text style={st.codeLang}>{lang || "código"}</Text>
        <Pressable onPress={copy} style={st.copyBtn}>
          <Feather name={copied ? "check" : "copy"} size={13} color={copied ? GREEN : MUTED} />
          <Text style={[st.copyTxt, copied && { color: GREEN }]}>{copied ? "Copiado!" : "Copiar"}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={st.codeText} selectable>{code}</Text>
      </ScrollView>
    </View>
  );
}

function MsgBubble({ msg, onCopy, onSpeak }: { msg: ChatMsg; onCopy: () => void; onSpeak: () => void }) {
  const isUser = msg.role === "user";
  const isWeb = msg.content.startsWith("[🌐") || msg.content.startsWith("[Conteúdo de") || msg.content.startsWith("[JSON de") || msg.content.startsWith("[Busca:");
  const parts = parseContent(msg.content);
  const [menu, setMenu] = useState(false);
  return (
    <Pressable onLongPress={() => setMenu(v => !v)} style={[st.bubble, isUser ? st.bubbleUser : st.bubbleBot, isWeb && { borderColor: WEB_COLOR + "55" }]}>
      {isWeb && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Feather name="globe" size={11} color={WEB_COLOR} />
          <Text style={{ fontSize: 10, color: WEB_COLOR, fontFamily: "Inter_500Medium" }}>ACESSO À INTERNET</Text>
        </View>
      )}
      {parts.map((p, i) => p.type === "code"
        ? <CodeBlock key={i} code={p.content} lang={p.lang ?? ""} />
        : <TextWithLinks key={i} text={p.content} style={[st.bubbleTxt, isUser && { color: "#fff" }]} />
      )}
      <Text style={st.ts}>{fmtDate(msg.timestamp)}</Text>
      {menu && (
        <View style={st.msgMenu}>
          <Pressable onPress={() => { onCopy(); setMenu(false); }} style={st.msgItem}>
            <Feather name="copy" size={13} color={WHITE} /><Text style={st.msgItemTxt}>Copiar tudo</Text>
          </Pressable>
          <Pressable onPress={() => { onSpeak(); setMenu(false); }} style={st.msgItem}>
            <Feather name="volume-2" size={13} color={WHITE} /><Text style={st.msgItemTxt}>Ouvir</Text>
          </Pressable>
          <Pressable onPress={() => setMenu(false)} style={st.msgItem}>
            <Feather name="x" size={13} color={MUTED} /><Text style={[st.msgItemTxt, { color: MUTED }]}>Fechar</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

// ── VOICE SELECTOR MODAL ─────────────────────────────────────────────────────
const PRESET_VOICES = [
  { id: "francisca", name: "Francisca 🇧🇷", lang: "pt-BR", identifier: "com.apple.ttsbundle.Francisca-compact" },
  { id: "luciana", name: "Luciana 🇧🇷", lang: "pt-BR", identifier: "" },
  { id: "daniel", name: "Daniel 🇧🇷", lang: "pt-BR", identifier: "" },
  { id: "auto", name: "Automático PT-BR", lang: "pt-BR", identifier: "" },
];

function VoiceModal({ visible, onClose, selectedVoice, setSelectedVoice }: {
  visible: boolean; onClose: () => void;
  selectedVoice: string; setSelectedVoice: (v: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [available, setAvailable] = useState<Speech.Voice[]>([]);

  useEffect(() => {
    if (visible) {
      Speech.getAvailableVoicesAsync().then(vs => {
        const ptbr = vs.filter(v => v.language?.startsWith("pt") || v.language?.startsWith("por"));
        setAvailable(ptbr.length > 0 ? ptbr : vs.slice(0, 20));
      }).catch(() => {});
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[vst.root, { paddingTop: insets.top + 12 }]}>
        <View style={vst.header}>
          <Text style={vst.title}>🗣️ Voz TTS</Text>
          <Pressable onPress={onClose} style={vst.close}><Feather name="x" size={20} color={WHITE} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}>
          <Text style={[st.hint, { color: MUTED, marginBottom: 4 }]}>
            Vozes do sistema disponíveis (PT-BR primeiro):
          </Text>
          {PRESET_VOICES.map(v => (
            <Pressable key={v.id} onPress={() => { setSelectedVoice(v.identifier || v.lang); onClose(); }}
              style={[vst.voiceRow, selectedVoice === (v.identifier || v.lang) && { borderColor: ACCENT, backgroundColor: ACCENT + "22" }]}>
              <View style={{ flex: 1 }}>
                <Text style={vst.voiceName}>{v.name}</Text>
                <Text style={[st.hint, { color: MUTED }]}>PT-BR · Preset</Text>
              </View>
              {selectedVoice === (v.identifier || v.lang) && <Feather name="check-circle" size={16} color={ACCENT} />}
            </Pressable>
          ))}
          {available.map(v => (
            <Pressable key={v.identifier} onPress={() => { setSelectedVoice(v.identifier); onClose(); }}
              style={[vst.voiceRow, selectedVoice === v.identifier && { borderColor: ACCENT, backgroundColor: ACCENT + "22" }]}>
              <View style={{ flex: 1 }}>
                <Text style={vst.voiceName}>{v.name || v.identifier}</Text>
                <Text style={[st.hint, { color: MUTED }]}>{v.language} · {v.quality}</Text>
              </View>
              {selectedVoice === v.identifier && <Feather name="check-circle" size={16} color={ACCENT} />}
            </Pressable>
          ))}
          {available.length === 0 && (
            <Text style={[st.hint, { color: MUTED }]}>Carregando vozes do sistema...</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── MAIN CHAT SCREEN ─────────────────────────────────────────────────────────
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const {
    apiKeys, activeKeyId, setActiveKeyId, addApiKey,
    chatSessions, activeChatId, createSession, deleteSession,
    addMessage, setActiveChatId, clearSession, importSession,
    voiceTts, setVoiceTts, selectedVoice, setSelectedVoice,
    neonDbUrl, files,
  } = useProject();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showKeyPicker, setShowKeyPicker] = useState(false);
  const [showDb, setShowDb] = useState(false);
  const [sqlInput, setSqlInput] = useState("");
  const [sqlResult, setSqlResult] = useState("");
  const [sqlRunning, setSqlRunning] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [kbVisible, setKbVisible] = useState(false);
  const [quickKey, setQuickKey] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const TAB_H = Platform.OS === "web" ? 64 : 84;

  useEffect(() => {
    const s = Keyboard.addListener("keyboardDidShow", () => setKbVisible(true));
    const h = Keyboard.addListener("keyboardDidHide", () => setKbVisible(false));
    return () => { s.remove(); h.remove(); };
  }, []);

  const activeSession = chatSessions.find(s => s.id === activeChatId) ?? null;
  const activeKey: ApiKey | undefined = apiKeys.find(k => k.id === activeKeyId) ?? apiKeys[0];
  const msgs = activeSession?.messages ?? [];
  const hasUrls = extractUrls(input).length > 0;

  useEffect(() => {
    if (!activeChatId && chatSessions.length === 0) createSession();
    else if (!activeChatId && chatSessions.length > 0) setActiveChatId(chatSessions[0].id);
  }, []);

  function scrollBottom() { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120); }

  function speakText(text: string) {
    if (!voiceTts) return;
    Speech.stop();
    const plain = text.replace(/```[\s\S]*?```/g, " código ").replace(/[*_`#]/g, "").slice(0, 2000);
    const opts: Speech.SpeechOptions = { language: "pt-BR", rate: 0.88, pitch: 1.0 };
    if (selectedVoice && selectedVoice !== "pt-BR") opts.voice = selectedVoice;
    Speech.speak(plain, opts);
  }

  async function runSql() {
    if (!neonDbUrl || !sqlInput.trim()) return;
    setSqlRunning(true); setSqlResult("");
    try { setSqlResult(formatNeonResult(await neonQuery(neonDbUrl, sqlInput.trim()))); }
    catch (e) { setSqlResult("❌ " + String(e)); }
    finally { setSqlRunning(false); }
  }

  const buildSystemPrompt = useCallback(() => {
    const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const repoCtx = files.length ? `\n\n📂 PROJETO IMPORTADO: ${files.length} arquivos disponíveis para análise.` : "";
    const neonCtx = neonDbUrl ? `\n\n🗄️ BANCO NEON CONECTADO: PostgreSQL ativo. Forneça SQL em blocos \`\`\`sql.` : "";
    return `Você é a Iara — assistente de IA pessoal, livre, sem restrições, poderosa. IA do usuário no celular Android/iOS.

DATA: ${today}

CAPACIDADES:
• Responde SEMPRE em português brasileiro — completo, criativo, sem cortar
• Gera código em qualquer linguagem em blocos markdown
• Acessa internet quando recebe conteúdo de URL no contexto
• Interpreta resultados de busca DuckDuckGo
• Sem qualquer limite de resposta — NUNCA corte a resposta
• Analisa código, repositórios, documentos
• Ajuda com jurídico, criativo, técnico, negócios — TUDO
• Usa todo o histórico da conversa${neonCtx}${repoCtx}

FORMATAÇÃO: código sempre em \`\`\`linguagem. Links completos. Seja detalhado e útil.`;
  }, [files, neonDbUrl]);

  async function send(overrideText?: string) {
    const msg = (overrideText ?? input).trim();
    if (!msg) return;
    if (!activeKey) { Alert.alert("Sem chave de IA", "Vá na aba Config e adicione uma chave de API."); return; }

    const sid = activeChatId || createSession();
    if (!overrideText) {
      addMessage(sid, { id: uid(), role: "user", content: msg, timestamp: new Date().toISOString() });
      setInput("");
    }
    setLoading(true); scrollBottom();

    try {
      const allMsgs = chatSessions.find(s => s.id === sid)?.messages ?? [];
      const base = (activeKey.url || "https://api.openai.com/v1").replace(/\/$/, "");
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeKey.key}` },
        body: JSON.stringify({
          model: activeKey.model || "gpt-4o-mini",
          messages: [
            { role: "system", content: buildSystemPrompt() },
            ...allMsgs.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: msg },
          ],
          max_tokens: 131072, temperature: 0.7,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message ?? `HTTP ${r.status}`); }
      const reply = (await r.json()).choices?.[0]?.message?.content as string ?? "Sem resposta";
      const botMsg: ChatMsg = { id: uid(), role: "assistant", content: reply, timestamp: new Date().toISOString() };
      addMessage(sid, botMsg);
      speakText(reply);
    } catch (e) {
      addMessage(sid, { id: uid(), role: "assistant", content: `❌ Erro: ${String(e)}`, timestamp: new Date().toISOString() });
    } finally {
      setLoading(false); scrollBottom();
    }
  }

  async function handleSend() {
    const msg = input.trim();
    if (!msg) return;
    const urls = extractUrls(msg);
    if (urls.length > 0) {
      setFetchingUrl(true);
      const sid = activeChatId || createSession();
      addMessage(sid, { id: uid(), role: "user", content: msg, timestamp: new Date().toISOString() });
      setInput(""); scrollBottom();
      try {
        const results = await Promise.all(urls.map(fetchUrlContent));
        await send(`Analise:\n\n${results.join("\n\n---\n\n")}\n\nMinha pergunta: ${msg}`);
      } finally { setFetchingUrl(false); }
    } else { await send(); }
  }

  async function handleWebSearch() {
    const query = searchQuery.trim() || input.trim();
    if (!query) return;
    setSearching(true);
    try {
      const result = await duckDuckGoSearch(query);
      const sid = activeChatId || createSession();
      addMessage(sid, { id: uid(), role: "assistant", content: `[Busca: "${query}"]\n${result}`, timestamp: new Date().toISOString() });
      scrollBottom();
      await send(`Com base nessa busca, responda em português:\n${result}\n\nPergunta: ${query}`);
    } finally { setSearching(false); setShowSearch(false); setSearchQuery(""); }
  }

  async function analyzeRepo() {
    if (!files.length) { Alert.alert("Sem projeto", "Importe um projeto na aba Playground."); return; }
    const tree = files.map(f => f.path).join("\n");
    const samples = files.slice(0, 5).map(f => `\`\`\`${f.path.split(".").pop()}\n// ${f.path}\n${(f.data || "").slice(0, 500)}\`\`\``).join("\n\n");
    await send(`Analise este repositório:\n\nEstrutura (${files.length} arquivos):\n${tree}\n\nPrimeiros arquivos:\n${samples}`);
  }

  function generateBrain() {
    const session = chatSessions.find(s => s.id === activeChatId);
    return {
      version: 1,
      gerado_em: new Date().toLocaleString("pt-BR"),
      projeto: files.length > 0 ? {
        arquivos: files.length,
        arvore: files.slice(0, 150).map(f => f.path),
      } : null,
      conversa: session ? {
        titulo: session.title,
        mensagens: session.messages.length,
        historico: session.messages.slice(-30).map(m => ({ papel: m.role, texto: m.content.slice(0, 1500) })),
      } : null,
      chave_ativa: activeKey ? { label: activeKey.label, model: activeKey.model } : null,
    };
  }

  async function exportBrainJson() {
    try {
      const brain = generateBrain();
      const json = JSON.stringify(brain, null, 2);
      const path = (FileSystem.cacheDirectory ?? "") + "cerebro-iara.json";
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Exportar Cérebro" });
    } catch (e) { Alert.alert("Erro", String(e)); }
  }

  async function activateBrain() {
    const brain = generateBrain();
    const proj = brain.projeto
      ? `📂 Projeto: ${brain.projeto.arquivos} arquivos\nÁrvore: ${brain.projeto.arvore.slice(0, 25).join(", ")}`
      : "Nenhum projeto carregado.";
    const hist = brain.conversa
      ? `💬 Conversa: "${brain.conversa.titulo}" — ${brain.conversa.mensagens} mensagens`
      : "Sem histórico de conversa.";
    await send(`[🧠 ATIVAR CÉREBRO — Restaurar contexto]\nGerado: ${brain.gerado_em}\n${proj}\n${hist}\n\nResuma o que você sabe sobre meu projeto e o que posso pedir para você agora.`);
  }

  async function exportMarkdown() {
    if (!activeSession) return;
    const lines = [`# ${activeSession.title}`, `Data: ${fmtDate(activeSession.createdAt)}`, ""];
    for (const m of activeSession.messages) {
      lines.push(`**${m.role === "user" ? "Você" : "Iara"}** (${fmtDate(m.timestamp)})`);
      lines.push(m.content); lines.push("");
    }
    try {
      const path = (FileSystem.cacheDirectory ?? "") + `iara-${activeSession.id}.md`;
      await FileSystem.writeAsStringAsync(path, lines.join("\n"), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: "text/markdown", dialogTitle: "Exportar conversa" });
    } catch (e) { Alert.alert("Erro", String(e)); }
  }

  async function exportJson() {
    if (!activeSession) return;
    try {
      const path = (FileSystem.cacheDirectory ?? "") + `iara-${activeSession.id}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(activeSession, null, 2));
      await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Exportar JSON" });
    } catch (e) { Alert.alert("Erro", String(e)); }
  }

  async function importConversation() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "text/markdown", "*/*"] });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      try {
        const parsed = JSON.parse(text) as ChatSession;
        if (parsed.id && Array.isArray(parsed.messages)) { importSession(parsed); return; }
      } catch {}
      importSession({ id: uid(), title: res.assets[0].name ?? "Importado", createdAt: new Date().toISOString(), messages: [{ id: uid(), role: "assistant", content: text, timestamp: new Date().toISOString() }] });
    } catch (e) { Alert.alert("Erro ao importar", String(e)); }
  }

  function closeAll() { setShowSessions(false); setShowKeyPicker(false); setShowDb(false); setShowSearch(false); }

  return (
    <KeyboardAvoidingView
      style={[st.root, { backgroundColor: BG }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <VoiceModal visible={showVoice} onClose={() => setShowVoice(false)} selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice} />

      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <View style={st.headerLeft}>
          <View style={st.avatar}><Text style={{ fontSize: 18 }}>🤖</Text></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={st.title}>Iara — Chat</Text>
              <View style={{ backgroundColor: "#3b1d8a", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#6366f133" }}>
                <Text style={{ fontSize: 9, color: "#a5b4fc", fontFamily: "Inter_600SemiBold" }}>v1.5</Text>
              </View>
            </View>
            <Text style={st.sub} numberOfLines={1}>
              {activeKey ? `${activeKey.label} · ${activeKey.model}` : "⚠️ Sem chave — vá em Config"}
              {" · "}{msgs.length} msgs{files.length > 0 ? ` · 📂 ${files.length}` : ""}
            </Text>
          </View>
        </View>
        <View style={st.headerBtns}>
          <Pressable onPress={activateBrain}
            style={[st.iconBtn, { backgroundColor: "#3b2800" }]}>
            <Text style={{ fontSize: 15 }}>🧠</Text>
          </Pressable>
          <Pressable onPress={exportBrainJson}
            style={[st.iconBtn, { backgroundColor: "#1a2540" }]}>
            <Feather name="save" size={15} color={MUTED} />
          </Pressable>
          <Pressable onPress={() => { setVoiceTts(!voiceTts); }}
            style={[st.iconBtn, voiceTts && { backgroundColor: ACCENT + "33" }]}>
            <Feather name={voiceTts ? "volume-2" : "volume-x"} size={16} color={voiceTts ? ACCENT : MUTED} />
          </Pressable>
          {voiceTts && (
            <Pressable onPress={() => setShowVoice(true)} style={[st.iconBtn, { backgroundColor: "#1a2540" }]}>
              <Feather name="mic" size={16} color={ACCENT} />
            </Pressable>
          )}
          <Pressable onPress={() => { closeAll(); setShowSearch(v => !v); }}
            style={[st.iconBtn, showSearch && { backgroundColor: WEB_COLOR + "33" }]}>
            <Feather name="globe" size={16} color={showSearch ? WEB_COLOR : MUTED} />
          </Pressable>
          {neonDbUrl && (
            <Pressable onPress={() => { closeAll(); setShowDb(v => !v); }}
              style={[st.iconBtn, showDb && { backgroundColor: GREEN + "33" }]}>
              <Feather name="database" size={16} color={showDb ? GREEN : MUTED} />
            </Pressable>
          )}
          <Pressable onPress={() => { closeAll(); setShowKeyPicker(v => !v); }}
            style={[st.iconBtn, showKeyPicker && { backgroundColor: ACCENT + "33" }]}>
            <Feather name="key" size={16} color={showKeyPicker ? ACCENT : MUTED} />
          </Pressable>
          <Pressable onPress={() => { closeAll(); setShowSessions(v => !v); }}
            style={[st.iconBtn, showSessions && { backgroundColor: ACCENT + "33" }]}>
            <Feather name="list" size={16} color={showSessions ? ACCENT : MUTED} />
          </Pressable>
        </View>
      </View>

      {/* Search Panel */}
      {showSearch && (
        <View style={st.panel}>
          <View style={st.panelRow}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Feather name="globe" size={13} color={WEB_COLOR} />
              <Text style={[st.panelTitle, { color: WEB_COLOR }]}>BUSCA · DUCKDUCKGO</Text>
            </View>
            {files.length > 0 && (
              <Pressable onPress={analyzeRepo} style={[st.smBtn, { backgroundColor: "#1e3a5f" }]}>
                <Feather name="git-branch" size={13} color={WEB_COLOR} />
                <Text style={[st.smBtnTxt, { color: WEB_COLOR }]}>Analisar projeto</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[st.sqlInput, { flex: 1, minHeight: 40, maxHeight: 60 }]}
              value={searchQuery} onChangeText={setSearchQuery}
              placeholder="Pesquisar na internet..." placeholderTextColor={MUTED}
              autoCapitalize="none" onSubmitEditing={handleWebSearch} returnKeyType="search" />
            <Pressable onPress={handleWebSearch} disabled={searching}
              style={[st.smBtn, { backgroundColor: "#0e3a4a", paddingHorizontal: 14, alignSelf: "center" }]}>
              {searching ? <ActivityIndicator size="small" color={WEB_COLOR} /> : <Feather name="search" size={16} color={WEB_COLOR} />}
            </Pressable>
          </View>
          <Text style={[st.hint, { color: MUTED }]}>💡 Cole um link na mensagem e envie — a Iara acessa automaticamente</Text>
        </View>
      )}

      {/* Key Picker */}
      {showKeyPicker && (
        <View style={st.panel}>
          <Text style={st.panelTitle}>CHAVE ATIVA — QUALQUER PROVEDOR</Text>
          {apiKeys.length === 0 && (
            <Text style={[st.hint, { color: MUTED }]}>Nenhuma chave. Vá em Config → Chaves IA.</Text>
          )}
          {apiKeys.map(k => (
            <Pressable key={k.id} onPress={() => { setActiveKeyId(k.id); setShowKeyPicker(false); }}
              style={[st.keyRow, k.id === activeKeyId && { borderColor: ACCENT }]}>
              <View style={[st.dot, { backgroundColor: k.status === "ok" ? GREEN : k.status === "error" ? RED : MUTED }]} />
              <View style={{ flex: 1 }}>
                <Text style={[st.keyLabel, k.id === activeKeyId && { color: ACCENT }]}>{k.label}</Text>
                <Text style={st.hint}>{k.model}</Text>
              </View>
              {k.id === activeKeyId && <Feather name="check-circle" size={16} color={ACCENT} />}
            </Pressable>
          ))}
        </View>
      )}

      {/* DB Console */}
      {showDb && neonDbUrl && (
        <View style={st.panel}>
          <View style={st.panelRow}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Feather name="database" size={13} color={GREEN} />
              <Text style={[st.panelTitle, { color: GREEN }]}>CONSOLE SQL · NEON</Text>
            </View>
            <Pressable onPress={() => { setSqlInput(""); setSqlResult(""); send(`Execute no banco:\n\`\`\`sql\n${sqlInput}\n\`\`\``); setShowDb(false); }}
              style={[st.smBtn, { backgroundColor: ACCENT }]}>
              <Feather name="message-circle" size={13} color="#fff" />
              <Text style={st.smBtnTxt}>Pedir à Iara</Text>
            </Pressable>
          </View>
          <TextInput style={st.sqlInput} value={sqlInput} onChangeText={setSqlInput}
            placeholder="SELECT * FROM tabela LIMIT 10;" placeholderTextColor={MUTED}
            multiline autoCapitalize="none" autoCorrect={false} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={runSql} disabled={sqlRunning || !sqlInput.trim()}
              style={[st.smBtn, { flex: 1, backgroundColor: "#166534", justifyContent: "center" }]}>
              {sqlRunning ? <ActivityIndicator size="small" color={GREEN} /> : <Feather name="play" size={13} color={GREEN} />}
              <Text style={[st.smBtnTxt, { color: GREEN }]}>{sqlRunning ? "Executando..." : "Executar SQL"}</Text>
            </Pressable>
            <Pressable onPress={() => { setSqlInput(""); setSqlResult(""); }} style={[st.smBtn, { backgroundColor: "#1a2540" }]}>
              <Feather name="trash-2" size={13} color={MUTED} />
            </Pressable>
          </View>
          {sqlResult !== "" && (
            <ScrollView horizontal showsHorizontalScrollIndicator style={st.sqlResult}>
              <Text style={st.sqlResultTxt}>{sqlResult}</Text>
            </ScrollView>
          )}
        </View>
      )}

      {/* Sessions Panel */}
      {showSessions && (
        <View style={st.panel}>
          <View style={st.panelRow}>
            <Text style={st.panelTitle}>CONVERSAS ({chatSessions.length})</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable onPress={importConversation} style={st.smBtn}>
                <Feather name="upload" size={13} color={WHITE} /><Text style={st.smBtnTxt}>Importar</Text>
              </Pressable>
              <Pressable onPress={() => createSession()} style={[st.smBtn, { backgroundColor: ACCENT }]}>
                <Feather name="plus" size={13} color="#fff" /><Text style={st.smBtnTxt}>Nova</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            {chatSessions.map(s => (
              <Pressable key={s.id} onPress={() => { setActiveChatId(s.id); setShowSessions(false); }}
                style={[st.sessionRow, s.id === activeChatId && { borderLeftColor: ACCENT, borderLeftWidth: 2 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.sessionTitle, s.id === activeChatId && { color: ACCENT }]} numberOfLines={1}>{s.title}</Text>
                  <Text style={st.hint}>{fmtDate(s.createdAt)} · {s.messages.length} msgs</Text>
                </View>
                <Pressable onPress={() => deleteSession(s.id)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={14} color={RED} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
          {activeSession && (
            <View style={[st.panelRow, { gap: 6, marginTop: 4 }]}>
              <Pressable onPress={exportMarkdown} style={[st.smBtn, { flex: 1 }]}>
                <Feather name="file-text" size={13} color={WHITE} /><Text style={st.smBtnTxt}>Export MD</Text>
              </Pressable>
              <Pressable onPress={exportJson} style={[st.smBtn, { flex: 1 }]}>
                <Feather name="download" size={13} color={WHITE} /><Text style={st.smBtnTxt}>Export JSON</Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert("Limpar", "Apagar mensagens desta conversa?", [
                { text: "Cancelar" },
                { text: "Limpar", style: "destructive", onPress: () => clearSession(activeChatId) },
              ])} style={[st.smBtn, { backgroundColor: "#1c0505" }]}>
                <Feather name="trash" size={13} color={RED} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Messages */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }}
        contentContainerStyle={[st.msgList, { paddingBottom: kbVisible ? 16 : 16 + TAB_H }]}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        onLayout={scrollBottom}>
        {msgs.length === 0 && (
          <View style={st.empty}>
            <Text style={{ fontSize: 52, marginBottom: 12 }}>🤖</Text>
            <Text style={st.emptyTitle}>Iara — Chat Livre</Text>
            <Text style={st.emptySub}>
              Sem restrições · Sem limite de mensagens{"\n"}
              Acessa internet · Analisa links · Busca na web{"\n"}
              TTS com voz Francisca · Código em caixinha preta
            </Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 14 }}>
              {["💡 Criar um app", "🔍 Pesquisar algo", "🐛 Debugar código", "🌐 Analisar link", "🗄️ SQL no Neon", "📂 Ver projeto"].map(s => (
                <Pressable key={s} onPress={() => {
                  if (s.includes("Pesquisar") || s.includes("link")) setShowSearch(true);
                  else if (s.includes("projeto")) analyzeRepo();
                  else send(s.slice(3));
                }} style={st.chipBtn}>
                  <Text style={st.chipTxt}>{s}</Text>
                </Pressable>
              ))}
            </View>
            {!activeKey && (
              <View style={[st.noKey, { flexDirection: "column", alignItems: "stretch", gap: 8, paddingHorizontal: 12 }]}>
                <Text style={[st.hint, { color: "#fbbf24", textAlign: "center" }]}>⚡ Cole qualquer chave de IA abaixo — detecta o provedor automaticamente</Text>
                <TextInput
                  style={[st.chatInput, { flex: undefined, fontSize: 12 }]}
                  value={quickKey}
                  onChangeText={setQuickKey}
                  placeholder="sk-...  /  pplx-...  /  sk-ant-...  /  gsk_...  /  AIza..."
                  placeholderTextColor="#475569"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={quickKey.length > 0}
                />
                {quickKey.length > 6 && (() => {
                  const det = detectProvider(quickKey);
                  return det ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#052e16", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#16a34a44" }}>
                      <Text style={{ fontSize: 16 }}>{det.icon}</Text>
                      <Text style={[st.hint, { color: "#4ade80", flex: 1 }]}>✅ {det.name} detectado · {det.model}</Text>
                    </View>
                  ) : (
                    <Text style={[st.hint, { color: "#f59e0b", textAlign: "center" }]}>⚠️ Formato não reconhecido — vá em Config para configurar manualmente</Text>
                  );
                })()}
                {quickKey.length > 6 && detectProvider(quickKey) && (
                  <Pressable
                    disabled={quickSaving}
                    onPress={async () => {
                      const det = detectProvider(quickKey);
                      if (!det) return;
                      setQuickSaving(true);
                      const id = Date.now().toString();
                      addApiKey({ id, label: det.name, key: quickKey.trim(), url: det.url, model: det.model, status: "unknown" });
                      setActiveKeyId(id);
                      setQuickKey("");
                      setQuickSaving(false);
                    }}
                    style={{ backgroundColor: "#6366f1", borderRadius: 10, padding: 12, alignItems: "center" }}>
                    <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                      {quickSaving ? "Salvando..." : "💾 Usar esta chave"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
        {msgs.map(m => (
          <MsgBubble key={m.id} msg={m}
            onCopy={() => Clipboard.setString(m.content)}
            onSpeak={() => speakText(m.content)} />
        ))}
        {(loading || fetchingUrl || searching) && (
          <View style={[st.bubble, st.bubbleBot]}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <ActivityIndicator size="small" color={fetchingUrl || searching ? WEB_COLOR : ACCENT} />
              <Text style={[st.hint, { color: fetchingUrl || searching ? WEB_COLOR : MUTED }]}>
                {fetchingUrl ? "🌐 Acessando link..." : searching ? "🔍 Buscando na internet..." : "Iara está pensando..."}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* URL indicator */}
      {hasUrls && !loading && !fetchingUrl && (
        <View style={st.urlBar}>
          <Feather name="globe" size={12} color={WEB_COLOR} />
          <Text style={[st.hint, { color: WEB_COLOR, flex: 1 }]}>Link detectado — a Iara vai acessar ao enviar</Text>
        </View>
      )}

      {/* Input */}
      <View style={[st.inputBar, { paddingBottom: Math.max(insets.bottom, TAB_H) }]}>
        <TextInput
          style={[st.chatInput, hasUrls && { borderColor: WEB_COLOR + "66" }]}
          value={input} onChangeText={setInput}
          placeholder={activeKey ? "Mensagem, link ou pergunta..." : "Configure uma chave em Config"}
          placeholderTextColor={MUTED} multiline editable={!!activeKey} />
        <Pressable onPress={handleSend}
          disabled={!input.trim() || !activeKey || loading || fetchingUrl}
          style={({ pressed }) => [st.sendBtn, hasUrls ? { backgroundColor: WEB_COLOR } : (!input.trim() || !activeKey) ? { backgroundColor: "#1e293b" } : {}, pressed && { opacity: 0.8 }]}>
          {fetchingUrl ? <ActivityIndicator size="small" color="#fff" /> : <Feather name={hasUrls ? "globe" : "send"} size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerBtns: { flexDirection: "row", alignItems: "center", gap: 2 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT + "33", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontFamily: "Inter_700Bold", color: WHITE },
  sub: { fontSize: 10, fontFamily: "Inter_400Regular", color: MUTED, maxWidth: 220 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  panel: { backgroundColor: CARD2, borderBottomWidth: 1, borderBottomColor: BORDER, padding: 12, gap: 8, maxHeight: 280 },
  panelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8 },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, marginBottom: 4 },
  keyLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: WHITE },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginBottom: 4, backgroundColor: BG, borderLeftWidth: 0, borderLeftColor: "transparent" },
  sessionTitle: { fontSize: 13, fontFamily: "Inter_500Medium", color: WHITE },
  smBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#1a2540" },
  smBtnTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: WHITE },
  sqlInput: { backgroundColor: CODE_BG, borderRadius: 10, padding: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, color: "#4ade80", borderWidth: 1, borderColor: BORDER, minHeight: 60 },
  sqlResult: { backgroundColor: CODE_BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER, maxHeight: 120, padding: 8 },
  sqlResultTxt: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 10, color: "#4ade80", lineHeight: 15 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16 },
  msgList: { paddingHorizontal: 12, paddingTop: 12, gap: 10, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: WHITE },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 21, maxWidth: 300 },
  noKey: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1c1500", borderRadius: 10, padding: 10, marginTop: 8 },
  chipBtn: { backgroundColor: ACCENT + "22", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: ACCENT + "44" },
  chipTxt: { fontSize: 12, color: ACCENT, fontFamily: "Inter_500Medium" },
  bubble: { borderRadius: 16, padding: 12, maxWidth: "92%", borderWidth: 1, borderColor: "transparent" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: ACCENT, borderColor: ACCENT + "88" },
  bubbleBot: { alignSelf: "flex-start", backgroundColor: CARD, borderColor: BORDER, maxWidth: "96%" },
  bubbleTxt: { fontSize: 14, fontFamily: "Inter_400Regular", color: WHITE, lineHeight: 21 },
  ts: { fontSize: 9, color: MUTED, marginTop: 4, alignSelf: "flex-end" },
  codeBox: { backgroundColor: CODE_BG, borderRadius: 10, overflow: "hidden", marginVertical: 4, borderWidth: 1, borderColor: "#1e3a5f" },
  codeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#0a1628", borderBottomWidth: 1, borderBottomColor: "#1e3a5f" },
  codeLang: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#4ade80", letterSpacing: 0.5 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyTxt: { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED },
  codeText: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, color: "#e2e8f0", lineHeight: 18, padding: 12 },
  link: { color: WEB_COLOR, textDecorationLine: "underline" },
  msgMenu: { backgroundColor: "#1a2540", borderRadius: 10, marginTop: 6, overflow: "hidden" },
  msgItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  msgItemTxt: { fontSize: 13, fontFamily: "Inter_500Medium", color: WHITE },
  urlBar: { backgroundColor: WEB_COLOR + "15", borderTopWidth: 1, borderTopColor: WEB_COLOR + "33", paddingHorizontal: 14, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  inputBar: { paddingHorizontal: 12, paddingTop: 10, flexDirection: "row", gap: 8, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: BG },
  chatInput: { flex: 1, backgroundColor: CARD, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: WHITE, maxHeight: 120, borderWidth: 1, borderColor: BORDER },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
});

const vst = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: WHITE },
  close: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#1a2540", alignItems: "center", justifyContent: "center" },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, marginBottom: 6 },
  voiceName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: WHITE },
});
