import { createHash } from "node:crypto";
import { COMPANY_RECIPIENT_KEY } from "./email-types.js";

export function normalizeEmail(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  return normalized;
}

function sha16(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sha8(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

/**
 * 由规范化邮箱派生文件系统安全的 recipient_key。
 * 保留字 `company` 不会作为个人目录名返回。
 */
export function recipientKeyFromEmail(raw: string): string | null {
  const normalized = normalizeEmail(raw);
  if (!normalized) return null;

  let slug = normalized
    .replace(/@/g, "_at_")
    .replace(/[^a-z0-9._+-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slug || slug === COMPANY_RECIPIENT_KEY) {
    return `p_${sha16(normalized)}`;
  }

  if (slug.length > 80) {
    slug = `${slug.slice(0, 64).replace(/_+$/g, "")}_${sha8(normalized)}`;
  }

  return slug;
}
