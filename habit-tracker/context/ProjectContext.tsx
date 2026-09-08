import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AppConfig {
  appName: string; appId: string; versionName: string; versionCode: number;
  themeColor: string; bgColor: string; orientation: "portrait" | "landscape" | "any"; minSdk: number;
}
export const DEFAULT_CFG: AppConfig = {
  appName: "", appId: "", versionName: "1.0.0", versionCode: 1,
  themeColor: "#6366f1", bgColor: "#0f172a", orientation: "portrait", minSdk: 22,
};
export interface ProjectFile { path: string; data: string; }

export interface ApiKey {
  id: string; label: string; url: string; key: string; model: string;
  status?: "ok" | "error" | "testing" | "unknown";
}
export interface ChatMsg {
  id: string; role: "user" | "assistant"; content: string; timestamp: string;
}
export interface ChatSession {
  id: string; title: string; createdAt: string; messages: ChatMsg[];
}

interface ProjectCtx {
  files: ProjectFile[]; cfg: AppConfig; source: string; projectReady: boolean;
  resultBase64: string; resultName: string; ghToken: string; easToken: string;
  aiUrl: string; aiKey: string; aiModel: string;
  apiKeys: ApiKey[]; activeKeyId: string;
  chatSessions: ChatSession[]; activeChatId: string;
  voiceTts: boolean; voiceRate: number; voicePitch: number; selectedVoice: string;
  neonDbUrl: string;
  setFiles: (f: ProjectFile[]) => void;
  setCfg: (c: AppConfig | ((p: AppConfig) => AppConfig)) => void;
  setSource: (s: string) => void; setProjectReady: (b: boolean) => void;
  setResult: (b64: string, name: string) => void;
  setGhToken: (t: string) => void; setEasToken: (t: string) => void;
  setAiKeys: (url: string, key: string, model: string) => void;
  addApiKey: (k: ApiKey) => void; removeApiKey: (id: string) => void;
  updateApiKey: (id: string, patch: Partial<ApiKey>) => void; setActiveKeyId: (id: string) => void;
  createSession: () => string; deleteSession: (id: string) => void;
  addMessage: (sid: string, msg: ChatMsg) => void; setActiveChatId: (id: string) => void;
  renameSession: (id: string, title: string) => void; clearSession: (id: string) => void;
  importSession: (s: ChatSession) => void;
  setVoiceTts: (v: boolean) => void; setVoiceRate: (v: number) => void;
  setVoicePitch: (v: number) => void; setSelectedVoice: (v: string) => void;
  setNeonDbUrl: (v: string) => void;
  reset: () => void;
}

const Ctx = createContext<ProjectCtx>({} as ProjectCtx);
export const useProject = () => useContext(Ctx);

