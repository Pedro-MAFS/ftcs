import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./paths.js";

function formatDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function parseSeq(id: string, prefix: string): number {
  const suffix = id.slice(prefix.length);
  return Number.parseInt(suffix, 10);
}

function extractIdsFromFile(filePath: string, prefix: string): number[] {
  if (filePath.endsWith(".jsonl")) {
    const ids: number[] = [];
    const lines = readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { id?: string };
        if (parsed.id?.startsWith(prefix)) {
          ids.push(parseSeq(parsed.id, prefix));
        }
      } catch {
        // ignore malformed lines
      }
    }
    return ids;
  }

  if (filePath.endsWith(".json")) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { id?: string };
      if (parsed.id?.startsWith(prefix)) {
        return [parseSeq(parsed.id, prefix)];
      }
    } catch {
      return [];
    }
  }

  return [];
}

function collectIds(root: string, prefix: string): number[] {
  const dataDir = getDataDir(root);
  const ids: number[] = [];

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        ids.push(...extractIdsFromFile(fullPath, prefix));
      }
    }
  };

  walk(dataDir);
  return ids.filter((value) => Number.isFinite(value));
}

export function generatePersonId(root: string, date = new Date()): string {
  const datePart = formatDate(date);
  const prefix = `person_${datePart}_`;
  const seqNumbers = collectIds(root, prefix);
  const nextSeq = (seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0) + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}
