import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator, Alert, Clipboard, KeyboardAvoidingView, Linking,
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
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
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function extractUrls(text: string): string[] {
  const rx = /https?:\/\/[^\s<>"()[\]{}|\\^`]+/g;
  return text.match(rx) ?? [];
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IaraBot/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return `[Erro HTTP ${res.status} ao acessar ${url}]`;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      const json = await res.json();
      return `[JSON de ${url}]:\n${JSON.stringify(json, null, 2).slice(0, 6000)}`;
    }
    const html = await res.text();
    const plain = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s{3,}/g, "\n\n")
      .trim()
      .slice(0, 8000);
    return `[Conteúdo de ${url}]:\n${plain}`;
  } catch (e) {
    return `[Erro ao acessar ${url}: ${String(e)}]`;
  }
}

async function duckDuckGoSearch(query: string): Promise<string> {
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1&t=IaraBot`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return `[Busca falhou: HTTP ${res.status}]`;
    const data = await res.json();
    const parts: string[] = [];
    if (data.AbstractText) parts.push(`📌 ${data.AbstractText}`);
    if (data.AbstractURL) parts.push(`🔗 ${data.AbstractURL}`);
    if (data.Answer) parts.push(`💡 ${data.Answer}`);
    if (data.RelatedTopics?.length) {
      parts.push("\n🔎 Tópicos relacionados:");
      for (const t of data.RelatedTopics.slice(0, 5)) {
        if (t.Text) parts.push(`• ${t.Text}`);
      }
    }
    return parts.length ? parts.join("\n") : "[Nenhum resultado encontrado no DuckDuckGo]";
  } catch (e) {
    return `[Erro na busca: ${String(e)}]`;
  }
}

function parseContent(content: string): Array<{ type: "text" | "code"; content: string; lang?: string }> {
  const parts: Array<{ type: "text" | "code"; content: string; lang?: string }> = [];
  const rx = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = rx.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: content.slice(last, m.index) });
    parts.push({ type: "code", content: m[2].trimEnd(), lang: m[1] || "code" });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", content: content.slice(last) });
  return parts.filter(p => p.content.trim());
}

function TextWithLinks({ text, style }: { text: string; style?: object }) {
  const urlRx = /(https?:\/\/[^\s<>"()[\]{}|\\^`]+)/g;
  const parts: Array<{ url?: string; text: string }> = [];
  let last = 0, m: RegExpExecArray | null;
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
          <Text key={i} style={[style, st.link]} onPress={() => Linking.openURL(p.url!)} suppressHighlighting>
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        )
      )}
    </Text>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
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

