import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BG = "#080c18";
const CARD = "#0f1629";
const BORDER = "#1e293b";
const ACCENT = "#6366f1";
const MUTED = "#64748b";
const WHITE = "#f1f5f9";

const STEPS = [
  {
    icon: "1️⃣",
    title: "Gere o build do seu PWA",
    body: "No terminal do projeto:\n• pnpm build  (ou  npm run build)\n\nIsso cria a pasta dist/ com os arquivos otimizados. Compacte como ZIP.",
  },
  {
    icon: "2️⃣",
    title: "Importe aqui",
    body: "Aba Importar → toque para selecionar o ZIP.\nOu aba GitHub → cole o token → selecione o repositório.\nDetecção automática de nome e ID.",
  },
  {
    icon: "3️⃣",
    title: "Configure o APK",
    body: "Na aba Exportar:\n• Nome do app e Package ID único (ex: com.seunome.meuapp)\n• Versão, cores e orientação\n\n⚠ O Package ID não pode mudar depois de instalado!",
  },
  {
    icon: "4️⃣",
    title: "Gere e compartilhe",
    body: "Toque em 'Gerar Projeto Android'. O ZIP é criado com o projeto Android Studio completo.\n\nToque em 'Baixar / Compartilhar ZIP' → salve no Google Drive, e-mail ou Arquivos.",
  },
  {
    icon: "5️⃣",
    title: "Abra no Android Studio",
    body: "No computador:\n1. Extraia o ZIP\n2. Android Studio → File → Open → pasta android/\n3. Aguarde o Gradle sync (5-10 min na primeira vez)\n4. Se pedir versão do JDK, use Java 17",
  },
  {
    icon: "6️⃣",
    title: "Compile o APK",
    body: "Build → Build Bundle(s)/APK(s) → Build APK(s)\n\nAPK gerado em:\nandroid/app/build/outputs/apk/debug/app-debug.apk",
  },
  {
    icon: "7️⃣",
    title: "Instale no celular",
    body: "No celular:\n• Configurações → Segurança → Instalar apps desconhecidos ✓\n\nTransfira o .apk via USB, WhatsApp, Drive ou Bluetooth e toque para instalar.",
  },
  {
    icon: "8️⃣",
    title: "Assinar para a Play Store",
    body: "Android Studio:\nBuild → Generate Signed Bundle/APK → crie um keystore (.jks)\n\n⚠ Guarde o keystore com segurança — sem ele não é possível atualizar o app na loja!",
  },
];

const LINKS = [
  { label: "⬇ Android Studio", url: "https://developer.android.com/studio" },
  { label: "📖 Capacitor Docs", url: "https://capacitorjs.com/docs/android" },
  { label: "🏪 Google Play Console", url: "https://play.google.com/console" },
  { label: "🔑 GitHub Tokens", url: "https://github.com/settings/tokens" },
];

export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 0 : 0;

  return (
    <View style={[s.root, { backgroundColor: BG }]}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + webTop + 20, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[s.heroBanner]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📖</Text>
          <Text style={s.heroTitle}>Do PWA ao APK instalado</Text>
          <Text style={[s.hint, { color: MUTED, textAlign: "center" }]}>
            Passo a passo completo — do projeto web ao app no celular
          </Text>
        </View>

        {/* Steps */}
        {STEPS.map((step, i) => (
          <View key={i} style={[s.step]}>
            <Text style={s.stepIcon}>{step.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>{step.title}</Text>
              <Text style={[s.hint, { color: MUTED, lineHeight: 18, marginTop: 4 }]}>{step.body}</Text>
            </View>
          </View>
        ))}

        {/* Links úteis */}
        <View style={[s.card, { marginTop: 4 }]}>
          <Text style={s.sectionLabel}>LINKS ÚTEIS</Text>
          <View style={{ gap: 8 }}>
            {LINKS.map(link => (
              <Pressable
                key={link.url}
                onPress={() => Linking.openURL(link.url)}
                style={({ pressed }) => [s.linkRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[s.label, { flex: 1 }]}>{link.label}</Text>
                <Feather name="external-link" size={14} color={MUTED} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Dica final */}
        <View style={[s.card, { borderColor: "#1e3a5f", backgroundColor: "#0a1929" }]}>
          <Feather name="info" size={16} color="#60a5fa" />
          <Text style={[s.hint, { color: "#93c5fd", lineHeight: 18 }]}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Dica pro: </Text>
            Use o Capacitor Live Reload durante o desenvolvimento:{"\n"}
            <Text style={{ fontFamily: "Inter_400Regular", color: MUTED }}>npx cap run android --livereload --external</Text>
            {"\n"}Assim você vê as mudanças do PWA em tempo real no celular sem precisar recompilar.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 10 },
  heroBanner: {
    alignItems: "center", padding: 20,
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  heroTitle: {
    fontSize: 20, fontFamily: "Inter_700Bold", color: WHITE,
    textAlign: "center", letterSpacing: -0.5,
  },
  card: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 16, padding: 14, gap: 10,
  },
  step: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, padding: 14,
  },
  stepIcon: { fontSize: 22, lineHeight: 26 },
  stepTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: WHITE },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, letterSpacing: 0.8 },
  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER,
  },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: WHITE },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED },
});
