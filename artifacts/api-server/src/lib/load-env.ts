import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function candidatePaths(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
    path.resolve(here, "..", "..", ".env"),
    path.resolve(here, "..", "..", "..", "..", ".env"),
  ];
}

function applyEnv(filePath: string): void {
  const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadLocalEnv(): string | null {
  const seen = new Set<string>();
  for (const filePath of candidatePaths()) {
    const resolved = path.resolve(filePath);
    if (seen.has(resolved) || !existsSync(resolved)) continue;
    seen.add(resolved);
    applyEnv(resolved);
    return resolved;
  }
  return null;
}

loadLocalEnv();