const SK = {
  gh: "gh_token", eas: "eas_token", aiUrl: "custom_api_url", aiKey: "custom_api_key",
  aiModel: "custom_api_model", apiKeys: "api_keys_v2", activeKey: "active_key_id",
  sessions: "chat_sessions_v2", activeChat: "active_chat_id",
  voiceTts: "voice_tts", voiceRate: "voice_rate", voicePitch: "voice_pitch", voiceName: "voice_name",
  neonDbUrl: "neon_db_url",
  cfg: "project_cfg_v1", source: "project_source",
};
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function saveKeys(k: ApiKey[]) { AsyncStorage.setItem(SK.apiKeys, JSON.stringify(k)); }
function saveSessions(s: ChatSession[]) { AsyncStorage.setItem(SK.sessions, JSON.stringify(s)); }

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [files, setFilesState] = useState<ProjectFile[]>([]);
  const [cfg, setCfgState] = useState<AppConfig>(DEFAULT_CFG);
  const [source, setSourceState] = useState("");
  const [projectReady, setProjectReadyState] = useState(false);
  const [resultBase64, setResultBase64] = useState("");
  const [resultName, setResultName] = useState("");
  const [ghToken, setGhTokenState] = useState("");
  const [easToken, setEasTokenState] = useState("");
  const [aiUrl, setAiUrl] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [apiKeys, setApiKeysState] = useState<ApiKey[]>([]);
  const [activeKeyId, setActiveKeyIdState] = useState("");
  const [chatSessions, setChatSessionsState] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatIdState] = useState("");
  const [voiceTts, setVoiceTtsState] = useState(false);
  const [voiceRate, setVoiceRateState] = useState(0.9);
  const [voicePitch, setVoicePitchState] = useState(1.0);
  const [selectedVoice, setSelectedVoiceState] = useState("");
  const [neonDbUrl, setNeonDbUrlState] = useState("");

  React.useEffect(() => {
    AsyncStorage.multiGet(Object.values(SK)).then(pairs => {
      const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
      setGhTokenState(m[SK.gh]); setEasTokenState(m[SK.eas]);
      setAiUrl(m[SK.aiUrl]); setAiKey(m[SK.aiKey]);
      setAiModel(m[SK.aiModel] || "gpt-4o-mini");
      try { if (m[SK.apiKeys]) setApiKeysState(JSON.parse(m[SK.apiKeys])); } catch {}
      if (m[SK.activeKey]) setActiveKeyIdState(m[SK.activeKey]);
      try { if (m[SK.sessions]) setChatSessionsState(JSON.parse(m[SK.sessions])); } catch {}
      if (m[SK.activeChat]) setActiveChatIdState(m[SK.activeChat]);
      if (m[SK.voiceTts]) setVoiceTtsState(m[SK.voiceTts] === "true");
      if (m[SK.voiceRate]) setVoiceRateState(parseFloat(m[SK.voiceRate]) || 0.9);
      if (m[SK.voicePitch]) setVoicePitchState(parseFloat(m[SK.voicePitch]) || 1.0);
      if (m[SK.voiceName]) setSelectedVoiceState(m[SK.voiceName]);
      if (m[SK.neonDbUrl]) setNeonDbUrlState(m[SK.neonDbUrl]);
      // Restore saved project config
      try { if (m[SK.cfg]) setCfgState(JSON.parse(m[SK.cfg])); } catch {}
      if (m[SK.source]) setSourceState(m[SK.source]);
    });
  }, []);

  const setFiles = useCallback((f: ProjectFile[]) => setFilesState(f), []);
  const setCfg = useCallback((c: AppConfig | ((p: AppConfig) => AppConfig)) => {
    setCfgState(prev => {
      const next = typeof c === "function" ? c(prev) : c;
      AsyncStorage.setItem(SK.cfg, JSON.stringify(next));
      return next;
    });
  }, []);
  const setSource = useCallback((s: string) => {
    setSourceState(s);
    AsyncStorage.setItem(SK.source, s);
  }, []);
  const setProjectReady = useCallback((b: boolean) => setProjectReadyState(b), []);
  const setResult = useCallback((b64: string, name: string) => { setResultBase64(b64); setResultName(name); }, []);
  const setGhToken = useCallback((t: string) => { setGhTokenState(t); AsyncStorage.setItem(SK.gh, t); }, []);
  const setEasToken = useCallback((t: string) => { setEasTokenState(t); AsyncStorage.setItem(SK.eas, t); }, []);
  const setAiKeys = useCallback((url: string, key: string, model: string) => {
    setAiUrl(url); setAiKey(key); setAiModel(model);
    AsyncStorage.multiSet([[SK.aiUrl, url], [SK.aiKey, key], [SK.aiModel, model]]);
  }, []);
  const addApiKey = useCallback((k: ApiKey) => {
    setApiKeysState(prev => { const n = [...prev, k]; saveKeys(n); return n; });
  }, []);
  const removeApiKey = useCallback((id: string) => {
    setApiKeysState(prev => { const n = prev.filter(k => k.id !== id); saveKeys(n); return n; });
  }, []);
  const updateApiKey = useCallback((id: string, patch: Partial<ApiKey>) => {
    setApiKeysState(prev => { const n = prev.map(k => k.id === id ? { ...k, ...patch } : k); saveKeys(n); return n; });
  }, []);
  const setActiveKeyId = useCallback((id: string) => {
    setActiveKeyIdState(id); AsyncStorage.setItem(SK.activeKey, id);
  }, []);
  const createSession = useCallback((): string => {
    const id = uid();
    const s: ChatSession = { id, title: "Nova conversa", createdAt: new Date().toISOString(), messages: [] };
    setChatSessionsState(prev => { const n = [s, ...prev]; saveSessions(n); return n; });
    setActiveChatIdState(id); AsyncStorage.setItem(SK.activeChat, id);
    return id;
  }, []);
  const deleteSession = useCallback((id: string) => {
    setChatSessionsState(prev => { const n = prev.filter(s => s.id !== id); saveSessions(n); return n; });
  }, []);
  const addMessage = useCallback((sid: string, msg: ChatMsg) => {
    setChatSessionsState(prev => {
      const n = prev.map(s => {
        if (s.id !== sid) return s;
        const msgs = [...s.messages, msg];
        const title = s.title === "Nova conversa" && msg.role === "user"
          ? msg.content.slice(0, 42).replace(/\n/g, " ") : s.title;
        return { ...s, messages: msgs, title };
      });
      saveSessions(n); return n;
    });
  }, []);
  const setActiveChatId = useCallback((id: string) => {
    setActiveChatIdState(id); AsyncStorage.setItem(SK.activeChat, id);
  }, []);
  const renameSession = useCallback((id: string, title: string) => {
    setChatSessionsState(prev => { const n = prev.map(s => s.id === id ? { ...s, title } : s); saveSessions(n); return n; });
  }, []);
  const clearSession = useCallback((id: string) => {
    setChatSessionsState(prev => { const n = prev.map(s => s.id === id ? { ...s, messages: [] } : s); saveSessions(n); return n; });
  }, []);
  const importSession = useCallback((s: ChatSession) => {
    setChatSessionsState(prev => { const n = [s, ...prev.filter(x => x.id !== s.id)]; saveSessions(n); return n; });
    setActiveChatIdState(s.id); AsyncStorage.setItem(SK.activeChat, s.id);
  }, []);
  const setVoiceTts = useCallback((v: boolean) => { setVoiceTtsState(v); AsyncStorage.setItem(SK.voiceTts, String(v)); }, []);
  const setVoiceRate = useCallback((v: number) => { setVoiceRateState(v); AsyncStorage.setItem(SK.voiceRate, String(v)); }, []);
  const setVoicePitch = useCallback((v: number) => { setVoicePitchState(v); AsyncStorage.setItem(SK.voicePitch, String(v)); }, []);
  const setSelectedVoice = useCallback((v: string) => { setSelectedVoiceState(v); AsyncStorage.setItem(SK.voiceName, v); }, []);
  const setNeonDbUrl = useCallback((v: string) => { setNeonDbUrlState(v); AsyncStorage.setItem(SK.neonDbUrl, v); }, []);
  const reset = useCallback(() => {
    setFilesState([]); setCfgState(DEFAULT_CFG); setSourceState("");
    setProjectReadyState(false); setResultBase64(""); setResultName("");
  }, []);

  return (
    <Ctx.Provider value={{
      files, cfg, source, projectReady, resultBase64, resultName,
      ghToken, easToken, aiUrl, aiKey, aiModel,
      apiKeys, activeKeyId, chatSessions, activeChatId,
      voiceTts, voiceRate, voicePitch, selectedVoice, neonDbUrl,
      setFiles, setCfg, setSource, setProjectReady, setResult,
      setGhToken, setEasToken, setAiKeys,
      addApiKey, removeApiKey, updateApiKey, setActiveKeyId,
      createSession, deleteSession, addMessage, setActiveChatId,
      renameSession, clearSession, importSession,
      setVoiceTts, setVoiceRate, setVoicePitch, setSelectedVoice, setNeonDbUrl, reset,
    }}>
      {children}
    </Ctx.Provider>
  );
}
