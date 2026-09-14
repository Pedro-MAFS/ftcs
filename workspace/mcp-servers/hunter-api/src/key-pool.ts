import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getHunterCacheDir } from "./paths.js";

/**
 * 多 Key 池状态管理（US-C-02 详设 §3.0）。
 * 持久化只存 Key 的 sha256 指纹，永不落盘明文 Key。
 */

export type KeyStatus = "ok" | "exhausted" | "invalid";

export interface KeyState {
  status: KeyStatus;
  /** exhausted 时的额度重置日（YYYY-MM-DD）；未知则为 null（默认次日复位） */
  exhausted_until: string | null;
  last_error_at: string | null;
}

export interface KeyPoolState {
  keys: Record<string, KeyState>;
}

/** Key 的持久化指纹（map key，前 12 位） */
export function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

/** 展示用指纹（后 4 位明文，用于错误信息与 UI 区分 Key） */
export function keyTail(apiKey: string): string {
  return apiKey.slice(-4);
}

function statePath(root: string): string {
  return join(getHunterCacheDir(root), "key-pool.json");
}

function todayUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nextDayUtc(date = new Date()): string {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function loadKeyPoolState(root: string): KeyPoolState {
  try {
    const file = statePath(root);
    if (!existsSync(file)) {
      return { keys: {} };
    }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as KeyPoolState;
    if (!parsed || typeof parsed !== "object" || typeof parsed.keys !== "object" || !parsed.keys) {
      return { keys: {} };
    }
    return parsed;
  } catch {
    // 状态文件损坏 → 静默降级为空态（详设 §8）
    return { keys: {} };
  }
}

export function saveKeyPoolState(root: string, state: KeyPoolState): void {
  try {
    const file = statePath(root);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch {
    // 写盘失败静默降级为内存态
  }
}

/** 读取某 Key 的有效状态；exhausted 到期自动复位为 ok */
export function effectiveKeyStatus(root: string, apiKey: string, now = new Date()): KeyState {
  const state = loadKeyPoolState(root);
  const entry = state.keys[keyFingerprint(apiKey)];
  if (!entry) {
    return { status: "ok", exhausted_until: null, last_error_at: null };
  }
  if (entry.status === "exhausted") {
    const until = entry.exhausted_until;
    // Hunter reset_date 当天即重置（详设 §3.0）；未知时按次日复位
    const resetDay = until ?? nextDayUtc(new Date(entry.last_error_at ?? now));
    if (todayUtc(now) >= resetDay) {
      return { status: "ok", exhausted_until: null, last_error_at: entry.last_error_at };
    }
  }
  return entry;
}

/** 标记 429 额度用尽；resetDate 未知时次日复位 */
export function markKeyExhausted(root: string, apiKey: string, resetDate?: string | null): void {
  const state = loadKeyPoolState(root);
  state.keys[keyFingerprint(apiKey)] = {
    status: "exhausted",
    exhausted_until: resetDate ?? null,
    last_error_at: new Date().toISOString(),
  };
  saveKeyPoolState(root, state);
}

/** 标记 401 无效 Key（永久，直至用户改配置后指纹变化自然失效） */
export function markKeyInvalid(root: string, apiKey: string): void {
  const state = loadKeyPoolState(root);
  state.keys[keyFingerprint(apiKey)] = {
    status: "invalid",
    exhausted_until: null,
    last_error_at: new Date().toISOString(),
  };
  saveKeyPoolState(root, state);
}

/**
 * 按配置顺序选第一个可用 Key。
 * 返回 null 表示全部不可用（由调用方按 exhausted/invalid 构成报错）。
 */
export function pickAvailableKey(root: string, keys: string[], now = new Date()): string | null {
  for (const key of keys) {
    if (effectiveKeyStatus(root, key, now).status === "ok") {
      return key;
    }
  }
  return null;
}

/** 汇总各 Key 状态（用于全部不可用时的错误信息与 account_info 展示） */
export function describeKeyPool(root: string, keys: string[], now = new Date()): Array<{
  tail: string;
  status: KeyStatus;
  exhausted_until: string | null;
}> {
  return keys.map((key) => {
    const state = effectiveKeyStatus(root, key, now);
    return { tail: keyTail(key), status: state.status, exhausted_until: state.exhausted_until };
  });
}
