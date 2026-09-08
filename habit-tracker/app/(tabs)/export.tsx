import { Feather } from "@expo/vector-icons";
import * as _FileSystem from "expo-file-system";
const FileSystem = _FileSystem as any;
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProject } from "@/context/ProjectContext";
import type { AppConfig } from "@/context/ProjectContext";
import { buildAndroidZip, selectWebFiles } from "@/lib/android";
import {
  easGetMe,
  easEnsureApp,
  easGetUploadUrl,
  easUploadTarball,
  easCreateBuild,
  easGetBuild,
  type EasBuild,
} from "@/lib/eas";

const BG = "#080c18";
const CARD = "#0f1629";
const BORDER = "#1e293b";
const ACCENT = "#6366f1";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";
const GREEN = "#4ade80";
const ORANGE = "#f97316";

type BuildPhase =
  | "idle"
  | "generating"
  | "validating"
  | "uploading"
  | "building"
  | "done"
  | "error";

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const {
    files, cfg, setCfg, source, projectReady,
    resultBase64, resultName, setResult,
    easToken, setEasToken,
  } = useProject();

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sharing, setSharing] = useState(false);

  // Smart file detection
  const { files: webFiles, fromSubfolder } = React.useMemo(
    () => selectWebFiles(files),
    [files]
  );
  const hasIndexHtml = webFiles.some(
    f => f.path === "index.html" || f.path.replace(/^\//, "") === "index.html"
  );

  // EAS Build state
  const [easInput, setEasInput] = useState(easToken);
  const [phase, setPhase] = useState<BuildPhase>("idle");
  const [easMsg, setEasMsg] = useState("");
  const [easBuild, setEasBuild] = useState<EasBuild | null>(null);
  const [easUser, setEasUser] = useState<{ username: string } | null>(null);

  async function handleGenerate() {
    if (!cfg.appName || !cfg.appId || !files.length) return;
    setGenerating(true);
    setProgress(10);
    try {
      await new Promise(r => setTimeout(r, 100)); setProgress(30);
      const base64 = await buildAndroidZip(cfg, files, source);
      setProgress(90);
      const safeName = cfg.appName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const name = `${safeName}-android-v${cfg.versionName}.zip`;
      setResult(base64, name);
      setProgress(100);
    } catch (e) {
      Alert.alert("Erro", String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleShare() {
    if (!resultBase64 || !resultName) return;
    setSharing(true);
    try {
      const uri = (FileSystem.cacheDirectory ?? "") + resultName;
      await FileSystem.writeAsStringAsync(uri, resultBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "application/zip",
        dialogTitle: `Salvar ${resultName}`,
        UTI: "public.zip-archive",
      });
    } catch (e) {
      Alert.alert("Erro ao compartilhar", String(e));
    } finally {
      setSharing(false);
    }
  }

  async function handleEasBuild() {
    const token = easInput.trim();
    if (!token) { Alert.alert("Token EAS necessário", "Cole seu token EAS primeiro."); return; }
    if (!resultBase64) { Alert.alert("Gere o ZIP primeiro", "Toque em ⚡ Gerar Projeto antes de compilar via EAS."); return; }

    setEasToken(token);
    setEasBuild(null);

    try {
      // 1. Validar token
      setPhase("validating");
      setEasMsg("🔐 Verificando token EAS...");
      const me = await easGetMe(token);
      setEasUser({ username: me.username });
      setEasMsg(`✅ Logado como @${me.username}`);

      // 2. Registrar/obter app
      const slug = cfg.appId.replace(/\./g, "-").toLowerCase();
      setEasMsg("📦 Registrando app no Expo...");
      const app = await easEnsureApp(token, me.primaryAccount.name, slug, cfg.appName);
      setEasMsg(`✅ App: ${app.fullName}`);

      // 3. Obter URL de upload
      setPhase("uploading");
      setEasMsg("☁️ Obtendo URL de upload...");
      const uploadUrl = await easGetUploadUrl(token);

      // 4. Upload do ZIP
      setEasMsg("⬆️ Enviando projeto para o EAS...");
      await easUploadTarball(uploadUrl, resultBase64);
      setEasMsg("✅ Projeto enviado!");

      // 5. Criar build
      setPhase("building");
      setEasMsg("🔨 Iniciando compilação no EAS...");
      const build = await easCreateBuild(token, app.id, uploadUrl.bucketKey, {
        appId: cfg.appId,
        versionName: cfg.versionName,
        versionCode: cfg.versionCode,
        minSdk: cfg.minSdk,
      });
      setEasBuild(build);
      setEasMsg(`🏗️ Build iniciado! ID: ${build.id.slice(0, 8)}...`);

      // 6. Polling do status
      let current = build;
      let tries = 0;
      while (
        current.status !== "FINISHED" &&
        current.status !== "ERRORED" &&
        current.status !== "CANCELED" &&
        tries < 60
      ) {
        await new Promise(r => setTimeout(r, 15000));
        tries++;
        current = await easGetBuild(token, build.id);
        setEasBuild({ ...current });
        const mins = Math.round((tries * 15) / 60);
        setEasMsg(`🏗️ Compilando... ~${mins} min (${current.status})`);
      }

      if (current.status === "FINISHED") {
        setPhase("done");
        setEasBuild({ ...current });
        setEasMsg(`✅ APK pronto! Baixe em expo.dev`);
      } else {
        setPhase("error");
        setEasMsg(`❌ Build ${current.status}. Veja em expo.dev/accounts/${me.username}/builds/${build.id}`);
      }
    } catch (e) {
      setPhase("error");
      setEasMsg("❌ " + String(e));
    }
  }

  function openEasDashboard() {
    const url = easUser && easBuild
      ? `https://expo.dev/accounts/${easUser.username}/builds/${easBuild.id}`
      : "https://expo.dev/builds";
    Linking.openURL(url);
  }

  function Field({
    label, value, onChange, placeholder, mono,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; mono?: boolean;
  }) {
    return (
      <View>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput
          style={[s.input, mono && { fontFamily: "Inter_400Regular" }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    );
  }

  const orientationOptions: Array<{ label: string; value: AppConfig["orientation"] }> = [
    { label: "Retrato", value: "portrait" },
    { label: "Paisagem", value: "landscape" },
    { label: "Ambas", value: "any" },
  ];
  const sdkOptions = [21, 22, 24, 26, 28];
  const isBuildingEas = phase === "validating" || phase === "uploading" || phase === "building";

  if (!projectReady) {
    return (
      <View style={[s.root, { backgroundColor: BG, justifyContent: "center", alignItems: "center" }]}>
        <Feather name="package" size={48} color={MUTED} style={{ opacity: 0.5, marginBottom: 16 }} />
        <Text style={[s.title, { textAlign: "center" }]}>Nenhum projeto carregado</Text>
        <Text style={[s.hint, { color: MUTED, textAlign: "center", marginTop: 8, paddingHorizontal: 32 }]}>
          Importe um ZIP ou clone um repositório GitHub primeiro
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/index" as any)}
          style={({ pressed }) => [s.btn, { marginTop: 24, opacity: pressed ? 0.85 : 1 }]}
        >
          <Feather name="package" size={16} color="#fff" />
          <Text style={s.btnText}>→ Importar projeto</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: BG }]}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>⚙ Configurar APK</Text>
        <Text style={[s.hint, { color: MUTED }]}>{source}</Text>

        {/* Pure WebView badge */}
        <View style={[s.card, { padding: 12, borderColor: "#166534", backgroundColor: "#052e16" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Text style={{ fontSize: 16 }}>📱</Text>
            <Text style={[s.hint, { color: "#4ade80", fontFamily: "Inter_600SemiBold", fontSize: 12 }]}>
              PURO WEBVIEW ANDROID — SEM CAPACITOR
            </Text>
          </View>
          <Text style={[s.hint, { color: "#86efac", lineHeight: 17 }]}>
            Usa WebViewAssetLoader nativo do Android. Mais estável, tela cheia, back button, armazenamento local, links externos abrem no browser.
          </Text>
          {fromSubfolder && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
              backgroundColor: "#0f2a1a", borderRadius: 8, padding: 8 }}>
              <Feather name="folder" size={13} color="#4ade80" />
              <Text style={[s.hint, { color: "#4ade80" }]}>
                Detectado: pasta <Text style={{ fontFamily: "Inter_600SemiBold" }}>{fromSubfolder}/</Text> será usada como root do app ({webFiles.length} arquivos)
              </Text>
            </View>
          )}
          {!fromSubfolder && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
              backgroundColor: "#1c1000", borderRadius: 8, padding: 8 }}>
              <Feather name="info" size={13} color="#fbbf24" />
              <Text style={[s.hint, { color: "#fbbf24" }]}>
                Usando todos os {webFiles.length} arquivos importados como root do app
              </Text>
            </View>
          )}
          {!hasIndexHtml && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6,
              backgroundColor: "#1c0505", borderRadius: 8, padding: 8 }}>
              <Feather name="alert-triangle" size={13} color="#f87171" />
              <Text style={[s.hint, { color: "#f87171" }]}>
                ⚠ index.html não encontrado! Importe os arquivos compilados (dist/).
              </Text>
            </View>
          )}
        </View>

        {/* Config form */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>CONFIGURAÇÃO DO APLICATIVO</Text>
          <Field label="Nome do App *" value={cfg.appName}
            onChange={v => setCfg(c => ({ ...c, appName: v }))} placeholder="Meu App" />
          <Field label="Package ID *" value={cfg.appId}
            onChange={v => setCfg(c => ({ ...c, appId: v }))}
            placeholder="com.meuapp.app" mono />
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Field label="Versão" value={cfg.versionName}
                onChange={v => setCfg(c => ({ ...c, versionName: v }))} />
            </View>
            <View style={{ width: 90 }}>
              <Text style={s.fieldLabel}>Código</Text>
              <TextInput
                style={s.input}
                value={String(cfg.versionCode)}
                onChangeText={v => setCfg(c => ({ ...c, versionCode: Number(v) || 1 }))}
                keyboardType="numeric"
                placeholderTextColor={MUTED}
              />
            </View>
          </View>

          <Text style={s.fieldLabel}>Cor do tema</Text>
          <View style={s.colorRow}>
            <View style={[s.colorSwatch, { backgroundColor: cfg.themeColor }]} />
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={cfg.themeColor}
              onChangeText={v => setCfg(c => ({ ...c, themeColor: v }))}
              placeholderTextColor={MUTED}
              autoCapitalize="none"
            />
          </View>
          <Text style={s.fieldLabel}>Cor de fundo (splash)</Text>
          <View style={s.colorRow}>
            <View style={[s.colorSwatch, { backgroundColor: cfg.bgColor }]} />
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={cfg.bgColor}
              onChangeText={v => setCfg(c => ({ ...c, bgColor: v }))}
              placeholderTextColor={MUTED}
              autoCapitalize="none"
            />
          </View>

          <Text style={s.fieldLabel}>Orientação</Text>
          <View style={s.toggleRow}>
            {orientationOptions.map(o => (
              <Pressable
                key={o.value}
                onPress={() => setCfg(c => ({ ...c, orientation: o.value }))}
                style={[s.toggle, cfg.orientation === o.value && s.toggleActive]}
              >
                <Text style={[s.toggleText, cfg.orientation === o.value && { color: "#fff" }]}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.fieldLabel}>Android mínimo</Text>
          <View style={s.toggleRow}>
            {sdkOptions.map(sdk => (
              <Pressable
                key={sdk}
                onPress={() => setCfg(c => ({ ...c, minSdk: sdk }))}
                style={[s.toggle, cfg.minSdk === sdk && s.toggleActive]}
              >
                <Text style={[s.toggleText, cfg.minSdk === sdk && { color: "#fff" }]}>
                  {sdk}+
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Gerar ZIP */}
        <Pressable
          onPress={handleGenerate}
          disabled={generating || !cfg.appName || !cfg.appId}
          style={({ pressed }) => [
            s.btn,
            (!cfg.appName || !cfg.appId) && s.btnDisabled,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {generating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="zap" size={18} color="#fff" />}
          <Text style={s.btnText}>
            {generating ? `Gerando... ${progress}%` : "⚡ Gerar Projeto Android (.zip)"}
          </Text>
        </Pressable>

        {generating && (
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${progress}%` as any }]} />
          </View>
        )}

        {/* Resultado gerado */}
        {resultBase64 !== "" && (
          <>
            {/* Compartilhar ZIP */}
            <View style={[s.card, { borderColor: "#1e3a5f" }]}>
              <Text style={[s.sectionLabel, { color: "#60a5fa" }]}>📦 ZIP GERADO</Text>
              <Text style={[s.hint, { color: MUTED }]} numberOfLines={1}>{resultName}</Text>
              <Pressable
                onPress={handleShare}
                disabled={sharing}
                style={({ pressed }) => [s.btn, { backgroundColor: "#1e3a8a", opacity: pressed ? 0.85 : 1 }]}
              >
                {sharing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="share-2" size={16} color="#fff" />}
                <Text style={s.btnText}>
                  {sharing ? "Compartilhando..." : "Salvar / Compartilhar ZIP"}
                </Text>
              </Pressable>
            </View>

            {/* EAS Build */}
            <View style={[s.card, { borderColor: phase === "done" ? "#166534" : phase === "error" ? "#7f1d1d" : BORDER }]}>
              <Text style={s.sectionLabel}>🚀 COMPILAR APK VIA EAS BUILD</Text>
              <Text style={[s.hint, { color: MUTED }]}>
                O EAS compila o APK na nuvem. Você baixa direto do expo.dev.
              </Text>

              {/* Token input */}
              <Text style={s.fieldLabel}>Token EAS (expo.dev → Account → Access Tokens)</Text>
              <TextInput
                style={s.input}
                value={easInput}
                onChangeText={setEasInput}
                placeholder="eas_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={MUTED}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isBuildingEas}
              />

              {/* Botão de build */}
              <Pressable
                onPress={handleEasBuild}
                disabled={isBuildingEas || !easInput.trim()}
                style={({ pressed }) => [
                  s.btn,
                  { backgroundColor: "#7c3aed" },
                  (isBuildingEas || !easInput.trim()) && s.btnDisabled,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {isBuildingEas
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="cpu" size={18} color="#fff" />}
                <Text style={s.btnText}>
                  {isBuildingEas ? "Compilando na nuvem..." : "🔨 Compilar APK via EAS"}
                </Text>
              </Pressable>

              {/* Status */}
              {easMsg !== "" && (
                <View style={[
                  s.statusBox,
                  phase === "done" && { borderColor: "#166534", backgroundColor: "#052e16" },
                  phase === "error" && { borderColor: "#7f1d1d", backgroundColor: "#1c0505" },
                ]}>
                  <Text style={[s.hint, {
                    color: phase === "done" ? GREEN : phase === "error" ? "#f87171" : "#93c5fd",
                    lineHeight: 18,
                  }]}>
                    {easMsg}
                  </Text>
                </View>
              )}

              {/* Polling spinner */}
              {phase === "building" && (
                <View style={[s.row, { alignItems: "center", gap: 8 }]}>
                  <ActivityIndicator size="small" color={ACCENT} />
                  <Text style={[s.hint, { color: MUTED }]}>
                    Verificando a cada 15 segundos... Pode levar 5–15 min.
                  </Text>
                </View>
              )}

              {/* Botão abrir expo.dev */}
              {(phase === "done" || phase === "building" || (phase === "error" && easBuild)) && (
                <Pressable
                  onPress={openEasDashboard}
                  style={({ pressed }) => [s.btn, { backgroundColor: "#0f172a", borderWidth: 1, borderColor: ACCENT, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Feather name="external-link" size={16} color={ACCENT} />
                  <Text style={[s.btnText, { color: ACCENT }]}>
                    {phase === "done" ? "⬇ Baixar APK no expo.dev" : "Ver build no expo.dev"}
                  </Text>
                </Pressable>
              )}

              {/* Download direto se disponível */}
              {phase === "done" && easBuild?.artifacts?.buildUrl && (
                <Pressable
                  onPress={() => Linking.openURL(easBuild.artifacts!.buildUrl!)}
                  style={({ pressed }) => [s.btn, { backgroundColor: "#166534", opacity: pressed ? 0.85 : 1 }]}
                >
                  <Feather name="download" size={16} color="#fff" />
                  <Text style={s.btnText}>⬇ Download direto do APK</Text>
                </Pressable>
              )}

              <Text style={[s.hint, { color: "#475569", marginTop: 4 }]}>
                💡 Gere o token em: expo.dev → Configurações → Access Tokens
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: WHITE, letterSpacing: -0.5 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 14, gap: 10 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED, marginBottom: 4, marginTop: 2 },
  input: {
    backgroundColor: "#0a0f1e", borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, fontFamily: "Inter_400Regular", color: WHITE,
    marginBottom: 4,
  },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  colorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  colorSwatch: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  toggleRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  toggle: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: BORDER, backgroundColor: "#0a0f1e",
  },
  toggleActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  toggleText: { fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED },
  btn: {
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 13,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  btnDisabled: { backgroundColor: "#1e293b" },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  progressBar: { height: 4, backgroundColor: "#1e293b", borderRadius: 2, overflow: "hidden", marginTop: -6 },
  progressFill: { height: "100%", backgroundColor: ACCENT, borderRadius: 2 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16 },
  statusBox: {
    backgroundColor: "#0a1628", borderWidth: 1, borderColor: "#1e3a5f",
    borderRadius: 10, padding: 10,
  },
  _unused: { color: ORANGE },
});
