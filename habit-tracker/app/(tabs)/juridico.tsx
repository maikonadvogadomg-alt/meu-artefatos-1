import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator,
  Pressable, TextInput, Platform, BackHandler,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as _FileSystem from "expo-file-system";
const FileSystem = _FileSystem as any;

const BG = "#06090f";
const CARD = "#0d1526";
const BORDER = "#1a2540";
const ACCENT = "#34d399";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";

const BUNDLE_KEY = "juridico_bundle_extracted_v1";
const URL_KEY = "juridico_custom_url";
const BASE_DIR = () => (FileSystem.documentDirectory as string) + "webapps/juridico/";

function defaultUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}/assistente-juridico/` : "";
}

async function extractBundle(): Promise<string> {
  const dir = BASE_DIR();
  const indexPath = dir + "index.html";

  // Verifica se já foi extraído
  const info = await FileSystem.getInfoAsync(indexPath);
  if (info.exists) return indexPath;

  // Importa o bundle (lazy para não travar na inicialização)
  const bundle: Record<string, string> = require("../../assets/juridico-bundle.json");

  // Extrai todos os arquivos
  for (const [filePath, b64] of Object.entries(bundle)) {
    const fullPath = dir + filePath;
    const parts = fullPath.split("/");
    parts.pop();
    const fileDir = parts.join("/");
    await FileSystem.makeDirectoryAsync(fileDir, { intermediates: true });
    await FileSystem.writeAsStringAsync(fullPath, b64, {
      encoding: (FileSystem.EncodingType as any).Base64,
    });
  }
  return indexPath;
}

export default function JuridicoScreen() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);

  const [localUri, setLocalUri] = useState<string>("");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [useCustom, setUseCustom] = useState<boolean>(false);
  const [editUrl, setEditUrl] = useState(false);
  const [extracting, setExtracting] = useState(true);
  const [extractError, setExtractError] = useState("");
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const extract = useCallback(async () => {
    setExtracting(true);
    setExtractError("");
    try {
      const uri = await extractBundle();
      setLocalUri(uri);
    } catch (e) {
      setExtractError(String(e));
    } finally {
      setExtracting(false);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.multiGet([URL_KEY, "juridico_use_custom"]).then(pairs => {
      const url = pairs[0][1] ?? "";
      const mode = pairs[1][1] === "true";
      setCustomUrl(url);
      setInputUrl(url);
      setUseCustom(mode && !!url);
    });
    extract();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  function saveUrl() {
    const u = inputUrl.trim();
    AsyncStorage.setItem(URL_KEY, u);
    setCustomUrl(u);
    setUseCustom(!!u);
    AsyncStorage.setItem("juridico_use_custom", u ? "true" : "false");
    setEditUrl(false);
  }

  function toggleSource() {
    const next = !useCustom;
    setUseCustom(next);
    AsyncStorage.setItem("juridico_use_custom", next ? "true" : "false");
  }

  const activeUri = useCustom && customUrl ? customUrl : (localUri ? "file://" + localUri : "");
  const tabH = Platform.OS === "web" ? 64 : 84;

  return (
    <View style={[s.root, { backgroundColor: BG }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.left}>
          <Text style={{ fontSize: 20 }}>⚖️</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Assistente Jurídico</Text>
            <Text style={s.sub} numberOfLines={1}>
              {useCustom && customUrl ? `🌐 ${customUrl}` : localUri ? "📦 Embutido no APK" : extracting ? "⏳ Extraindo..." : "❌ Erro"}
            </Text>
          </View>
        </View>
        <View style={s.btns}>
          {canGoBack && (
            <Pressable onPress={() => webRef.current?.goBack()} style={s.btn}>
              <Feather name="arrow-left" size={17} color={MUTED} />
            </Pressable>
          )}
          <Pressable onPress={() => { webRef.current?.reload(); setLoading(true); }} style={s.btn}>
            <Feather name="refresh-cw" size={16} color={MUTED} />
          </Pressable>
          {!useCustom && localUri ? (
            <Pressable onPress={toggleSource} style={[s.btn, { backgroundColor: ACCENT + "22" }]}>
              <Feather name="package" size={16} color={ACCENT} />
            </Pressable>
          ) : useCustom ? (
            <Pressable onPress={toggleSource} style={[s.btn, { backgroundColor: "#3b82f622" }]}>
              <Feather name="globe" size={16} color="#60a5fa" />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setEditUrl(v => !v)} style={[s.btn, editUrl && { backgroundColor: ACCENT + "33" }]}>
            <Feather name="settings" size={16} color={editUrl ? ACCENT : MUTED} />
          </Pressable>
        </View>
      </View>

      {/* URL editor */}
      {editUrl && (
        <View style={s.urlRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[s.urlLabel, { color: MUTED }]}>URL alternativa (opcional — usa bundle offline por padrão):</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={s.urlInput}
                value={inputUrl}
                onChangeText={setInputUrl}
                placeholder="https://seu-servidor.com/assistente-juridico/"
                placeholderTextColor="#334155"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={saveUrl}
              />
              <Pressable onPress={saveUrl} style={s.goBtn}>
                <Feather name="check" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Content */}
      {extracting ? (
        <View style={s.empty}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={s.emptyTitle}>Preparando Assistente Jurídico...</Text>
          <Text style={s.emptySub}>Extraindo arquivos para o dispositivo (1ª vez apenas)</Text>
        </View>
      ) : extractError && !useCustom ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
          <Text style={s.emptyTitle}>Erro ao extrair</Text>
          <Text style={s.emptySub}>{extractError}</Text>
          <Pressable onPress={extract} style={[s.goBtn, { marginTop: 20, paddingHorizontal: 24 }]}>
            <Text style={{ color: "#fff", fontSize: 13 }}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : !activeUri ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>⚖️</Text>
          <Text style={s.emptyTitle}>Configure a URL</Text>
          <Text style={s.emptySub}>Toque em ⚙️ para configurar</Text>
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: activeUri }}
          style={{ flex: 1, marginBottom: tabH }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => setLoading(false)}
          onNavigationStateChange={st => setCanGoBack(st.canGoBack)}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          originWhitelist={["*"]}
          geolocationEnabled
        />
      )}

      {loading && activeUri && !extracting && (
        <View style={s.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={s.loadingTxt}>Carregando...</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: BG,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  title: { fontSize: 15, fontFamily: "Inter_700Bold", color: WHITE },
  sub: { fontSize: 10, fontFamily: "Inter_400Regular", color: MUTED, maxWidth: 240 },
  btns: { flexDirection: "row", gap: 4 },
  btn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: CARD },
  urlRow: {
    gap: 8, paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  urlLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  urlInput: {
    flex: 1, backgroundColor: BG, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 12, fontFamily: "Inter_400Regular", color: WHITE,
    borderWidth: 1, borderColor: BORDER,
  },
  goBtn: {
    backgroundColor: ACCENT, borderRadius: 10,
    paddingHorizontal: 14, alignItems: "center", justifyContent: "center",
    minHeight: 38,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: WHITE, textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 20 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG + "cc",
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  loadingTxt: { fontSize: 13, fontFamily: "Inter_500Medium", color: MUTED },
});
