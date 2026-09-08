/**
 * Terminal.tsx — Terminal browser-based (100% offline, sem servidor).
 * Usa xterm.js + eval de JavaScript no navegador.
 * Comandos: help, clear, info, eval <code>, e guia de APK.
 */
import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

/* ─── cores ANSI ─── */
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  cyan:   "\x1b[36m",
  red:    "\x1b[31m",
  violet: "\x1b[35m",
  gray:   "\x1b[90m",
  white:  "\x1b[97m",
};

/* Detecta se roda no APK (file://) — sem proxy, requisições diretas */
const IS_APK = typeof window !== "undefined" && window.location.protocol === "file:";

const BANNER = [
  `${C.violet}${C.bold}╔════════════════════════════════════════════════╗${C.reset}`,
  `${C.violet}${C.bold}║   🤖 APK Builder — Terminal Embutido v2.0      ║${C.reset}`,
  `${C.violet}${C.bold}╚════════════════════════════════════════════════╝${C.reset}`,
  IS_APK
    ? `${C.green}  Modo APK · Sem proxy · Requisições diretas · Sem limite${C.reset}`
    : `${C.gray}  Modo browser · Digite help para ver os comandos${C.reset}`,
  "",
];

const HELP_LINES = [
  `${C.bold}${C.cyan}Comandos disponíveis:${C.reset}`,
  `  ${C.yellow}help${C.reset}          — Esta ajuda`,
  `  ${C.yellow}clear${C.reset}         — Limpar terminal`,
  `  ${C.yellow}info${C.reset}          — Info do navegador e sistema`,
  `  ${C.yellow}guia${C.reset}          — Guia completo para gerar APK`,
  `  ${C.yellow}etapas${C.reset}        — Passos rápidos (GitHub Actions)`,
  `  ${C.yellow}erros${C.reset}         — Soluções para erros comuns`,
  `  ${C.yellow}eval <código>${C.reset} — Executar JavaScript`,
  `  ${C.yellow}fetch <url>${C.reset}   — Buscar URL (exibe resposta)`,
  `  ${C.yellow}json <url>${C.reset}    — Buscar JSON formatado`,
  `  ${C.yellow}base64 <texto>${C.reset}— Codificar em base64`,
  `  ${C.yellow}time${C.reset}          — Data/hora atual`,
  `  ${C.yellow}uuid${C.reset}          — Gerar UUID aleatório`,
  "",
];

const GUIA_LINES = [
  `${C.bold}${C.green}═══ GUIA: Como Gerar seu APK ═══${C.reset}`,
  "",
  `${C.yellow}${C.bold}MÉTODO 1 — GitHub Actions (Gratuito, sem instalar nada)${C.reset}`,
  `${C.gray}  Funciona 100% na nuvem. Recomendado para a maioria.${C.reset}`,
  "",
  `  ${C.cyan}1.${C.reset} Na aba ${C.bold}Importar${C.reset}: carregue seu ZIP ou importe do GitHub`,
  `  ${C.cyan}2.${C.reset} Na aba ${C.bold}Config${C.reset}: defina nome, package (ex: com.meuapp) e versão`,
  `  ${C.cyan}3.${C.reset} Na aba ${C.bold}Exportar${C.reset}: clique ${C.yellow}"Baixar ZIP"${C.reset} para ter o projeto Android`,
  `  ${C.cyan}4.${C.reset} Crie repositório em ${C.blue}https://github.com/new${C.reset}`,
  `  ${C.cyan}5.${C.reset} Descompacte o ZIP e faça push:`,
  `     ${C.gray}git init${C.reset}`,
  `     ${C.gray}git add .${C.reset}`,
  `     ${C.gray}git commit -m "APK inicial"${C.reset}`,
  `     ${C.gray}git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git${C.reset}`,
  `     ${C.gray}git push -u origin main${C.reset}`,
  `  ${C.cyan}6.${C.reset} Aguarde ~5 min → vá em ${C.blue}Repositório → Actions${C.reset}`,
  `  ${C.cyan}7.${C.reset} Quando verde ✅ → ${C.blue}Releases → latest-apk${C.reset} → baixe o .apk`,
  "",
  `${C.yellow}${C.bold}MÉTODO 2 — Exportar e Enviar via GitHub (na aba GitHub)${C.reset}`,
  `${C.gray}  Mais rápido se já tem conta GitHub conectada.${C.reset}`,
  `  ${C.cyan}1.${C.reset} Aba ${C.bold}GitHub${C.reset}: faça login com token`,
  `  ${C.cyan}2.${C.reset} Clique ${C.yellow}"Exportar Android → GitHub"${C.reset}`,
  `  ${C.cyan}3.${C.reset} Build inicia automaticamente no GitHub Actions`,
  "",
  `${C.yellow}${C.bold}MÉTODO 3 — Android Studio (local)${C.reset}`,
  `  ${C.cyan}1.${C.reset} Baixe ${C.blue}https://developer.android.com/studio${C.reset}`,
  `  ${C.cyan}2.${C.reset} Abra a pasta ${C.gray}android/${C.reset} do ZIP no Android Studio`,
  `  ${C.cyan}3.${C.reset} ${C.bold}Build → Build APK${C.reset}`,
  `  ${C.cyan}4.${C.reset} APK em: ${C.gray}android/app/build/outputs/apk/debug/${C.reset}`,
  "",
];

