export interface ProviderProfile {
  id: string;
  name: string;
  icon: string;
  url: string;
  model: string;
  color: string;
  confidence: "high" | "low";
  hint?: string;
}

export const PROVIDERS: ProviderProfile[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "🤖",
    url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    color: "#10a37f",
    confidence: "high",
    hint: "Prefixos: sk-, sk-proj-",
  },
  {
    id: "anthropic",
    name: "Anthropic / Claude",
    icon: "🧠",
    url: "https://api.anthropic.com/v1",
    model: "claude-3-5-haiku-20241022",
    color: "#c17f3c",
    confidence: "high",
    hint: "Prefixo: sk-ant-",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "🔀",
    url: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    color: "#6366f1",
    confidence: "high",
    hint: "Prefixo: sk-or-",
  },
  {
    id: "groq",
    name: "Groq",
    icon: "⚡",
    url: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    color: "#f97316",
    confidence: "high",
    hint: "Prefixo: gsk_",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "✨",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.0-flash",
    color: "#4285f4",
    confidence: "high",
    hint: "Prefixo: AIza",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    icon: "🔍",
    url: "https://api.perplexity.ai",
    model: "sonar",
    color: "#20b2aa",
    confidence: "high",
    hint: "Prefixo: pplx-",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "🐋",
    url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    color: "#1f77b4",
    confidence: "high",
    hint: "Prefixo: sk- (DeepSeek)",
  },
  {
    id: "huggingface",
    name: "HuggingFace",
    icon: "🤗",
    url: "https://api-inference.huggingface.co/v1",
    model: "meta-llama/Llama-3.1-8B-Instruct",
    color: "#ffd21e",
    confidence: "high",
    hint: "Prefixo: hf_",
  },
  {
    id: "mistral",
    name: "Mistral",
    icon: "🌊",
    url: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    color: "#ff7000",
    confidence: "low",
    hint: "Selecione manualmente",
  },
  {
    id: "together",
    name: "Together AI",
    icon: "🤝",
    url: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3-70b-chat-hf",
    color: "#7c3aed",
    confidence: "low",
    hint: "Selecione manualmente",
  },
  {
    id: "cohere",
    name: "Cohere",
    icon: "💫",
    url: "https://api.cohere.ai/v1",
    model: "command-r",
    color: "#39594d",
    confidence: "low",
    hint: "Prefixo: co-",
  },
  {
    id: "replicate",
    name: "Replicate",
    icon: "🔁",
    url: "https://api.replicate.com/v1",
    model: "meta/llama-3.1-405b-instruct",
    color: "#64748b",
    confidence: "high",
    hint: "Prefixo: r8_",
  },
];

export const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map(p => [p.id, p]));

export function detectProvider(key: string): ProviderProfile | null {
  const k = key.trim();
  if (!k || k.length < 8) return null;

  if (k.startsWith("sk-ant-api"))    return PROVIDER_MAP.anthropic;
  if (k.startsWith("sk-ant-"))       return PROVIDER_MAP.anthropic;
  if (k.startsWith("sk-or-v1-"))     return PROVIDER_MAP.openrouter;
  if (k.startsWith("sk-or-"))        return PROVIDER_MAP.openrouter;
  if (k.startsWith("gsk_"))          return PROVIDER_MAP.groq;
  if (k.startsWith("AIza"))          return PROVIDER_MAP.gemini;
  if (k.startsWith("pplx-"))         return PROVIDER_MAP.perplexity;
  if (k.startsWith("hf_"))           return PROVIDER_MAP.huggingface;
  if (k.startsWith("r8_"))           return PROVIDER_MAP.replicate;
  if (k.startsWith("co-"))           return PROVIDER_MAP.cohere;
  if (k.startsWith("sk-proj-"))      return PROVIDER_MAP.openai;
  if (k.startsWith("sk-") && k.length >= 48) return PROVIDER_MAP.openai;
  // DeepSeek keys are sk- but shorter
  if (k.startsWith("sk-") && k.length >= 32) return PROVIDER_MAP.openai;

  return null;
}

export function getConfidenceLabel(p: ProviderProfile): string {
  return p.confidence === "high" ? "detectado automaticamente" : "selecionado manualmente";
}
