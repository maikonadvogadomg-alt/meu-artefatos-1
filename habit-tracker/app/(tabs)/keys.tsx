import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator, Alert, Clipboard, Linking, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProject } from "@/context/ProjectContext";
import type { ApiKey } from "@/context/ProjectContext";
import { detectProvider, PROVIDERS } from "@/lib/keyDetector";
import type { ProviderProfile } from "@/lib/keyDetector";
import { neonQuery, neonTestConnection, neonListTables, formatNeonResult } from "@/lib/neon";

const BG = "#080c18";
const CARD = "#0f1629";
const BORDER = "#1e293b";
const ACCENT = "#6366f1";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";
const GREEN = "#4ade80";
const RED = "#f87171";
const YELLOW = "#fbbf24";
const WEB_COLOR = "#22d3ee";

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function statusColor(s?: string) {
  if (s === "ok") return GREEN; if (s === "error") return RED;
  if (s === "testing") return YELLOW; return MUTED;
}
function statusLabel(s?: string) {
  if (s === "ok") return "✅ Online"; if (s === "error") return "❌ Falhou";
  if (s === "testing") return "⏳..."; return "—";
}

// ── MANUAL POPUP ─────────────────────────────────────────────────────────────
const MANUAL_SECTIONS = [
  {
    icon: "🔑", title: "Chaves de IA",
    content: "Cole qualquer chave de API aqui. O app detecta o provedor automaticamente (OpenAI, Perplexity, Anthropic, Groq, etc.).\n\n🌐 PERPLEXITY = acessa a internet em tempo real! Use a chave pplx-xxxx.\n\nA chave ATIVA é a usada pela Iara no chat.",
  },
  {
    icon: "🤖", title: "Chat Iara",
    content: "Toque no botão 💬 flutuante em qualquer tela.\n\n• Cole um link → a Iara acessa e analisa automaticamente\n• Toque 🌐 → busca na internet via DuckDuckGo\n• Toque 📋 → lista sessões / cria nova conversa\n• Segure uma mensagem → copiar / ouvir (TTS)\n• Sem limite de mensagens nem de tamanho",
  },
  {
    icon: "🐙", title: "GitHub",
    content: "Cole seu token (ghp_xxx) e conecta automático.\n\nAba Importar: baixa qualquer repositório\nAba Analisar: vê a árvore de arquivos, abre qualquer arquivo\nAba Enviar: faz push para um repositório novo\nAba Config APK: configura o app (nome, package, cores)\n\nToken necessário: repo ✓ + workflow ✓ + pages ✓",
  },
  {
    icon: "📱", title: "Gerar APK",
    content: "Aba Exportar:\n1. Importe um projeto (GitHub ou ZIP)\n2. Configure nome, package e cores\n3. Toque ⚡ Gerar Projeto → baixa o ZIP Android\n4. Toque 🔨 Compilar via EAS → compila na nuvem\n\nO APK usa WebView puro (sem Capacitor). A pasta dist/ é detectada automaticamente.",
  },
  {
    icon: "🗄️", title: "Banco de Dados Neon",
    content: "Cole a connection string do console.neon.tech.\n\nFormato: postgresql://user:senha@host.neon.tech/db\n\n• Teste a conexão → lista as tabelas\n• Crie tabelas com o assistente\n• Na Iara: toque 🗄️ → console SQL direto\n• Peça para a Iara criar queries, tabelas, inserir dados",
  },
  {
    icon: "⚡", title: "EAS Build",
    content: "Para compilar o APK na nuvem Expo:\n1. Crie conta em expo.dev\n2. Cole o token EAS aqui\n3. Na aba Exportar → gere o ZIP → compile via EAS\n\nToken: expo.dev → Conta → Access Tokens",
  },
  {
    icon: "🖥️", title: "Editor / VS Code",
    content: "Aba Editor:\n• Veja e edite os arquivos do projeto\n• Toque VS Code Web → abre no vscode.dev\n• Toque github.dev → abre editor online\n• Toque Publicar → cria repo + GitHub Pages\n• Toque Exportar ZIP → baixa o projeto completo",
  },
];

function ManualModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState(0);
  const item = MANUAL_SECTIONS[section];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[man.root, { paddingTop: insets.top + 12 }]}>
        <View style={man.header}>
          <Text style={man.title}>📖 Manual Rápido</Text>
          <Pressable onPress={onClose} style={man.closeBtn}>
            <Feather name="x" size={20} color={WHITE} />
          </Pressable>
        </View>
        {/* Section tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={man.tabsRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
          {MANUAL_SECTIONS.map((s, i) => (
            <Pressable key={i} onPress={() => setSection(i)}
              style={[man.tab, i === section && man.tabActive]}>
              <Text style={{ fontSize: 16 }}>{s.icon}</Text>
              <Text style={[man.tabTxt, i === section && { color: "#fff" }]}>{s.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {/* Content */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={man.card}>
            <Text style={{ fontSize: 40, marginBottom: 12, textAlign: "center" }}>{item.icon}</Text>
            <Text style={man.sTitle}>{item.title}</Text>
            <Text style={man.body}>{item.content}</Text>
          </View>
          <View style={[man.card, { backgroundColor: ACCENT + "15", borderColor: ACCENT + "44" }]}>
            <Text style={[man.hint, { color: ACCENT }]}>
              💡 Toque nos itens da barra acima para navegar entre os tópicos.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── CREATE TABLE WIZARD ───────────────────────────────────────────────────────
function CreateTableModal({ visible, onClose, neonDbUrl }: { visible: boolean; onClose: () => void; neonDbUrl: string }) {
  const insets = useSafeAreaInsets();
  const [tableName, setTableName] = useState("");
  const [cols, setCols] = useState([
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "created_at", type: "TIMESTAMP DEFAULT NOW()" },
  ]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  function addCol() { setCols(c => [...c, { name: "", type: "TEXT" }]); }
  function removeCol(i: number) { setCols(c => c.filter((_, j) => j !== i)); }
  function setColName(i: number, v: string) { setCols(c => c.map((x, j) => j === i ? { ...x, name: v } : x)); }
  function setColType(i: number, v: string) { setCols(c => c.map((x, j) => j === i ? { ...x, type: v } : x)); }

  const sql = `CREATE TABLE IF NOT EXISTS ${tableName || "minha_tabela"} (\n  ${cols.filter(c => c.name).map(c => `${c.name} ${c.type}`).join(",\n  ")}\n);`;

  async function run() {
    if (!tableName.trim()) { Alert.alert("Nome obrigatório"); return; }
    if (!neonDbUrl) { Alert.alert("Configure o banco Neon primeiro"); return; }
    setRunning(true); setResult("");
    try {
      await neonQuery(neonDbUrl, sql);
      setResult("✅ Tabela criada com sucesso!");
    } catch (e) {
      setResult("❌ " + String(e));
    } finally {
      setRunning(false);
    }
  }

  const TYPES = ["TEXT", "INTEGER", "SERIAL", "SERIAL PRIMARY KEY", "BOOLEAN", "FLOAT", "TIMESTAMP", "TIMESTAMP DEFAULT NOW()", "UUID DEFAULT gen_random_uuid()", "JSONB"];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[man.root, { paddingTop: insets.top + 12 }]}>
        <View style={man.header}>
          <Text style={man.title}>🗄️ Criar Tabela</Text>
          <Pressable onPress={onClose} style={man.closeBtn}><Feather name="x" size={20} color={WHITE} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>NOME DA TABELA</Text>
          <TextInput style={s.input} value={tableName} onChangeText={setTableName}
            placeholder="clientes, produtos, pedidos..." placeholderTextColor={MUTED}
            autoCapitalize="none" autoCorrect={false} />

          <Text style={s.fieldLabel}>COLUNAS</Text>
          {cols.map((col, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <TextInput style={[s.input, { flex: 1 }]} value={col.name}
                onChangeText={v => setColName(i, v)} placeholder="nome_coluna"
                placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} />
              <ScrollView horizontal style={{ flex: 1.2 }}>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {TYPES.map(t => (
                    <Pressable key={t} onPress={() => setColType(i, t)}
                      style={[man.tab, { paddingVertical: 5, paddingHorizontal: 8 }, col.type === t && man.tabActive]}>
                      <Text style={{ fontSize: 9, color: col.type === t ? "#fff" : MUTED }}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Pressable onPress={() => removeCol(i)} style={{ padding: 10 }}>
                <Feather name="trash-2" size={14} color={RED} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addCol} style={[man.tab, { alignSelf: "flex-start" }]}>
            <Feather name="plus" size={14} color={ACCENT} />
            <Text style={{ color: ACCENT, fontSize: 12 }}>Adicionar coluna</Text>
          </Pressable>

          {/* Preview SQL */}
          <Text style={s.fieldLabel}>SQL GERADO</Text>
          <View style={{ backgroundColor: "#050810", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#1e3a5f" }}>
            <Text selectable style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11, color: "#e2e8f0", lineHeight: 17 }}>
              {sql}
            </Text>
          </View>

          {result !== "" && (
            <Text style={{ color: result.startsWith("✅") ? GREEN : RED, fontFamily: "Inter_500Medium", fontSize: 13 }}>{result}</Text>
          )}

          <Pressable onPress={run} disabled={running}
            style={{ backgroundColor: "#166534", borderRadius: 12, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {running ? <ActivityIndicator size="small" color={GREEN} /> : <Feather name="database" size={16} color={GREEN} />}
            <Text style={{ color: GREEN, fontSize: 14, fontFamily: "Inter_700Bold" }}>{running ? "Criando..." : "Criar Tabela"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function KeysScreen() {
  const insets = useSafeAreaInsets();
  const {
    apiKeys, activeKeyId, addApiKey, removeApiKey, updateApiKey, setActiveKeyId,
    neonDbUrl, setNeonDbUrl, easToken, setEasToken,
    ghToken, setGhToken,
  } = useProject();

  const [section, setSection] = useState<"keys" | "db" | "tokens" | "status">("keys");

  // ── Keys state ──────────────────────────────────────────────────────────────
  const [rawKey, setRawKey] = useState("");
  const [detected, setDetected] = useState<ProviderProfile | null>(null);
  const [undetected, setUndetected] = useState(false);
  const [manualProvider, setManualProvider] = useState<ProviderProfile | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // ── Neon state ──────────────────────────────────────────────────────────────
  const [neonInput, setNeonInput] = useState(neonDbUrl);
  const [neonStatus, setNeonStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [neonMsg, setNeonMsg] = useState("");
  const [neonTables, setNeonTables] = useState<string[]>([]);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [sqlConsole, setSqlConsole] = useState("");
  const [sqlResult, setSqlResult] = useState("");
  const [sqlRunning, setSqlRunning] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableDetails, setTableDetails] = useState("");
  const [aiDbPrompt, setAiDbPrompt] = useState("");
  const [aiDbRunning, setAiDbRunning] = useState(false);
  const [aiDbResult, setAiDbResult] = useState("");

  // ── Tokens state ────────────────────────────────────────────────────────────
  const [easInput, setEasInput] = useState(easToken);
  const [ghInput, setGhInput] = useState(ghToken);

  // ── Status state ────────────────────────────────────────────────────────────
  const [statusResults, setStatusResults] = useState<Array<{ label: string; status: "ok" | "error" | "checking" | "idle"; msg: string }>>([]);
  const [statusRunning, setStatusRunning] = useState(false);

  // Auto-detect key
  useEffect(() => {
    const k = rawKey.trim();
    if (!k) { setDetected(null); setUndetected(false); setManualProvider(null); return; }
    const result = detectProvider(k);
    if (result) {
      setDetected(result); setUndetected(false); setManualProvider(null);
      setCustomUrl(result.url); setCustomModel(result.model);
      if (!customLabel) setCustomLabel(result.name);
    } else {
      setDetected(null); setUndetected(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey]);

  const activeProfile = detected ?? manualProvider;

  function pickManual(p: ProviderProfile) {
    setManualProvider(p); setCustomUrl(p.url); setCustomModel(p.model);
    if (!customLabel) setCustomLabel(p.name);
  }

  function addKey() {
    const k = rawKey.trim();
    if (!k) { Alert.alert("Cole sua chave primeiro."); return; }
    if (!activeProfile) { Alert.alert("Selecione o provedor", "Escolha um da lista abaixo."); return; }
    const label = customLabel.trim() || activeProfile.name;
    const newKey: ApiKey = { id: uid(), label, url: customUrl.trim() || activeProfile.url, key: k, model: customModel.trim() || activeProfile.model, status: "unknown" };
    addApiKey(newKey);
    if (apiKeys.length === 0) setActiveKeyId(newKey.id);
    setRawKey(""); setDetected(null); setUndetected(false);
    setManualProvider(null); setCustomLabel(""); setCustomUrl(""); setCustomModel(""); setShowAdvanced(false);
  }

  async function testKey(k: ApiKey) {
    setTesting(k.id); updateApiKey(k.id, { status: "testing" });
    try {
      const base = (k.url || "https://api.openai.com/v1").replace(/\/$/, "");
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${k.key}` },
        body: JSON.stringify({ model: k.model || "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 5 }),
      });
      updateApiKey(k.id, { status: r.ok || r.status === 400 ? "ok" : "error" });
    } catch { updateApiKey(k.id, { status: "error" }); }
    finally { setTesting(null); }
  }

  async function testAll() { for (const k of apiKeys) await testKey(k); }

  // ── Neon functions ──────────────────────────────────────────────────────────
  async function testNeon() {
    const conn = neonInput.trim();
    if (!conn) { Alert.alert("Cole a URL de conexão Neon primeiro."); return; }
    setNeonStatus("testing"); setNeonMsg("Conectando..."); setNeonTables([]);
    try {
      const msg = await neonTestConnection(conn);
      const tables = await neonListTables(conn).catch(() => []);
      setNeonDbUrl(conn); setNeonStatus("ok"); setNeonMsg(msg); setNeonTables(tables);
    } catch (e) { setNeonStatus("error"); setNeonMsg("❌ " + String(e)); }
  }

  async function runSql() {
    if (!neonDbUrl || !sqlConsole.trim()) return;
    setSqlRunning(true); setSqlResult("");
    try {
      const res = await neonQuery(neonDbUrl, sqlConsole.trim());
      setSqlResult(formatNeonResult(res));
    } catch (e) { setSqlResult("❌ " + String(e)); }
    finally { setSqlRunning(false); }
  }

  async function runAiDb() {
    const activeKey = apiKeys.find(k => k.id === activeKeyId) ?? apiKeys[0];
    if (!activeKey) { Alert.alert("Configure uma chave de IA primeiro na aba Chaves IA."); return; }
    if (!aiDbPrompt.trim()) return;
    setAiDbRunning(true); setAiDbResult("");
    try {
      const tableCtx = neonTables.length > 0 ? `\nTabelas existentes: ${neonTables.join(", ")}` : "\nBanco ainda sem tabelas.";
      const base = (activeKey.url || "https://api.openai.com/v1").replace(/\/$/, "");
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeKey.key}` },
        body: JSON.stringify({
          model: activeKey.model,
          messages: [
            { role: "system", content: `Você é um especialista em PostgreSQL (Neon). Gere SQL válido para PostgreSQL baseado no pedido do usuário.${tableCtx}\n\nRetorne APENAS o SQL, sem explicações, sem markdown, sem blocos de código. Apenas SQL puro executável.` },
            { role: "user", content: aiDbPrompt.trim() },
          ],
          max_tokens: 800,
        }),
      });
      const data = await r.json();
      const sql = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!sql) { setAiDbResult("❌ Sem resposta da IA."); return; }
      setAiDbResult("⏳ Executando: " + sql.slice(0, 60) + "...");
      if (neonDbUrl) {
        try {
          const res = await neonQuery(neonDbUrl, sql);
          const fmt = formatNeonResult(res);
          setAiDbResult("✅ SQL gerado e executado!\n\n" + sql + "\n\n--- Resultado ---\n" + fmt);
          const tables = await neonListTables(neonDbUrl).catch(() => neonTables);
          setNeonTables(tables);
        } catch (e) {
          setAiDbResult("⚠️ SQL gerado mas erro ao executar:\n\n" + sql + "\n\n❌ " + String(e) + "\n\nCopie o SQL acima e execute no console abaixo.");
        }
      } else {
        setAiDbResult("📋 SQL gerado (cole no console abaixo para executar):\n\n" + sql);
      }
    } catch (e) { setAiDbResult("❌ Erro na IA: " + String(e)); }
    finally { setAiDbRunning(false); }
  }

  async function loadTableDetails(table: string) {
    if (!neonDbUrl) return;
    setSelectedTable(table); setTableDetails("carregando...");
    try {
      const res = await neonQuery(neonDbUrl,
        `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`);
      setTableDetails(formatNeonResult(res));
    } catch (e) { setTableDetails("❌ " + String(e)); }
  }

  // ── System status check ─────────────────────────────────────────────────────
  const runStatusCheck = useCallback(async () => {
    if (statusRunning) return;
    setStatusRunning(true);
    setStatusResults([]);
    const results: typeof statusResults = [];

    const push = (item: (typeof statusResults)[0]) => {
      results.push(item);
      setStatusResults([...results]);
    };
    const update = (label: string, patch: Partial<(typeof statusResults)[0]>) => {
      const idx = results.findLastIndex(r => r.label === label);
      if (idx >= 0) results[idx] = { ...results[idx], ...patch };
      setStatusResults([...results]);
    };

    try {
      // 1. Internet
      push({ label: "🌐 Internet", status: "checking", msg: "Verificando..." });
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch("https://httpbin.org/get", { signal: ctrl.signal });
        clearTimeout(tid);
        update("🌐 Internet", { status: r.ok ? "ok" : "error", msg: r.ok ? "Conectado" : `HTTP ${r.status}` });
      } catch (e) { update("🌐 Internet", { status: "error", msg: "Sem conexão" }); }

      // 2. Proxy do servidor
      push({ label: "⚡ Proxy do servidor", status: "checking", msg: "Verificando..." });
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        const base = domain ? `https://${domain}` : "";
        const r = await fetch(`${base}/api/healthz`, { signal: ctrl.signal });
        clearTimeout(tid);
        update("⚡ Proxy do servidor", { status: r.ok ? "ok" : "error", msg: r.ok ? "Online — import sem CORS" : `HTTP ${r.status}` });
      } catch { update("⚡ Proxy do servidor", { status: "error", msg: "Sem resposta — verifique conexão" }); }

      // 3. GitHub token
      if (ghToken) {
        push({ label: "🐙 GitHub", status: "checking", msg: "Verificando..." });
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetch("https://api.github.com/user", { headers: { Authorization: `token ${ghToken}` }, signal: ctrl.signal });
          clearTimeout(tid);
          const u = await r.json().catch(() => ({}));
          update("🐙 GitHub", { status: r.ok ? "ok" : "error", msg: r.ok ? `@${u.login}` : `HTTP ${r.status}` });
        } catch (e) { update("🐙 GitHub", { status: "error", msg: "Falhou — verifique o token" }); }
      } else {
        push({ label: "🐙 GitHub", status: "idle", msg: "Token não configurado — aba Tokens" });
      }

      // 4. IA ativa
      const activeKey = apiKeys.find(k => k.id === activeKeyId) ?? apiKeys[0];
      if (activeKey) {
        push({ label: `🤖 IA: ${activeKey.label}`, status: "checking", msg: "Testando..." });
        try {
          const base = (activeKey.url || "https://api.openai.com/v1").replace(/\/$/, "");
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 10000);
          const r = await fetch(`${base}/chat/completions`, {
            method: "POST", signal: ctrl.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeKey.key}` },
            body: JSON.stringify({ model: activeKey.model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
          });
          clearTimeout(tid);
          update(`🤖 IA: ${activeKey.label}`, { status: r.ok || r.status === 400 ? "ok" : "error", msg: `HTTP ${r.status}` });
        } catch { update(`🤖 IA: ${activeKey.label}`, { status: "error", msg: "Falhou — verifique a chave" }); }
      } else {
        push({ label: "🤖 IA", status: "error", msg: "Nenhuma chave — configure na aba Chaves IA" });
      }

      // 5. Neon DB
      if (neonDbUrl) {
        push({ label: "🐘 Banco Neon", status: "checking", msg: "Conectando..." });
        try {
          const msg = await neonTestConnection(neonDbUrl);
          update("🐘 Banco Neon", { status: "ok", msg });
        } catch (e) { update("🐘 Banco Neon", { status: "error", msg: String(e) }); }
      } else {
        push({ label: "🐘 Banco Neon", status: "idle", msg: "Não configurado" });
      }

    } finally {
      setStatusRunning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeys, activeKeyId, ghToken, neonDbUrl, statusRunning]);

  // Auto-run status check when user enters the Status tab
  useEffect(() => {
    if (section === "status") runStatusCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const SECTIONS = [
    { id: "keys", icon: "🔑", label: "Chaves IA" },
    { id: "db", icon: "🗄️", label: "Banco DB" },
    { id: "tokens", icon: "🔐", label: "Tokens" },
    { id: "status", icon: "📊", label: "Status" },
  ] as const;

  return (
    <View style={[s.root, { backgroundColor: BG }]}>
      <ManualModal visible={manualOpen} onClose={() => setManualOpen(false)} />
      <CreateTableModal visible={createTableOpen} onClose={() => setCreateTableOpen(false)} neonDbUrl={neonDbUrl} />

      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={s.title}>⚙️ Configurações</Text>
            <Text style={[s.hint, { color: MUTED }]}>Chaves IA · Banco · Tokens · Status</Text>
          </View>
          <Pressable onPress={() => setManualOpen(true)} style={s.helpBtn}>
            <Feather name="book-open" size={16} color={ACCENT} />
            <Text style={[s.hint, { color: ACCENT, fontFamily: "Inter_600SemiBold" }]}>Manual</Text>
          </Pressable>
        </View>

        {/* Section Tabs */}
        <View style={s.sectionTabs}>
          {SECTIONS.map(sec => (
            <Pressable key={sec.id} onPress={() => setSection(sec.id as any)}
              style={[s.secTab, section === sec.id && s.secTabActive]}>
              <Text style={{ fontSize: 18 }}>{sec.icon}</Text>
              <Text style={[s.secTabTxt, section === sec.id && { color: "#fff" }]}>{sec.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION: CHAVES IA                                             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {section === "keys" && (
          <>
            {/* Perplexity highlight */}
            <Pressable onPress={() => Linking.openURL("https://www.perplexity.ai/settings/api")}
              style={[s.card, { borderColor: WEB_COLOR + "55", backgroundColor: "#041a1f" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22 }}>🔍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.keyName, { color: WEB_COLOR }]}>Perplexity — Acessa a Internet!</Text>
                  <Text style={[s.hint, { color: "#67e8f9" }]}>A Iara poderá pesquisar em tempo real. Chave começa com pplx-</Text>
                </View>
                <View style={[s.pill, { backgroundColor: WEB_COLOR + "22", borderColor: WEB_COLOR + "55" }]}>
                  <Feather name="globe" size={11} color={WEB_COLOR} />
                  <Text style={[s.pillTxt, { color: WEB_COLOR }]}>Web</Text>
                </View>
              </View>
              <Text style={[s.hint, { color: WEB_COLOR + "aa" }]}>Toque para obter sua chave Perplexity →</Text>
            </Pressable>

            {/* Auto-detect input */}
            <View style={[s.card, activeProfile && { borderColor: activeProfile.color + "88" }]}>
              <Text style={s.sectionLabel}>CAMPO LIVRE — COLE QUALQUER CHAVE</Text>
              <TextInput
                style={[s.keyInput, activeProfile && { borderColor: activeProfile.color + "66" }]}
                value={rawKey}
                onChangeText={setRawKey}
                placeholder={"sk-...  /  pplx-...  /  sk-ant-...  /  gsk_...  /  AIza..."}
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={rawKey.length > 0}
              />

              {detected && (
                <View style={[s.detectedBadge, { backgroundColor: detected.color + "22", borderColor: detected.color + "55" }]}>
                  <Text style={{ fontSize: 22 }}>{detected.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.detectedName, { color: detected.color }]}>{detected.name}</Text>
                    <Text style={[s.hint, { color: MUTED }]}>
                      Detectado automaticamente · {detected.hint}
                      {detected.id === "perplexity" ? "\n🌐 Este provedor acessa a internet em tempo real!" : ""}
                    </Text>
                  </View>
                  <View style={[s.pill, { backgroundColor: GREEN + "22", borderColor: GREEN + "55" }]}>
                    <Feather name="check-circle" size={12} color={GREEN} />
                    <Text style={[s.pillTxt, { color: GREEN }]}>Auto</Text>
                  </View>
                </View>
              )}

              {undetected && !manualProvider && (
                <View style={{ gap: 8 }}>
                  <View style={s.warnBadge}>
                    <Feather name="help-circle" size={14} color={YELLOW} />
                    <Text style={[s.hint, { color: YELLOW, flex: 1 }]}>Formato não reconhecido — escolha o provedor:</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {PROVIDERS.map(p => (
                        <Pressable key={p.id} onPress={() => pickManual(p)}
                          style={[s.providerChip, { borderColor: p.color + "66" }]}>
                          <Text style={{ fontSize: 16 }}>{p.icon}</Text>
                          <Text style={[s.chipTxt, { color: p.color }]}>{p.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {manualProvider && (
                <View style={[s.detectedBadge, { backgroundColor: manualProvider.color + "22", borderColor: manualProvider.color + "55" }]}>
                  <Text style={{ fontSize: 22 }}>{manualProvider.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.detectedName, { color: manualProvider.color }]}>{manualProvider.name}</Text>
                    <Text style={[s.hint, { color: MUTED }]}>Selecionado manualmente</Text>
                  </View>
                  <Pressable onPress={() => setManualProvider(null)} style={[s.pill, { backgroundColor: "#1e293b" }]}>
                    <Feather name="x" size={12} color={MUTED} />
                    <Text style={s.pillTxt}>Trocar</Text>
                  </Pressable>
                </View>
              )}

              {activeProfile && (
                <>
                  <Pressable onPress={() => setShowAdvanced(v => !v)} style={s.advancedToggle}>
                    <Feather name={showAdvanced ? "chevron-up" : "chevron-down"} size={13} color={MUTED} />
                    <Text style={[s.hint, { color: MUTED }]}>
                      {showAdvanced ? "Ocultar configuração" : "Editar URL / modelo (avançado)"}
                    </Text>
                  </Pressable>
                  {showAdvanced && (
                    <View style={{ gap: 6 }}>
                      <Text style={s.fieldLabel}>NOME / LABEL</Text>
                      <TextInput style={s.input} value={customLabel} onChangeText={setCustomLabel}
                        placeholder={activeProfile.name} placeholderTextColor={MUTED} autoCapitalize="none" />
                      <Text style={s.fieldLabel}>URL DA API</Text>
                      <TextInput style={s.input} value={customUrl} onChangeText={setCustomUrl}
                        placeholder={activeProfile.url} placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} />
                      <Text style={s.fieldLabel}>MODELO</Text>
                      <TextInput style={s.input} value={customModel} onChangeText={setCustomModel}
                        placeholder={activeProfile.model} placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} />
                    </View>
                  )}
                  <Pressable onPress={addKey} style={[s.addBtn, { backgroundColor: activeProfile.color }]}>
                    <Feather name="plus-circle" size={16} color="#fff" />
                    <Text style={s.addBtnTxt}>Adicionar {customLabel || activeProfile.name}</Text>
                  </Pressable>
                </>
              )}
            </View>

            {/* Saved keys */}
            {apiKeys.length > 0 && (
              <>
                <View style={s.listHeader}>
                  <Text style={[s.sectionLabel, { flex: 1 }]}>CHAVES SALVAS ({apiKeys.length})</Text>
                  <Pressable onPress={testAll} style={s.testAllBtn}>
                    <Feather name="wifi" size={12} color={WHITE} />
                    <Text style={[s.hint, { color: WHITE }]}>Testar todas</Text>
                  </Pressable>
                </View>
                {apiKeys.map(k => {
                  const profile = detectProvider(k.key) ?? PROVIDERS.find(p => k.url?.includes(p.url.split("/")[2] ?? ""));
                  const isPerplexity = profile?.id === "perplexity";
                  return (
                    <View key={k.id} style={[s.keyCard, k.id === activeKeyId && { borderColor: ACCENT }, isPerplexity && { borderColor: WEB_COLOR + "44" }]}>
                      <View style={s.keyHeader}>
                        <Text style={{ fontSize: 20 }}>{profile?.icon ?? "🔑"}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={[s.keyName, k.id === activeKeyId && { color: ACCENT }]}>{k.label}</Text>
                            {isPerplexity && (
                              <View style={[s.pill, { backgroundColor: WEB_COLOR + "22", borderColor: WEB_COLOR + "44" }]}>
                                <Feather name="globe" size={9} color={WEB_COLOR} />
                                <Text style={[s.pillTxt, { color: WEB_COLOR, fontSize: 9 }]}>Internet</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[s.hint, { color: MUTED }]}>{k.model} · {(k.url || "").replace("https://", "").split("/")[0]}</Text>
                        </View>
                        <View style={[s.statusPill, { backgroundColor: statusColor(k.status) + "22" }]}>
                          <View style={[s.dot, { backgroundColor: statusColor(k.status) }]} />
                          <Text style={[s.hint, { color: statusColor(k.status) }]}>{statusLabel(k.status)}</Text>
                        </View>
                      </View>
                      <View style={s.keyActions}>
                        <Pressable onPress={() => setActiveKeyId(k.id)}
                          style={[s.smallBtn, k.id === activeKeyId ? { backgroundColor: ACCENT } : { backgroundColor: "#1e293b" }]}>
                          <Feather name={k.id === activeKeyId ? "check-circle" : "circle"} size={13} color={k.id === activeKeyId ? "#fff" : MUTED} />
                          <Text style={[s.smallTxt, k.id === activeKeyId && { color: "#fff" }]}>{k.id === activeKeyId ? "Ativa" : "Usar"}</Text>
                        </Pressable>
                        <Pressable onPress={() => testKey(k)} disabled={testing === k.id}
                          style={[s.smallBtn, { backgroundColor: "#1e3a5f" }]}>
                          {testing === k.id ? <ActivityIndicator size="small" color={WHITE} /> : <Feather name="wifi" size={13} color={WHITE} />}
                          <Text style={[s.smallTxt, { color: WHITE }]}>Testar</Text>
                        </Pressable>
                        <Pressable onPress={() => Alert.alert("Remover", `Remover "${k.label}"?`, [
                          { text: "Cancelar" },
                          { text: "Remover", style: "destructive", onPress: () => removeApiKey(k.id) },
                        ])} style={[s.smallBtn, { backgroundColor: "#1c0505" }]}>
                          <Feather name="trash-2" size={13} color={RED} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {apiKeys.length === 0 && !rawKey && (
              <View style={[s.card, { alignItems: "center", paddingVertical: 28 }]}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>🔐</Text>
                <Text style={[s.hint, { color: MUTED, textAlign: "center" }]}>
                  Cole qualquer chave acima{"\n"}o provedor é detectado automaticamente
                </Text>
              </View>
            )}

            {/* Providers list */}
            <View style={[s.card, { borderColor: "#1e3a5f", backgroundColor: "#060d1a" }]}>
              <Text style={s.sectionLabel}>PROVEDORES SUPORTADOS</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {PROVIDERS.map(p => (
                  <View key={p.id} style={[s.pill, { backgroundColor: p.color + "18", borderColor: p.color + "44" }]}>
                    <Text style={{ fontSize: 12 }}>{p.icon}</Text>
                    <Text style={[s.pillTxt, { color: p.color }]}>{p.name}</Text>
                    {p.id === "perplexity" && <Feather name="globe" size={9} color={WEB_COLOR} />}
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION: BANCO DB                                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {section === "db" && (
          <>
            <View style={[s.card, { borderColor: neonStatus === "ok" ? GREEN : neonStatus === "error" ? RED : "#1e3a5f" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22 }}>🐘</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.keyName}>Neon PostgreSQL</Text>
                  <Text style={[s.hint, { color: MUTED }]}>Cole a connection string abaixo</Text>
                </View>
                {neonStatus === "ok" && (
                  <View style={[s.pill, { backgroundColor: "#052e16", borderColor: GREEN + "44" }]}>
                    <Feather name="database" size={11} color={GREEN} />
                    <Text style={[s.pillTxt, { color: GREEN }]}>Conectado</Text>
                  </View>
                )}
              </View>

              <Text style={s.fieldLabel}>CONNECTION STRING</Text>
              <TextInput
                style={[s.input, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 }]}
                value={neonInput}
                onChangeText={setNeonInput}
                placeholder="postgresql://user:senha@ep-xxx.us-east-2.aws.neon.tech/neondb"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={() => Linking.openURL("https://console.neon.tech")}>
                <Text style={[s.hint, { color: ACCENT }]}>
                  Obter string em console.neon.tech → seu projeto → Connect →
                </Text>
              </Pressable>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={testNeon} disabled={neonStatus === "testing"}
                  style={[s.smallBtn, { flex: 1, backgroundColor: "#1e3a5f", justifyContent: "center" }]}>
                  {neonStatus === "testing" ? <ActivityIndicator size="small" color={WHITE} /> : <Feather name="wifi" size={14} color={WHITE} />}
                  <Text style={[s.smallTxt, { color: WHITE }]}>{neonStatus === "testing" ? "Testando..." : "Testar e Salvar"}</Text>
                </Pressable>
                <Pressable onPress={() => setCreateTableOpen(true)} style={[s.smallBtn, { backgroundColor: "#166534" }]}>
                  <Feather name="plus-square" size={14} color={GREEN} />
                  <Text style={[s.smallTxt, { color: GREEN }]}>Criar Tabela</Text>
                </Pressable>
              </View>

              {neonMsg !== "" && (
                <View style={{ backgroundColor: neonStatus === "ok" ? "#052e16" : "#1c0505", borderWidth: 1, borderColor: neonStatus === "ok" ? "#166534" : "#7f1d1d", borderRadius: 10, padding: 10, gap: 4 }}>
                  <Text style={[s.hint, { color: neonStatus === "ok" ? GREEN : RED, lineHeight: 17 }]}>{neonMsg}</Text>
                </View>
              )}
            </View>

            {/* Tables */}
            {neonTables.length > 0 && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>TABELAS ({neonTables.length})</Text>
                {neonTables.map(t => (
                  <Pressable key={t} onPress={() => loadTableDetails(t === selectedTable ? null! : t)}
                    style={[s.tableRow, t === selectedTable && { backgroundColor: ACCENT + "22" }]}>
                    <Feather name="table" size={14} color={t === selectedTable ? ACCENT : MUTED} />
                    <Text style={[s.hint, { color: t === selectedTable ? ACCENT : WHITE, flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 }]}>{t}</Text>
                    <Feather name={t === selectedTable ? "chevron-up" : "chevron-right"} size={13} color={MUTED} />
                  </Pressable>
                ))}
                {selectedTable && tableDetails && (
                  <ScrollView horizontal showsHorizontalScrollIndicator style={{ backgroundColor: "#050810", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#1e3a5f" }}>
                    <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 10, color: "#4ade80", lineHeight: 15 }}>{tableDetails}</Text>
                  </ScrollView>
                )}
              </View>
            )}

            {neonTables.length === 0 && neonStatus === "ok" && (
              <View style={[s.card, { alignItems: "center", gap: 10, paddingVertical: 20 }]}>
                <Text style={{ fontSize: 32 }}>📭</Text>
                <Text style={[s.hint, { color: MUTED, textAlign: "center" }]}>Banco vazio. Crie uma tabela ou peça para a Iara criar!</Text>
                <Pressable onPress={() => setCreateTableOpen(true)} style={[s.addBtn, { backgroundColor: "#166534", paddingVertical: 10, paddingHorizontal: 20 }]}>
                  <Feather name="plus-circle" size={16} color={GREEN} />
                  <Text style={[s.addBtnTxt, { color: GREEN }]}>Criar primeira tabela</Text>
                </Pressable>
              </View>
            )}

            {/* IA para banco */}
            <View style={[s.card, { borderColor: "#7c3aed44" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 22 }}>🤖</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.keyName}>IA constrói o banco</Text>
                  <Text style={[s.hint, { color: MUTED }]}>Descreva em português — a IA gera e executa o SQL</Text>
                </View>
              </View>
              <TextInput
                style={[s.input, { minHeight: 70, maxHeight: 120 }]}
                value={aiDbPrompt}
                onChangeText={setAiDbPrompt}
                placeholder={"Ex: Crie uma tabela de clientes com nome, email, telefone e data de cadastro\n\nEx: Liste todas as tabelas e seus dados\n\nEx: Insira 3 clientes de exemplo"}
                placeholderTextColor={MUTED}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={runAiDb} disabled={aiDbRunning || !aiDbPrompt.trim()}
                style={[s.addBtn, { backgroundColor: aiDbRunning ? "#3b1d6e" : "#7c3aed", paddingVertical: 10, opacity: !aiDbPrompt.trim() ? 0.5 : 1 }]}>
                {aiDbRunning ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="zap" size={15} color="#fff" />}
                <Text style={s.addBtnTxt}>{aiDbRunning ? "Gerando SQL e executando..." : "⚡ Gerar e Executar com IA"}</Text>
              </Pressable>
              {aiDbResult !== "" && (
                <ScrollView showsVerticalScrollIndicator style={{ backgroundColor: "#08051a", borderRadius: 8, borderWidth: 1, borderColor: "#7c3aed44", maxHeight: 200, padding: 10, marginTop: 4 }}>
                  <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 10, color: aiDbResult.startsWith("✅") ? "#4ade80" : aiDbResult.startsWith("⚠️") ? "#fbbf24" : "#f87171", lineHeight: 15 }}>{aiDbResult}</Text>
                </ScrollView>
              )}
              {!neonDbUrl && (
                <Text style={[s.hint, { color: YELLOW, textAlign: "center", marginTop: 4 }]}>⚠️ Configure o banco Neon acima para executar automaticamente</Text>
              )}
            </View>

            {/* Quick SQL Console */}
            {neonDbUrl && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>CONSOLE SQL RÁPIDO</Text>
                <TextInput
                  style={[s.input, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11, minHeight: 80, maxHeight: 140 }]}
                  value={sqlConsole}
                  onChangeText={setSqlConsole}
                  placeholder={"SELECT * FROM tabela LIMIT 10;"}
                  placeholderTextColor={MUTED}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={runSql} disabled={sqlRunning || !sqlConsole.trim()}
                    style={[s.smallBtn, { flex: 1, backgroundColor: "#166534", justifyContent: "center" }]}>
                    {sqlRunning ? <ActivityIndicator size="small" color={GREEN} /> : <Feather name="play" size={13} color={GREEN} />}
                    <Text style={[s.smallTxt, { color: GREEN }]}>{sqlRunning ? "Executando..." : "Executar"}</Text>
                  </Pressable>
                  <Pressable onPress={() => { setSqlConsole(""); setSqlResult(""); }} style={[s.smallBtn, { backgroundColor: "#1a2540" }]}>
                    <Feather name="trash-2" size={13} color={MUTED} />
                  </Pressable>
                </View>
                {sqlResult !== "" && (
                  <ScrollView horizontal showsHorizontalScrollIndicator style={{ backgroundColor: "#050810", borderRadius: 8, borderWidth: 1, borderColor: "#1e3a5f", maxHeight: 180, padding: 8 }}>
                    <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 10, color: "#4ade80", lineHeight: 15 }}>{sqlResult}</Text>
                  </ScrollView>
                )}
              </View>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION: TOKENS (EAS + GitHub)                                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {section === "tokens" && (
          <>
            <View style={s.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 20 }}>⚡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.keyName}>Token EAS (Expo)</Text>
                  <Text style={[s.hint, { color: MUTED }]}>Necessário para compilar APK na nuvem</Text>
                </View>
                {easToken && <View style={[s.pill, { backgroundColor: GREEN + "22", borderColor: GREEN + "44" }]}>
                  <Feather name="check" size={11} color={GREEN} />
                  <Text style={[s.pillTxt, { color: GREEN }]}>Salvo</Text>
                </View>}
              </View>
              <Text style={s.fieldLabel}>TOKEN EAS</Text>
              <TextInput
                style={[s.input, { letterSpacing: 0.5 }]}
                value={easInput}
                onChangeText={setEasInput}
                placeholder="dYEa4ppg..."
                placeholderTextColor={MUTED}
                secureTextEntry={easInput.length > 0}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={() => Linking.openURL("https://expo.dev/accounts/[account]/settings/access-tokens")}>
                <Text style={[s.hint, { color: ACCENT }]}>Obter token em expo.dev → Conta → Access Tokens →</Text>
              </Pressable>
              <Pressable onPress={() => { setEasToken(easInput.trim()); Alert.alert("✅ Token EAS salvo!"); }}
                style={[s.addBtn, { backgroundColor: ACCENT, paddingVertical: 10 }]}>
                <Feather name="save" size={15} color="#fff" />
                <Text style={[s.addBtnTxt, { fontSize: 13 }]}>Salvar Token EAS</Text>
              </Pressable>
            </View>

            <View style={s.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 20 }}>🐙</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.keyName}>Token GitHub (PAT)</Text>
                  <Text style={[s.hint, { color: MUTED }]}>Para importar repositórios e fazer push</Text>
                </View>
                {ghToken && <View style={[s.pill, { backgroundColor: GREEN + "22", borderColor: GREEN + "44" }]}>
                  <Feather name="check" size={11} color={GREEN} />
                  <Text style={[s.pillTxt, { color: GREEN }]}>Conectado</Text>
                </View>}
              </View>
              <Text style={s.fieldLabel}>TOKEN GITHUB</Text>
              <TextInput
                style={[s.input, { letterSpacing: 0.5 }]}
                value={ghInput}
                onChangeText={setGhInput}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={MUTED}
                secureTextEntry={ghInput.length > 0}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={() => Linking.openURL("https://github.com/settings/tokens/new?scopes=repo,workflow,pages&description=APK+Builder")}>
                <Text style={[s.hint, { color: ACCENT }]}>
                  Gerar token em GitHub → Settings → Developer settings → PAT (classic) → repo ✓ + workflow ✓ + pages ✓ →
                </Text>
              </Pressable>
              <Pressable onPress={() => { setGhToken(ghInput.trim()); Alert.alert("✅ Token GitHub salvo!"); }}
                style={[s.addBtn, { backgroundColor: "#1a2a1a", paddingVertical: 10, borderWidth: 1, borderColor: GREEN + "44" }]}>
                <Feather name="save" size={15} color={GREEN} />
                <Text style={[s.addBtnTxt, { fontSize: 13, color: GREEN }]}>Salvar Token GitHub</Text>
              </Pressable>
            </View>

            <View style={[s.card, { backgroundColor: "#060d1a", borderColor: "#1e3a5f" }]}>
              <Text style={s.sectionLabel}>💡 SOBRE OS TOKENS</Text>
              <Text style={[s.hint, { color: "#94a3b8", lineHeight: 18 }]}>
                • Todos os tokens ficam salvos localmente no app{"\n"}
                • EAS Token: só necessário para compilar APK na nuvem{"\n"}
                • GitHub Token: necessário para importar/exportar repositórios{"\n"}
                • Os tokens são usados diretamente nas APIs — o app não tem servidor
              </Text>
            </View>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION: STATUS                                                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {section === "status" && (
          <>
            {/* Versão do app */}
            <View style={[s.card, { backgroundColor: "#0a0d1f", borderColor: "#312e81", flexDirection: "row", alignItems: "center", gap: 12 }]}>
              <Text style={{ fontSize: 28 }}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.keyName, { color: "#a5b4fc" }]}>APK Builder — v2.0.0</Text>
                <Text style={[s.hint, { color: MUTED }]}>
                  {Platform.OS === "android" ? "Android APK nativo" : Platform.OS === "ios" ? "iOS" : "Web Preview"} · {new Date().toLocaleDateString("pt-BR")}
                </Text>
              </View>
              <View style={[s.pill, { backgroundColor: "#312e81", borderColor: "#4f46e5" }]}>
                <Feather name="check-circle" size={11} color="#a5b4fc" />
                <Text style={[s.pillTxt, { color: "#a5b4fc" }]}>Instalado</Text>
              </View>
            </View>

            {/* Botão verificar */}
            <Pressable onPress={runStatusCheck} disabled={statusRunning}
              style={[s.addBtn, { backgroundColor: statusRunning ? "#1e293b" : "#0f766e", borderWidth: 1, borderColor: statusRunning ? BORDER : "#14b8a6" }]}>
              {statusRunning
                ? <ActivityIndicator size="small" color="#5eead4" />
                : <Feather name="refresh-cw" size={18} color="#5eead4" />}
              <Text style={[s.addBtnTxt, { color: statusRunning ? MUTED : "#5eead4" }]}>
                {statusRunning ? "Verificando todos os serviços..." : "🔄 Verificar Status Agora"}
              </Text>
            </Pressable>

            {/* Resultados */}
            {statusResults.map((r, i) => (
              <View key={i} style={[s.card, {
                borderColor: r.status === "ok" ? GREEN + "55" : r.status === "error" ? RED + "55" : r.status === "checking" ? YELLOW + "44" : BORDER,
                backgroundColor: r.status === "ok" ? "#052e16" : r.status === "error" ? "#1c0505" : CARD,
              }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={[s.dot, {
                    width: 12, height: 12,
                    backgroundColor: r.status === "ok" ? GREEN : r.status === "error" ? RED : r.status === "checking" ? YELLOW : MUTED,
                  }]} />
                  <Text style={[s.keyName, { flex: 1,
                    color: r.status === "ok" ? GREEN : r.status === "error" ? RED : r.status === "checking" ? YELLOW : WHITE,
                  }]}>{r.label}</Text>
                  {r.status === "checking" && <ActivityIndicator size="small" color={YELLOW} />}
                </View>
                {r.msg !== "" && (
                  <Text style={[s.hint, { color: r.status === "ok" ? "#86efac" : r.status === "error" ? "#fca5a5" : r.status === "checking" ? "#fef08a" : MUTED, marginLeft: 22 }]}>
                    {r.msg}
                  </Text>
                )}
              </View>
            ))}

            {statusResults.length === 0 && statusRunning && (
              <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
                <ActivityIndicator size="large" color={ACCENT} />
                <Text style={[s.hint, { color: MUTED, marginTop: 12, textAlign: "center" }]}>Verificando Internet · Proxy · GitHub · IA · Banco...</Text>
              </View>
            )}

            {statusResults.length === 0 && !statusRunning && (
              <View style={[s.card, { alignItems: "center", paddingVertical: 30 }]}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
                <Text style={[s.hint, { color: MUTED, textAlign: "center" }]}>
                  Verificação automática iniciando...{"\n"}ou toque no botão acima
                </Text>
              </View>
            )}

            {/* Resumo de configuração */}
            <View style={[s.card, { backgroundColor: "#060d1a", borderColor: "#1e3a5f" }]}>
              <Text style={s.sectionLabel}>📋 RESUMO DE CONFIGURAÇÃO</Text>
              <View style={{ gap: 6, marginTop: 4 }}>
                {[
                  { ok: apiKeys.length > 0, text: apiKeys.length > 0 ? `✅ ${apiKeys.length} chave(s) de IA configurada(s)` : "⚠️ Nenhuma chave de IA — configure na aba Chaves IA" },
                  { ok: !!neonDbUrl, text: neonDbUrl ? "✅ Banco Neon configurado" : "⚪ Banco Neon não configurado" },
                  { ok: !!ghToken, text: ghToken ? "✅ GitHub conectado" : "⚪ GitHub não configurado — configure na aba Tokens" },
                  { ok: !!easToken, text: easToken ? "✅ Token EAS configurado" : "⚪ Token EAS não configurado" },
                ].map((item, i) => (
                  <Text key={i} style={[s.hint, { color: item.ok ? GREEN : MUTED, lineHeight: 18 }]}>{item.text}</Text>
                ))}
              </View>
            </View>

            {/* Limites do app */}
            <View style={[s.card, { backgroundColor: "#060d1a", borderColor: "#1e3a5f" }]}>
              <Text style={s.sectionLabel}>📦 LIMITES DO APK BUILDER v2.0.0</Text>
              <View style={{ gap: 4, marginTop: 4 }}>
                {[
                  { label: "Arquivos por import", val: "∞ Sem limite" },
                  { label: "Tamanho ZIP / repo GitHub", val: "Sem limite (streaming)" },
                  { label: "RAM do app (Android)", val: "Até 512 MB – 2 GB (device)" },
                  { label: "Export ZIP Android", val: "Até memória disponível" },
                  { label: "Sessão salva (AsyncStorage)", val: "Até 6 MB por chave" },
                  { label: "Push GitHub por arquivo", val: "Até 100 MB" },
                  { label: "EAS Build na nuvem", val: "Sem limite de tamanho" },
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: i < 6 ? 1 : 0, borderBottomColor: BORDER }}>
                    <Text style={[s.hint, { color: MUTED, flex: 1 }]}>{item.label}</Text>
                    <Text style={[s.hint, { color: GREEN, fontFamily: "Inter_600SemiBold", textAlign: "right" }]}>{item.val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Tabela de Tokens IA */}
            <View style={[s.card, { backgroundColor: "#06091a", borderColor: "#312e81" }]}>
              <Text style={[s.sectionLabel, { color: "#a5b4fc" }]}>🤖 LIMITES DE TOKENS POR MODELO DE IA</Text>
              <Text style={[s.hint, { color: MUTED, marginBottom: 6 }]}>ctx = contexto total · out = máx por resposta</Text>

              {/* Header */}
              <View style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <Text style={[s.hint, { color: MUTED, flex: 1.2, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 }]}>PROVEDOR</Text>
                <Text style={[s.hint, { color: MUTED, flex: 2, fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 }]}>MODELO</Text>
                <Text style={[s.hint, { color: MUTED, flex: 0.8, fontFamily: "Inter_600SemiBold", fontSize: 9, textAlign: "center", letterSpacing: 0.5 }]}>CTX</Text>
                <Text style={[s.hint, { color: MUTED, flex: 0.8, fontFamily: "Inter_600SemiBold", fontSize: 9, textAlign: "center", letterSpacing: 0.5 }]}>OUT</Text>
              </View>

              {[
                { p: "OpenAI",     m: "gpt-4o",            ctx: "128k",  out: "16k",  c: "#10b981" },
                { p: "OpenAI",     m: "gpt-4o-mini",       ctx: "128k",  out: "16k",  c: "#10b981" },
                { p: "OpenAI",     m: "gpt-4-turbo",       ctx: "128k",  out: "4k",   c: "#10b981" },
                { p: "OpenAI",     m: "gpt-3.5-turbo",     ctx: "16k",   out: "4k",   c: "#10b981" },
                { p: "OpenAI",     m: "o1 / o3",           ctx: "200k",  out: "100k", c: "#10b981" },
                { p: "Anthropic",  m: "claude-3.5-sonnet", ctx: "200k",  out: "8k",   c: "#f59e0b" },
                { p: "Anthropic",  m: "claude-3-opus",     ctx: "200k",  out: "4k",   c: "#f59e0b" },
                { p: "Anthropic",  m: "claude-3-haiku",    ctx: "200k",  out: "4k",   c: "#f59e0b" },
                { p: "Google",     m: "gemini-1.5-pro",    ctx: "1M",    out: "8k",   c: "#3b82f6" },
                { p: "Google",     m: "gemini-2.0-flash",  ctx: "1M",    out: "8k",   c: "#3b82f6" },
                { p: "Groq",       m: "llama-3.1-70b",     ctx: "128k",  out: "8k",   c: "#8b5cf6" },
                { p: "Groq",       m: "mixtral-8x7b",      ctx: "32k",   out: "32k",  c: "#8b5cf6" },
                { p: "Perplexity", m: "sonar-pro",         ctx: "200k",  out: "8k",   c: "#22d3ee" },
                { p: "Perplexity", m: "sonar",             ctx: "128k",  out: "8k",   c: "#22d3ee" },
                { p: "DeepSeek",   m: "deepseek-chat",     ctx: "64k",   out: "8k",   c: "#ec4899" },
                { p: "Mistral",    m: "mistral-large",     ctx: "128k",  out: "8k",   c: "#f97316" },
              ].map((row, i) => (
                <View key={i} style={{ flexDirection: "row", paddingVertical: 5, borderBottomWidth: i < 15 ? 1 : 0, borderBottomColor: BORDER + "55", backgroundColor: i % 2 === 0 ? "#ffffff05" : "transparent" }}>
                  <Text style={[s.hint, { flex: 1.2, color: row.c, fontFamily: "Inter_600SemiBold", fontSize: 10 }]}>{row.p}</Text>
                  <Text style={[s.hint, { flex: 2, color: "#cbd5e1", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 9 }]}>{row.m}</Text>
                  <Text style={[s.hint, { flex: 0.8, color: "#67e8f9", fontFamily: "Inter_700Bold", textAlign: "center", fontSize: 11 }]}>{row.ctx}</Text>
                  <Text style={[s.hint, { flex: 0.8, color: "#94a3b8", textAlign: "center", fontSize: 10 }]}>{row.out}</Text>
                </View>
              ))}
            </View>

            {/* Info do device */}
            <View style={[s.card, { backgroundColor: "#060d1a", borderColor: "#1e3a5f" }]}>
              <Text style={s.sectionLabel}>⚙️ INFORMAÇÕES DO DEVICE</Text>
              <View style={{ gap: 4, marginTop: 4 }}>
                {[
                  { label: "Plataforma", val: Platform.OS === "android" ? `Android (API ${Platform.Version})` : Platform.OS === "ios" ? `iOS ${Platform.Version}` : "Web" },
                  { label: "Expo SDK", val: "54" },
                  { label: "React Native", val: "0.76.x" },
                  { label: "Engine", val: "Hermes JS" },
                  { label: "App Version", val: "2.0.0 (build 1)" },
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: BORDER }}>
                    <Text style={[s.hint, { color: MUTED }]}>{item.label}</Text>
                    <Text style={[s.hint, { color: WHITE, fontFamily: "Inter_500Medium" }]}>{item.val}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 14, gap: 10 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: WHITE, letterSpacing: -0.5 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16 },
  fieldLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8, marginBottom: 4 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 14, gap: 8 },
  keyCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 12, gap: 10 },
  keyInput: {
    backgroundColor: "#06091a", borderWidth: 2, borderColor: BORDER,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 14, fontFamily: "Inter_400Regular", color: WHITE, letterSpacing: 1,
  },
  input: {
    backgroundColor: "#06091a", borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, fontFamily: "Inter_400Regular", color: WHITE,
  },
  detectedBadge: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  detectedName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  warnBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1c1500", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#854d0e" },
  providerChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, backgroundColor: "#0a0f1e" },
  chipTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  advancedToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13 },
  addBtnTxt: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  listHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  testAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1e3a5f", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  keyHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  keyName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: WHITE },
  keyActions: { flexDirection: "row", gap: 8 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9 },
  smallTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  pillTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: MUTED },
  helpBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ACCENT + "22", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: ACCENT + "44" },
  sectionTabs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  secTab: { flex: 1, minWidth: "45%", alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: "#0a0f1e" },
  secTabActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  secTabTxt: { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
});

// ── Manual styles ─────────────────────────────────────────────────────────────
const man = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: WHITE },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#1a2540", alignItems: "center", justifyContent: "center" },
  tabsRow: { borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 10 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: "#0a0f1e" },
  tabActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  tabTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 18, gap: 10, alignItems: "center" },
  sTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: WHITE, textAlign: "center" },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#cbd5e1", lineHeight: 22, textAlign: "left", width: "100%" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 18, textAlign: "center" },
});