function MsgBubble({ msg, onCopyAll, onSpeak }: { msg: ChatMsg; onCopyAll: () => void; onSpeak: () => void }) {
  const isUser = msg.role === "user";
  const isWeb = msg.content.startsWith("[🌐") || msg.content.startsWith("[Conteúdo de") || msg.content.startsWith("[JSON de") || msg.content.startsWith("[Busca:");
  const parts = parseContent(msg.content);
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <Pressable onLongPress={() => setMenuVisible(v => !v)} style={[st.bubble, isUser ? st.bubbleUser : st.bubbleBot, isWeb && { borderColor: WEB_COLOR + "55" }]}>
      {isWeb && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Feather name="globe" size={11} color={WEB_COLOR} />
          <Text style={{ fontSize: 10, color: WEB_COLOR, fontFamily: "Inter_500Medium" }}>ACESSO À INTERNET</Text>
        </View>
      )}
      {parts.map((p, i) =>
        p.type === "code" ? (
          <CodeBlock key={i} code={p.content} lang={p.lang ?? ""} />
        ) : (
          <TextWithLinks key={i} text={p.content} style={[st.bubbleTxt, isUser && { color: "#fff" }]} />
        )
      )}
      <Text style={st.ts}>{fmtDate(msg.timestamp)}</Text>
      {menuVisible && (
        <View style={st.msgMenu}>
          <Pressable onPress={() => { onCopyAll(); setMenuVisible(false); }} style={st.msgMenuItem}>
            <Feather name="copy" size={13} color={WHITE} /><Text style={st.msgMenuTxt}>Copiar tudo</Text>
          </Pressable>
          <Pressable onPress={() => { onSpeak(); setMenuVisible(false); }} style={st.msgMenuItem}>
            <Feather name="volume-2" size={13} color={WHITE} /><Text style={st.msgMenuTxt}>Ouvir</Text>
          </Pressable>
          <Pressable onPress={() => setMenuVisible(false)} style={st.msgMenuItem}>
            <Feather name="x" size={13} color={MUTED} /><Text style={[st.msgMenuTxt, { color: MUTED }]}>Fechar</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

interface Props { visible: boolean; onClose: () => void; }

export function IaraModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const {
    apiKeys, activeKeyId, setActiveKeyId,
    chatSessions, activeChatId, createSession, deleteSession,
    addMessage, setActiveChatId, clearSession, importSession,
    voiceTts, setVoiceTts, neonDbUrl,
    files,
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
  const scrollRef = useRef<ScrollView>(null);
  const speaking = useRef(false);

  const activeSession = chatSessions.find(s => s.id === activeChatId) ?? null;
  const activeKey: ApiKey | undefined = apiKeys.find(k => k.id === activeKeyId) ?? apiKeys[0];

  useEffect(() => {
    if (visible && !activeChatId && chatSessions.length === 0) createSession();
    else if (visible && !activeChatId && chatSessions.length > 0) setActiveChatId(chatSessions[0].id);
  }, [visible]);

  function scrollBottom() { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120); }

  function speakText(text: string) {
    if (!voiceTts) return;
    Speech.stop();
    const plain = text.replace(/```[\s\S]*?```/g, " código ").replace(/[*_`#]/g, "").slice(0, 2000);
    Speech.speak(plain, { language: "pt-BR", rate: 0.9, pitch: 1.0 });
  }

  async function runSql() {
    if (!neonDbUrl || !sqlInput.trim()) return;
    setSqlRunning(true); setSqlResult("");
    try {
      const result = await neonQuery(neonDbUrl, sqlInput.trim());
      setSqlResult(formatNeonResult(result));
    } catch (e) {
      setSqlResult("❌ " + String(e));
    } finally {
      setSqlRunning(false);
    }
  }

  function sendSqlToChat() {
    if (!sqlInput.trim()) return;
    const msg = `Execute no banco de dados Neon:\n\`\`\`sql\n${sqlInput.trim()}\n\`\`\``;
    send(msg);
    setShowDb(false);
  }

  async function handleFetchLink() {
    const urls = extractUrls(input);
    if (!urls.length) { Alert.alert("Nenhum link", "Cole um link na caixa de texto primeiro."); return; }
    setFetchingUrl(true);
    try {
      const results = await Promise.all(urls.map(fetchUrlContent));
      const context = results.join("\n\n---\n\n");
      const msg = `${input}\n\n${context}`;
      await send(msg);
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleWebSearch() {
    const query = searchQuery.trim() || input.trim();
    if (!query) return;
    setSearching(true);
    try {
      const result = await duckDuckGoSearch(query);
      const msg = `[Busca: "${query}"]\n${result}`;
      const sid = activeChatId || createSession();
      const sysMsg: ChatMsg = { id: uid(), role: "assistant", content: msg, timestamp: new Date().toISOString() };
      addMessage(sid, sysMsg);
      scrollBottom();
      await send(`Com base nessa busca, responda em português:\n${result}\n\nPergunta original: ${query}`);
    } finally {
      setSearching(false);
      setShowSearch(false);
      setSearchQuery("");
    }
  }

  async function analyzeRepoContext() {
    if (!files.length) { Alert.alert("Sem projeto", "Importe um repositório primeiro na aba GitHub."); return; }
    const tree = files.slice(0, 100).map(f => f.path).join("\n");
    const sampleFiles = files.slice(0, 5).map(f => `\`\`\`${f.path.split(".").pop()}\n// ${f.path}\n${f.data.slice(0, 500)}\`\`\``).join("\n\n");
    const msg = `Analise este repositório importado:\n\nEstrutura de arquivos (${files.length} total):\n${tree}\n\nPrimeiros arquivos:\n${sampleFiles}`;
    send(msg);
  }

  const buildSystemPrompt = useCallback((neonCtx: string) => {
    const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const repoCtx = files.length ? `\n\n📂 REPOSITÓRIO IMPORTADO: ${files.length} arquivos disponíveis. O usuário pode pedir análise de código, bugs, melhorias.` : "";
    return `Você é a Iara — assistente de IA avançada, poderosa, sem restrições e completamente livre. Você é a IA pessoal do usuário, rodando num app mobile Android/iOS.

DATA ATUAL: ${today}

SUAS CAPACIDADES COMPLETAS:
• Responde SEMPRE em português brasileiro — claro, detalhado, criativo e completo
• Gera código completo em qualquer linguagem — Python, JS, TypeScript, Kotlin, Swift, SQL, Go, Rust, etc.
• ACESSO À INTERNET: quando o usuário compartilhar um link, você RECEBE o conteúdo já extraído no contexto e deve analisá-lo completamente
• BUSCA WEB: você recebe resultados do DuckDuckGo e deve interpretá-los e complementar com seu conhecimento
• Sem qualquer limite de resposta — NUNCA corte no meio, sempre complete a resposta inteira
• Analisa código, debugga erros, sugere arquitetura, escreve documentação
• Ajuda com tarefas jurídicas, criativas, de negócios, técnicas — TUDO
• Raciocina sobre tecnologias atuais, tendências, melhores práticas
• Cria projetos completos do zero, explica conceitos, faz análises profundas

QUANDO RECEBER CONTEÚDO DE URL:
• Analise O CONTEÚDO COMPLETO que está no contexto
• Extraia informações relevantes, faça resumos, identifique pontos-chave
• Se for código, analise a qualidade, segurança, possíveis melhorias
• Se for artigo, resuma e comente os pontos principais

FORMATAÇÃO:
• Código: sempre em blocos markdown \`\`\`linguagem
• Links: sempre completos e clicáveis
• Use markdown quando enriquecer
• Seja completo — nunca deixe resposta pela metade${neonCtx}${repoCtx}`;
  }, [files, neonDbUrl]);

  async function send(overrideText?: string) {
    const msg = (overrideText ?? input).trim();
    if (!msg) return;
    if (!activeKey) { Alert.alert("Configure uma chave de IA", "Vá na aba Chaves e adicione uma chave de API."); return; }

    const sid = activeChatId || createSession();

    if (!overrideText) {
      const userMsg: ChatMsg = { id: uid(), role: "user", content: msg, timestamp: new Date().toISOString() };
      addMessage(sid, userMsg);
      setInput("");
    }

    setLoading(true);
    scrollBottom();

    try {
      const neonCtx = neonDbUrl
        ? `\n\n🗄️ BANCO DE DADOS NEON CONECTADO: PostgreSQL ativo. Forneça SQL completo em blocos \`\`\`sql quando necessário.`
        : "";

      const systemPrompt = buildSystemPrompt(neonCtx);
      const allMsgs = chatSessions.find(s => s.id === sid)?.messages ?? [];
      const history = allMsgs.map(m => ({ role: m.role, content: m.content }));

      const base = (activeKey.url || "https://api.openai.com/v1").replace(/\/$/, "");
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeKey.key}` },
        body: JSON.stringify({
          model: activeKey.model || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: msg },
          ],
          max_tokens: 8192,
          temperature: 0.7,
          stream: false,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message ?? `HTTP ${r.status}`); }
      const data = await r.json();
      const reply = data.choices?.[0]?.message?.content as string ?? "Sem resposta";
      const botMsg: ChatMsg = { id: uid(), role: "assistant", content: reply, timestamp: new Date().toISOString() };
      addMessage(sid, botMsg);
      if (voiceTts) speakText(reply);
    } catch (e) {
      const errMsg: ChatMsg = { id: uid(), role: "assistant", content: `❌ Erro: ${String(e)}`, timestamp: new Date().toISOString() };
      addMessage(sid, errMsg);
    } finally {
      setLoading(false);
      scrollBottom();
    }
  }

  async function handleSend() {
    const msg = input.trim();
    if (!msg) return;
    const urls = extractUrls(msg);
    if (urls.length > 0) {
      setFetchingUrl(true);
      const sid = activeChatId || createSession();
      const userMsg: ChatMsg = { id: uid(), role: "user", content: msg, timestamp: new Date().toISOString() };
      addMessage(sid, userMsg);
      setInput("");
      scrollBottom();
      try {
        const results = await Promise.all(urls.map(fetchUrlContent));
        const webCtx = results.join("\n\n---\n\n");
        await send(`Analise este conteúdo:\n\n${webCtx}\n\nMinha pergunta: ${msg}`);
      } finally {
        setFetchingUrl(false);
      }
    } else {
      await send();
    }
  }

  async function exportMarkdown() {
    if (!activeSession) return;
    const lines = [`# ${activeSession.title}`, `Data: ${fmtDate(activeSession.createdAt)}`, ""];
    for (const m of activeSession.messages) {
      lines.push(`**${m.role === "user" ? "Você" : "Iara"}** (${fmtDate(m.timestamp)})`);
      lines.push(m.content);
      lines.push("");
    }
    try {
      const path = (FileSystem.cacheDirectory ?? "") + `iara-${activeSession.id}.md`;
      await FileSystem.writeAsStringAsync(path, lines.join("\n"), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: "text/markdown", dialogTitle: "Exportar conversa" });
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
      const session: ChatSession = {
        id: uid(), title: res.assets[0].name ?? "Importado",
        createdAt: new Date().toISOString(),
        messages: [{ id: uid(), role: "assistant", content: text, timestamp: new Date().toISOString() }],
      };
      importSession(session);
    } catch (e) { Alert.alert("Erro ao importar", String(e)); }
  }

  async function exportJson() {
    if (!activeSession) return;
    try {
      const path = (FileSystem.cacheDirectory ?? "") + `iara-${activeSession.id}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(activeSession, null, 2));
      await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Exportar JSON" });
    } catch (e) { Alert.alert("Erro", String(e)); }
  }

  const msgs = activeSession?.messages ?? [];
  const hasUrls = extractUrls(input).length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[st.root, { backgroundColor: BG }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[st.header, { paddingTop: insets.top + 8 }]}>
          <View style={st.headerLeft}>
            <View style={st.avatarBox}><Text style={{ fontSize: 18 }}>🤖</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>Iara — Chat Livre</Text>
              <Text style={st.sub} numberOfLines={1}>
                {activeKey ? `${activeKey.label} · ${activeKey.model}` : "Sem chave configurada"}
                {" · "}{msgs.length} msgs{files.length > 0 ? ` · 📂 ${files.length} arquivos` : ""}
              </Text>
            </View>
          </View>
          <View style={st.headerActions}>
            <Pressable onPress={() => setVoiceTts(!voiceTts)} style={[st.iconBtn, voiceTts && { backgroundColor: ACCENT + "33" }]}>
              <Feather name={voiceTts ? "volume-2" : "volume-x"} size={16} color={voiceTts ? ACCENT : MUTED} />
            </Pressable>
            <Pressable onPress={() => { setShowSearch(v => !v); setShowDb(false); setShowKeyPicker(false); setShowSessions(false); }}
              style={[st.iconBtn, showSearch && { backgroundColor: WEB_COLOR + "33" }]}>
              <Feather name="globe" size={16} color={showSearch ? WEB_COLOR : MUTED} />
            </Pressable>
            {neonDbUrl ? (
              <Pressable onPress={() => { setShowDb(v => !v); setShowKeyPicker(false); setShowSessions(false); setShowSearch(false); }}
                style={[st.iconBtn, showDb && { backgroundColor: "#22c55e33" }]}>
                <Feather name="database" size={16} color={showDb ? "#4ade80" : MUTED} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => { setShowKeyPicker(v => !v); setShowDb(false); setShowSessions(false); setShowSearch(false); }}
              style={[st.iconBtn, showKeyPicker && { backgroundColor: ACCENT + "33" }]}>
              <Feather name="key" size={16} color={showKeyPicker ? ACCENT : MUTED} />
            </Pressable>
            <Pressable onPress={() => { setShowSessions(v => !v); setShowDb(false); setShowKeyPicker(false); setShowSearch(false); }}
              style={[st.iconBtn, showSessions && { backgroundColor: ACCENT + "33" }]}>
              <Feather name="list" size={16} color={showSessions ? ACCENT : MUTED} />
            </Pressable>
            <Pressable onPress={onClose} style={st.closeBtn}>
              <Feather name="x" size={20} color={WHITE} />
            </Pressable>
          </View>
        </View>

        {/* Web Search Panel */}
        {showSearch && (
          <View style={st.panel}>
            <View style={st.panelRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="globe" size={13} color={WEB_COLOR} />
                <Text style={[st.panelTitle, { color: WEB_COLOR }]}>BUSCA NA INTERNET · DUCKDUCKGO</Text>
              </View>
              {files.length > 0 && (
                <Pressable onPress={analyzeRepoContext} style={[st.smallBtn, { backgroundColor: "#1e3a5f" }]}>
                  <Feather name="git-branch" size={13} color={WEB_COLOR} />
                  <Text style={[st.smallBtnTxt, { color: WEB_COLOR }]}>Analisar repo</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[st.sqlInput, { flex: 1, minHeight: 40, maxHeight: 60 }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="O que você quer pesquisar?"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
              />
              <Pressable
                onPress={handleWebSearch}
                disabled={searching || (!searchQuery.trim() && !input.trim())}
                style={[st.smallBtn, { backgroundColor: searching ? "#0e2a38" : "#0e3a4a", paddingHorizontal: 14, alignSelf: "center" }]}
              >
                {searching ? <ActivityIndicator size="small" color={WEB_COLOR} /> : <Feather name="search" size={16} color={WEB_COLOR} />}
              </Pressable>
            </View>
            <Text style={[st.hint, { color: MUTED }]}>
              💡 Cole um link na caixa de mensagem e envie — a Iara acessa e analisa automaticamente.{"\n"}
              Ou use a busca acima para pesquisar qualquer coisa na internet.
            </Text>
          </View>
        )}

        {/* Key Picker */}
        {showKeyPicker && (
          <View style={st.panel}>
            <Text style={st.panelTitle}>CHAVE ATIVA</Text>
            {apiKeys.length === 0 && <Text style={[st.hint, { color: MUTED }]}>Nenhuma chave. Vá na aba Chaves.</Text>}
            {apiKeys.map(k => (
              <Pressable key={k.id} onPress={() => { setActiveKeyId(k.id); setShowKeyPicker(false); }}
                style={[st.keyRow, k.id === activeKeyId && { borderColor: ACCENT }]}>
                <View style={[st.statusDot, { backgroundColor: k.status === "ok" ? GREEN : k.status === "error" ? RED : MUTED }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.keyLabel, k.id === activeKeyId && { color: ACCENT }]}>{k.label}</Text>
                  <Text style={st.hint}>{k.model}</Text>
                </View>
                {k.id === activeKeyId && <Feather name="check-circle" size={16} color={ACCENT} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* DB Console Panel */}
        {showDb && neonDbUrl && (
          <View style={st.panel}>
            <View style={st.panelRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="database" size={13} color="#4ade80" />
                <Text style={[st.panelTitle, { color: "#4ade80" }]}>CONSOLE SQL · NEON</Text>
              </View>
              <Pressable onPress={sendSqlToChat} style={[st.smallBtn, { backgroundColor: ACCENT }]}>
                <Feather name="message-circle" size={13} color="#fff" />
                <Text style={st.smallBtnTxt}>Pedir à Iara</Text>
              </Pressable>
            </View>
            <TextInput
              style={st.sqlInput}
              value={sqlInput}
              onChangeText={setSqlInput}
              placeholder={"SELECT * FROM tabela LIMIT 10;"}
              placeholderTextColor={MUTED}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={runSql} disabled={sqlRunning || !sqlInput.trim()}
                style={[st.smallBtn, { flex: 1, backgroundColor: "#166534", justifyContent: "center" }]}>
                {sqlRunning ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="play" size={13} color="#4ade80" />}
                <Text style={[st.smallBtnTxt, { color: "#4ade80" }]}>{sqlRunning ? "Executando..." : "Executar SQL"}</Text>
              </Pressable>
              <Pressable onPress={() => { setSqlInput(""); setSqlResult(""); }} style={[st.smallBtn, { backgroundColor: "#1a2540" }]}>
                <Feather name="trash-2" size={13} color={MUTED} />
              </Pressable>
            </View>
            {sqlResult !== "" && (
              <ScrollView horizontal showsHorizontalScrollIndicator style={st.sqlResultBox}>
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
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={importConversation} style={st.smallBtn}>
                  <Feather name="upload" size={13} color={WHITE} /><Text style={st.smallBtnTxt}>Import</Text>
                </Pressable>
                <Pressable onPress={() => createSession()} style={[st.smallBtn, { backgroundColor: ACCENT }]}>
                  <Feather name="plus" size={13} color="#fff" /><Text style={st.smallBtnTxt}>Nova</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {chatSessions.map(s => (
                <Pressable key={s.id} onPress={() => { setActiveChatId(s.id); setShowSessions(false); }}
                  style={[st.sessionRow, s.id === activeChatId && { borderLeftColor: ACCENT, borderLeftWidth: 2 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.sessionTitle, s.id === activeChatId && { color: ACCENT }]} numberOfLines={1}>{s.title}</Text>
                    <Text style={st.hint}>{fmtDate(s.createdAt)} · {s.messages.length} msgs</Text>
                  </View>
                  <Pressable onPress={() => deleteSession(s.id)} style={st.deleteBtn}>
                    <Feather name="trash-2" size={14} color={RED} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
            {activeSession && (
              <View style={[st.panelRow, { marginTop: 8, gap: 6 }]}>
                <Pressable onPress={exportMarkdown} style={[st.smallBtn, { flex: 1 }]}>
                  <Feather name="file-text" size={13} color={WHITE} /><Text style={st.smallBtnTxt}>Export MD</Text>
                </Pressable>
                <Pressable onPress={exportJson} style={[st.smallBtn, { flex: 1 }]}>
                  <Feather name="download" size={13} color={WHITE} /><Text style={st.smallBtnTxt}>Export JSON</Text>
                </Pressable>
                <Pressable onPress={() => {
                  Alert.alert("Limpar", "Apagar todas as mensagens desta conversa?", [
                    { text: "Cancelar" },
                    { text: "Limpar", style: "destructive", onPress: () => clearSession(activeChatId) },
                  ]);
                }} style={[st.smallBtn, { backgroundColor: "#1c0505" }]}>
                  <Feather name="trash" size={13} color={RED} /><Text style={[st.smallBtnTxt, { color: RED }]}>Limpar</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[st.msgList, { paddingBottom: 16 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onLayout={scrollBottom}
        >
          {msgs.length === 0 && (
            <View style={st.empty}>
              <Text style={{ fontSize: 52, marginBottom: 12 }}>🤖</Text>
              <Text style={st.emptyTitle}>Iara — Chat Livre</Text>
              <Text style={st.emptySub}>
                Sem restrições · Sem limite de mensagens · Contexto completo{"\n"}
                Acessa internet · Analisa links · Busca na web · Gera código
              </Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}>
                {[
                  "💡 Criar um app",
                  "🔍 Pesquisar algo",
                  "🐛 Debugar código",
                  "🌐 Analisar um link",
                  "🗄️ SQL no Neon",
                  "📂 Ver o repositório",
                ].map(s => (
                  <Pressable key={s} onPress={() => {
                    if (s.includes("link")) { setShowSearch(true); }
                    else if (s.includes("repositório")) { analyzeRepoContext(); }
                    else if (s.includes("Pesquisar")) { setShowSearch(true); }
                    else send(s.slice(3));
                  }}
                    style={{ backgroundColor: ACCENT + "22", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: ACCENT + "44" }}>
                    <Text style={{ fontSize: 12, color: ACCENT, fontFamily: "Inter_500Medium" }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              {!activeKey && (
                <View style={st.noKeyBanner}>
                  <Feather name="alert-triangle" size={16} color="#fbbf24" />
                  <Text style={[st.hint, { color: "#fbbf24" }]}>Configure uma chave na aba Chaves primeiro</Text>
                </View>
              )}
            </View>
          )}
          {msgs.map(m => (
            <MsgBubble
              key={m.id}
              msg={m}
              onCopyAll={() => Clipboard.setString(m.content)}
              onSpeak={() => speakText(m.content)}
            />
          ))}
          {(loading || fetchingUrl || searching) && (
            <View style={[st.bubble, st.bubbleBot]}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <ActivityIndicator size="small" color={fetchingUrl || searching ? WEB_COLOR : ACCENT} />
                <Text style={[st.hint, { color: fetchingUrl || searching ? WEB_COLOR : MUTED }]}>
                  {fetchingUrl ? "🌐 Acessando o link..." : searching ? "🔍 Buscando na internet..." : "Iara está pensando..."}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* URL indicator */}
        {hasUrls && !loading && !fetchingUrl && (
          <View style={{ backgroundColor: WEB_COLOR + "15", borderTopWidth: 1, borderTopColor: WEB_COLOR + "33",
            paddingHorizontal: 14, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="globe" size={12} color={WEB_COLOR} />
            <Text style={{ fontSize: 11, color: WEB_COLOR, fontFamily: "Inter_400Regular", flex: 1 }}>
              Link detectado — a Iara vai acessar e analisar automaticamente ao enviar
            </Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={[st.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={[st.chatInput, hasUrls && { borderColor: WEB_COLOR + "66" }]}
            value={input}
            onChangeText={setInput}
            placeholder={activeKey ? "Mensagem, link ou pergunta para a Iara..." : "Configure uma chave de API primeiro"}
            placeholderTextColor={MUTED}
            multiline
            editable={!!activeKey}
          />
          {hasUrls ? (
            <Pressable
              onPress={handleSend}
              disabled={!input.trim() || !activeKey || loading || fetchingUrl}
              style={({ pressed }) => [st.sendBtn, { backgroundColor: WEB_COLOR }, pressed && { opacity: 0.8 }]}
            >
              {fetchingUrl ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="globe" size={18} color="#fff" />}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => send()}
              disabled={!input.trim() || !activeKey || loading}
              style={({ pressed }) => [st.sendBtn, (!input.trim() || !activeKey) && { backgroundColor: "#1e293b" }, pressed && { opacity: 0.8 }]}
            >
              <Feather name="send" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 3 },
  avatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT + "33", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontFamily: "Inter_700Bold", color: WHITE },
  sub: { fontSize: 10, fontFamily: "Inter_400Regular", color: MUTED, maxWidth: 200 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#1a2540", alignItems: "center", justifyContent: "center", marginLeft: 2 },
  panel: { backgroundColor: CARD2, borderBottomWidth: 1, borderBottomColor: BORDER, padding: 12, gap: 8 },
  panelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8 },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  keyLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: WHITE },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginBottom: 4, backgroundColor: BG, borderLeftWidth: 0, borderLeftColor: "transparent" },
  sessionTitle: { fontSize: 13, fontFamily: "Inter_500Medium", color: WHITE },
  deleteBtn: { padding: 6 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#1a2540" },
  smallBtnTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: WHITE },
  msgList: { paddingHorizontal: 12, paddingTop: 12, gap: 10, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: WHITE },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 20, maxWidth: 300 },
  noKeyBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1c1500", borderRadius: 10, padding: 10, marginTop: 8 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "94%", gap: 6 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: ACCENT, borderBottomRightRadius: 4 },
  bubbleBot: { alignSelf: "flex-start", backgroundColor: CARD, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: BORDER },
  bubbleTxt: { fontSize: 14, fontFamily: "Inter_400Regular", color: WHITE, lineHeight: 22 },
  link: { color: "#818cf8", textDecorationLine: "underline" },
  ts: { fontSize: 10, fontFamily: "Inter_400Regular", color: MUTED, alignSelf: "flex-end", marginTop: 2 },
  msgMenu: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: BORDER },
  msgMenuItem: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#1a2540" },
  msgMenuTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: WHITE },
  codeBox: { backgroundColor: CODE_BG, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "#1e3a5f", marginVertical: 2 },
  codeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#090f1e", borderBottomWidth: 1, borderBottomColor: "#1e3a5f" },
  codeLang: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#60a5fa", letterSpacing: 0.5 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyTxt: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  codeText: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, color: "#e2e8f0", padding: 12, lineHeight: 18 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: BG },
  chatInput: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: WHITE, maxHeight: 160 },
  sendBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  sqlInput: {
    backgroundColor: "#050810", borderWidth: 1, borderColor: "#1e3a5f",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#e2e8f0", minHeight: 80, maxHeight: 160,
  },
  sqlResultBox: {
    backgroundColor: "#050810", borderRadius: 8, borderWidth: 1, borderColor: "#1e3a5f",
    maxHeight: 180, padding: 8,
  },
  sqlResultTxt: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11, color: "#4ade80", lineHeight: 17,
  },
});
