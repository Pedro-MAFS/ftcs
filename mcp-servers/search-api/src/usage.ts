import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getUsagePath } from "./paths.js";

interface UsageRecord {
  date: string;
  search_calls: number;
  limit: number;
}

function readLimit(): number {
  const raw = process.env.SEARCH_DAILY_LIMIT;
  const parsed = raw ? Number.parseInt(raw, 10) : 50;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

function readUsageFile(path: string, date: string, limit: number): UsageRecord {
  if (!existsSync(path)) {
    return { date, search_calls: 0, limit };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as UsageRecord;
  return {
    date,
    search_calls: parsed.search_calls ?? 0,
    limit: parsed.limit ?? limit,
  };
}

export function getDailyUsage(root: string, date = new Date()): UsageRecord {
  const limit = readLimit();
  const path = getUsagePath(root, date);
  const datePart = path.match(/usage-(\d{8})\.json$/)?.[1] ?? "";
  return readUsageFile(path, datePart, limit);
}

export function assertCanSearch(root: string, date = new Date()): UsageRecord {
  const usage = getDailyUsage(root, date);
  if (usage.search_calls >= usage.limit) {
    throw new Error(
      `Search API daily limit of ${usage.limit} reached (${usage.search_calls} used)`
    );
  }
  return usage;
}

export function incrementSearchUsage(root: string, date = new Date()): UsageRecord {
  const usage = assertCanSearch(root, date);
  const path = getUsagePath(root, date);
  mkdirSync(path.replace(/[/\\][^/\\]+$/, ""), { recursive: true });

  const next: UsageRecord = {
    ...usage,
    search_calls: usage.search_calls + 1,
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
