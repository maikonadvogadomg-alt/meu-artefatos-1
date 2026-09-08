export interface NeonResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string; dataTypeID?: number }>;
  rowCount?: number;
  command?: string;
}

export interface NeonParsed {
  user: string;
  password: string;
  host: string;
  database: string;
}

export function parseNeonUrl(url: string): NeonParsed {
  // postgresql://user:password@host.neon.tech/database?sslmode=require
  const m = url.trim().match(/^postgresql:\/\/([^:]+):([^@]+)@([^/?]+)\/([^?]*)/i)
    ?? url.trim().match(/^postgres:\/\/([^:]+):([^@]+)@([^/?]+)\/([^?]*)/i);
  if (!m) throw new Error("URL de conexão Neon inválida.\nFormato: postgresql://user:password@host.neon.tech/database");
  return { user: decodeURIComponent(m[1]), password: decodeURIComponent(m[2]), host: m[3], database: m[4] || "neondb" };
}

export async function neonQuery(
  connectionString: string,
  sql: string,
  params: unknown[] = []
): Promise<NeonResult> {
  const { user, password, host } = parseNeonUrl(connectionString);
  const basic = btoa(`${user}:${password}`);

  // Neon serverless HTTP endpoint
  const res = await fetch(`https://${host}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${basic}`,
      "Neon-Connection-String": connectionString,
    },
    body: JSON.stringify({ query: sql, params }),
  });

  const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
  if (!res.ok) {
    throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
  }
  return body as NeonResult;
}

export async function neonTestConnection(connectionString: string): Promise<string> {
  const result = await neonQuery(connectionString, "SELECT version(), current_database() as db, now() as ts");
  const row = result.rows[0];
  const ver = String(row?.version ?? "").split(" ").slice(0, 2).join(" ");
  const db = String(row?.db ?? "");
  return `✅ Conectado! ${ver} · banco: ${db}`;
}

export async function neonListTables(connectionString: string): Promise<string[]> {
  const result = await neonQuery(
    connectionString,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  return result.rows.map(r => String(r.table_name));
}

export async function neonDescribeTable(connectionString: string, table: string): Promise<NeonResult> {
  return neonQuery(
    connectionString,
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
}

export function formatNeonResult(result: NeonResult): string {
  if (!result.rows.length) return `${result.command ?? "OK"} — 0 linhas`;
  const keys = Object.keys(result.rows[0]);
  const widths = keys.map(k => Math.max(k.length, ...result.rows.map(r => String(r[k] ?? "").length)));
  const header = keys.map((k, i) => k.padEnd(widths[i])).join(" | ");
  const sep = widths.map(w => "-".repeat(w)).join("-+-");
  const rows = result.rows.map(r => keys.map((k, i) => String(r[k] ?? "").padEnd(widths[i])).join(" | "));
  return [header, sep, ...rows, `\n(${result.rows.length} linha${result.rows.length !== 1 ? "s" : ""})`].join("\n");
}
