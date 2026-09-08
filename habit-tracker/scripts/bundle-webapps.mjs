// Gera módulos TS com conteúdo base64 dos PWAs buildados
// Uso: node scripts/bundle-webapps.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readDirRecursive(dir, base) {
  const result = {};
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      Object.assign(result, readDirRecursive(full, base));
    } else {
      result[rel] = fs.readFileSync(full).toString("base64");
    }
  }
  return result;
}

function generateModule(varName, files) {
  const entries = Object.entries(files)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(",\n");
  return `// Auto-gerado — NÃO EDITE. Execute: node scripts/bundle-webapps.mjs\n// Gerado em: ${new Date().toISOString()}\nexport const ${varName}: Record<string, string> = {\n${entries}\n};\n`;
}

// Assistente Jurídico
const juridicoDir = path.join(__dirname, "../../../assistente-juridico/dist");
const juridicoFiles = readDirRecursive(juridicoDir, juridicoDir);
const juridicoCount = Object.keys(juridicoFiles).length;
const juridicoModule = generateModule("JURIDICO_FILES", juridicoFiles);
const juridicoOut = path.join(root, "assets/juridico-bundle.generated.ts");
fs.writeFileSync(juridicoOut, juridicoModule);
console.log(`✅ Jurídico: ${juridicoCount} arquivos → assets/juridico-bundle.generated.ts`);

// SK Code Editor
const editorDir = path.join(__dirname, "../../../code-editor/dist");
const editorFiles = readDirRecursive(editorDir, editorDir);
const editorCount = Object.keys(editorFiles).length;
const editorModule = generateModule("EDITOR_FILES", editorFiles);
const editorOut = path.join(root, "assets/editor-bundle.generated.ts");
fs.writeFileSync(editorOut, editorModule);
console.log(`✅ Editor: ${editorCount} arquivos → assets/editor-bundle.generated.ts`);

console.log("\n🎉 Bundles gerados com sucesso!");
console.log(`Total: ${juridicoCount + editorCount} arquivos embutidos no APK.`);