const ETAPAS_LINES = [
  `${C.bold}${C.green}Passos Rápidos — GitHub Actions${C.reset}`,
  `${C.gray}(Copie e execute no terminal do seu computador)${C.reset}`,
  "",
  `${C.yellow}# Depois de descompactar o ZIP gerado:${C.reset}`,
  `${C.cyan}cd pasta-do-projeto${C.reset}`,
  `${C.cyan}git init${C.reset}`,
  `${C.cyan}git add .${C.reset}`,
  `${C.cyan}git commit -m "init: APK Builder"${C.reset}`,
  `${C.cyan}git branch -M main${C.reset}`,
  `${C.cyan}git remote add origin https://github.com/USUARIO/REPO.git${C.reset}`,
  `${C.cyan}git push -u origin main${C.reset}`,
  "",
  `${C.gray}Em ~5 minutos o APK estará em: Repositório → Releases → latest-apk${C.reset}`,
  "",
];

const ERROS_LINES = [
  `${C.bold}${C.red}Soluções para Erros Comuns${C.reset}`,
  "",
  `${C.yellow}Erro: "gradle-wrapper.jar not found"${C.reset}`,
  `  ${C.gray}→ O arquivo gradle-wrapper.jar está faltando.${C.reset}`,
  `  ${C.gray}  Solução: Use Android Studio que baixa automaticamente.${C.reset}`,
  `  ${C.gray}  Ou use o GitHub Actions (CI) — ele baixa Gradle sozinho.${C.reset}`,
  "",
  `${C.yellow}Erro: "compileSdk 34 is not supported"${C.reset}`,
  `  ${C.gray}→ AGP 8.7+ requer compileSdk 35.${C.reset}`,
  `  ${C.gray}  Solução: Já corrigido — todos novos ZIPs usam SDK 35.${C.reset}`,
  "",
  `${C.yellow}Erro: "Capacitor 6.2" ou "expo" erros${C.reset}`,
  `  ${C.gray}→ Você está usando o caminho EAS (Expo) em vez do Android Puro.${C.reset}`,
  `  ${C.gray}  Solução: Use "Baixar ZIP Android" (sem Capacitor).${C.reset}`,
  `  ${C.gray}  O APK Builder gera Android nativo WebView, sem Capacitor.${C.reset}`,
  "",
  `${C.yellow}Erro: "package name inválido"${C.reset}`,
  `  ${C.gray}→ O package deve ser: com.empresa.app (3+ partes, sem espaços).${C.reset}`,
  `  ${C.gray}  Exemplos: com.maikon.juridico | br.adv.caldeira${C.reset}`,
  "",
  `${C.yellow}Erro: "minSdkVersion < 16"${C.reset}`,
  `  ${C.gray}→ Use minSdk 21 (Android 5.0+) — suportado em 98% dos dispositivos.${C.reset}`,
  "",
  `${C.yellow}Build demora / Actions pendente${C.reset}`,
  `  ${C.gray}→ Normal! GitHub Actions leva 5-10 min na primeira vez.${C.reset}`,
  `  ${C.gray}  Aguarde o ícone ficar verde ✅ em Repositório → Actions.${C.reset}`,
  "",
];

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<XTerm | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const lineRef      = useRef("");          // linha de entrada atual
  const histRef      = useRef<string[]>([]); // histórico de comandos
  const histIdxRef   = useRef(-1);

  /* ── Escreve linha(s) no terminal ── */
  const write  = useCallback((t: string) => termRef.current?.write(t), []);
  const writeln = useCallback((t: string) => termRef.current?.writeln(t), []);

  /* ── Executa um comando digitado ── */
  const runCmd = useCallback(async (raw: string) => {
    const cmd = raw.trim();
    const term = termRef.current;
    if (!term) return;

    term.writeln("");

    if (!cmd) { prompt(); return; }

    histRef.current.unshift(cmd);
    histIdxRef.current = -1;

    const [head, ...rest] = cmd.split(" ");
    const arg = rest.join(" ");

    if (head === "clear") {
      term.clear();
    } else if (head === "help") {
      HELP_LINES.forEach(l => term.writeln(l));
    } else if (head === "guia") {
      GUIA_LINES.forEach(l => term.writeln(l));
    } else if (head === "etapas") {
      ETAPAS_LINES.forEach(l => term.writeln(l));
    } else if (head === "erros") {
      ERROS_LINES.forEach(l => term.writeln(l));
    } else if (head === "info") {
      term.writeln(`${C.cyan}Navigator:${C.reset} ${navigator.userAgent}`);
      term.writeln(`${C.cyan}Plataforma:${C.reset} ${navigator.platform || "desconhecida"}`);
      term.writeln(`${C.cyan}Idioma:${C.reset} ${navigator.language}`);
      term.writeln(`${C.cyan}Online:${C.reset} ${navigator.onLine ? "✅ sim" : "❌ não"}`);
      if ("connection" in navigator) {
        const nc = (navigator as { connection?: { effectiveType?: string; downlink?: number } }).connection;
        if (nc) {
          term.writeln(`${C.cyan}Rede:${C.reset} ${nc.effectiveType ?? "?"} / ${nc.downlink ?? "?"}Mbps`);
        }
      }
      const mem = (performance as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (mem) {
        term.writeln(`${C.cyan}Memória JS:${C.reset} ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB usados de ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}MB`);
      }
      term.writeln(`${C.cyan}URL:${C.reset} ${location.href}`);
      term.writeln(`${C.cyan}Hora:${C.reset} ${new Date().toLocaleString("pt-BR")}`);
      term.writeln(`${C.cyan}Cores CPU:${C.reset} ${navigator.hardwareConcurrency ?? "?"}`);
      term.writeln(`${C.cyan}Memória dispositivo:${C.reset} ${(navigator as { deviceMemory?: number }).deviceMemory ?? "?"}GB`);
    } else if (head === "time") {
      term.writeln(`${C.green}${new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "medium" })}${C.reset}`);
    } else if (head === "uuid") {
      const uuid = crypto.randomUUID();
      term.writeln(`${C.yellow}${uuid}${C.reset}`);
    } else if (head === "base64") {
      if (!arg) { term.writeln(`${C.red}Uso: base64 <texto>${C.reset}`); }
      else {
        try {
          const enc = btoa(unescape(encodeURIComponent(arg)));
          term.writeln(`${C.green}${enc}${C.reset}`);
        } catch (e) {
          term.writeln(`${C.red}Erro: ${String(e)}${C.reset}`);
        }
      }
    } else if (head === "fetch") {
      if (!arg) { term.writeln(`${C.red}Uso: fetch <url>${C.reset}`); }
      else {
        term.writeln(`${C.gray}Buscando ${arg}…${C.reset}`);
        try {
          const r = await fetch(arg);
          const text = await r.text();
          term.writeln(`${C.cyan}Status: ${r.status} ${r.statusText}${C.reset}`);
          const preview = text.length > 2000 ? text.slice(0, 2000) + "\n…(truncado)" : text;
          preview.split("\n").forEach(l => term.writeln(l));
        } catch (e) {
          term.writeln(`${C.red}Erro: ${String(e)}${C.reset}`);
        }
      }
    } else if (head === "json") {
      if (!arg) { term.writeln(`${C.red}Uso: json <url>${C.reset}`); }
      else {
        term.writeln(`${C.gray}Buscando JSON de ${arg}…${C.reset}`);
        try {
          const r = await fetch(arg);
          const j = await r.json();
          const text = JSON.stringify(j, null, 2);
          const preview = text.length > 3000 ? text.slice(0, 3000) + "\n…(truncado)" : text;
          preview.split("\n").forEach(l => term.writeln(`${C.green}${l}${C.reset}`));
        } catch (e) {
          term.writeln(`${C.red}Erro: ${String(e)}${C.reset}`);
        }
      }
    } else if (head === "eval") {
      if (!arg) { term.writeln(`${C.red}Uso: eval <código javascript>${C.reset}`); }
      else {
        term.writeln(`${C.gray}▶ Executando…${C.reset}`);
        try {
          // eslint-disable-next-line no-eval
          const result = await Promise.resolve(eval(arg));
          const out = result === undefined ? "(undefined)" : JSON.stringify(result, null, 2) ?? String(result);
          out.split("\n").slice(0, 50).forEach(l => term.writeln(`${C.green}${l}${C.reset}`));
        } catch (e) {
          term.writeln(`${C.red}Erro: ${String(e)}${C.reset}`);
        }
      }
    } else {
      term.writeln(`${C.red}Comando desconhecido: ${C.yellow}${head}${C.reset}`);
      term.writeln(`${C.gray}Digite ${C.yellow}help${C.gray} para ver os comandos.${C.reset}`);
    }

    term.writeln("");
    prompt();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Prompt ── */
  const prompt = useCallback(() => {
    lineRef.current = "";
    termRef.current?.write(`${C.violet}${C.bold}apk${C.reset}${C.gray}@browser${C.reset} ${C.cyan}❯${C.reset} `);
  }, []);

  /* ── Setup terminal ── */
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background:          "#0f172a",
        foreground:          "#e2e8f0",
        cursor:              "#a78bfa",
        cursorAccent:        "#0f172a",
        selectionBackground: "#4c1d9580",
        black:   "#1e293b", brightBlack:   "#475569",
        red:     "#f87171", brightRed:     "#fca5a5",
        green:   "#4ade80", brightGreen:   "#86efac",
        yellow:  "#fbbf24", brightYellow:  "#fde68a",
        blue:    "#60a5fa", brightBlue:    "#93c5fd",
        magenta: "#c084fc", brightMagenta: "#d8b4fe",
        cyan:    "#22d3ee", brightCyan:    "#67e8f9",
        white:   "#e2e8f0", brightWhite:   "#f8fafc",
      },
      fontFamily: "'JetBrains Mono', 'Fira Mono', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 3000,
      convertEol: true,
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current  = fit;

    // Banner inicial
    BANNER.forEach(l => term.writeln(l));
    prompt();

    // Teclado — captura entrada
    term.onKey(({ key, domEvent }) => {
      const ev = domEvent;

      // Ctrl+C — cancelar linha
      if (ev.ctrlKey && ev.key === "c") {
        term.writeln("^C");
        lineRef.current = "";
        histIdxRef.current = -1;
        prompt();
        return;
      }

      // Ctrl+L — limpar
      if (ev.ctrlKey && ev.key === "l") {
        term.clear();
        prompt();
        return;
      }

      // Enter
      if (ev.key === "Enter") {
        const cmd = lineRef.current;
        runCmd(cmd);
        return;
      }

      // Backspace
      if (ev.key === "Backspace") {
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }

      // Setas para histórico
      if (ev.key === "ArrowUp") {
        const hist = histRef.current;
        if (hist.length === 0) return;
        const next = Math.min(histIdxRef.current + 1, hist.length - 1);
        histIdxRef.current = next;
        const entry = hist[next];
        // Limpar linha atual
        term.write("\r\x1b[K");
        term.write(`${C.violet}${C.bold}apk${C.reset}${C.gray}@browser${C.reset} ${C.cyan}❯${C.reset} ${entry}`);
        lineRef.current = entry;
        return;
      }
      if (ev.key === "ArrowDown") {
        const hist = histRef.current;
        if (histIdxRef.current <= 0) {
          histIdxRef.current = -1;
          term.write("\r\x1b[K");
          term.write(`${C.violet}${C.bold}apk${C.reset}${C.gray}@browser${C.reset} ${C.cyan}❯${C.reset} `);
          lineRef.current = "";
          return;
        }
        histIdxRef.current--;
        const entry = hist[histIdxRef.current];
        term.write("\r\x1b[K");
        term.write(`${C.violet}${C.bold}apk${C.reset}${C.gray}@browser${C.reset} ${C.cyan}❯${C.reset} ${entry}`);
        lineRef.current = entry;
        return;
      }

      // Teclas de controle restantes — ignora
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      if (key.length !== 1) return;

      // Caractere normal
      lineRef.current += key;
      term.write(key);
    });

    // Resize
    const obs = new ResizeObserver(() => { try { fit.fit(); } catch {} });
    obs.observe(containerRef.current!);

    return () => {
      obs.disconnect();
      term.dispose();
    };
  }, [prompt, runCmd]);

  return (
    <div className="flex flex-col h-full bg-[#0f172a]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0f1e] border-b border-violet-900/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-violet-400 text-xs font-mono font-bold">⚡ TERMINAL BROWSER</span>
          <span className="text-slate-600 text-xs">|</span>
          <span className="text-slate-500 text-xs">JS eval • sem servidor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            ativo
          </span>
          <button
            onClick={() => {
              termRef.current?.clear();
              BANNER.forEach(l => termRef.current?.writeln(l));
              termRef.current?.write(`${C.violet}${C.bold}apk${C.reset}${C.gray}@browser${C.reset} ${C.cyan}❯${C.reset} `);
              lineRef.current = "";
            }}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-0.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
          >
            limpar
          </button>
          <button
            onClick={() => {
              const term = termRef.current;
              if (!term) return;
              term.writeln("");
              GUIA_LINES.forEach(l => term.writeln(l));
              term.write(`${C.violet}${C.bold}apk${C.reset}${C.gray}@browser${C.reset} ${C.cyan}❯${C.reset} `);
              lineRef.current = "";
            }}
            className="text-xs text-violet-400 hover:text-violet-200 px-2 py-0.5 rounded border border-violet-800 hover:border-violet-600 transition-colors"
          >
            guia APK
          </button>
        </div>
      </div>

      {/* xterm container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 p-1"
        style={{ overflow: "hidden" }}
      />

      {/* Footer — atalhos */}
      <div className="px-3 py-1 bg-[#0a0f1e] border-t border-violet-900/20 shrink-0 flex gap-4 flex-wrap">
        {[
          ["help", "ajuda"],
          ["guia", "como fazer APK"],
          ["etapas", "passos git"],
          ["erros", "erros comuns"],
          ["clear", "limpar"],
        ].map(([cmd, label]) => (
          <button
            key={cmd}
            onClick={() => {
              const term = termRef.current;
              if (!term) return;
              // Limpa linha atual e executa
              term.write("\r\x1b[K");
              term.write(`${C.violet}${C.bold}apk${C.reset}${C.gray}@browser${C.reset} ${C.cyan}❯${C.reset} ${cmd}`);
              lineRef.current = cmd;
              runCmd(cmd);
            }}
            className="text-xs text-slate-400 hover:text-violet-300 font-mono transition-colors"
          >
            <span className="text-violet-500">{cmd}</span>
            <span className="text-slate-600"> — {label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
