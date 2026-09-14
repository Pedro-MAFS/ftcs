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

/** 递归收集任意嵌套对象上匹配 prefix 的 id（scored.json 的 people[] 等） */
function collectMatchingIds(value: unknown, prefix: string, out: number[]): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMatchingIds(item, prefix, out);
    }
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const id = record.id;
  if (typeof id === "string" && id.startsWith(prefix)) {
    const seq = parseSeq(id, prefix);
    if (Number.isFinite(seq)) {
      out.push(seq);
    }
  }
  for (const child of Object.values(record)) {
    collectMatchingIds(child, prefix, out);
  }
}

function extractIdsFromFile(filePath: string, prefix: string): number[] {
  if (filePath.endsWith(".jsonl")) {
    const ids: number[] = [];
    const lines = readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        collectMatchingIds(JSON.parse(line), prefix, ids);
      } catch {
        // ignore malformed lines
      }
    }
    return ids;
  }

  if (filePath.endsWith(".json")) {
    try {
      const ids: number[] = [];
      collectMatchingIds(JSON.parse(readFileSync(filePath, "utf8")), prefix, ids);
      return ids;
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

/**
 * 同一次批量写入复用：先读盘拿到 max seq，再内存递增。
 * 避免 patch 循环内反复读未落盘文件导致全员 person_…_0001。
 */
export function createPersonIdAllocator(root: string, date = new Date()): () => string {
  const datePart = formatDate(date);
  const prefix = `person_${datePart}_`;
  const seqNumbers = collectIds(root, prefix);
  let nextSeq = (seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0) + 1;
  return () => {
    const id = `${prefix}${String(nextSeq).padStart(4, "0")}`;
    nextSeq += 1;
    return id;
  };
}

export function generatePersonId(root: string, date = new Date()): string {
  return createPersonIdAllocator(root, date)();
}
