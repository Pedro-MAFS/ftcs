import { normalizeEmail } from "./email-recipient-key.js";

/** E3 冻结：通用本地部分 → 公司级邮箱 */
export const GENERIC_EMAIL_LOCAL_PARTS: ReadonlySet<string> = new Set([
  "info",
  "sales",
  "contact",
  "contacts",
  "admin",
  "support",
  "hello",
  "office",
  "mail",
  "enquiry",
  "inquiry",
  "service",
  "help",
  "team",
  "marketing",
  "business",
  "export",
  "import",
  "purchase",
  "purchasing",
  "buyer",
  "buyers",
]);

export const MAX_PERSON_DRAFT_SLOTS = 5;

export function emailLocalPart(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const at = normalized.indexOf("@");
  if (at <= 0) return null;
  return normalized.slice(0, at);
}

export function classifyEmailAudience(
  email: string
): "company" | "person" | null {
  const local = emailLocalPart(email);
  if (!local) return null;
  return GENERIC_EMAIL_LOCAL_PARTS.has(local) ? "company" : "person";
}

export function isGenericEmail(email: string): boolean {
  return classifyEmailAudience(email) === "company";
}

export function confidenceWeight(confidence?: string): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  if (confidence === "low") return 1;
  return 0;
}

/** 弱解析 local-part → 称呼用名；失败返回 null */
export function weakParseLocalName(localPart: string): string | null {
  const raw = localPart.trim().toLowerCase();
  if (!raw) return null;
  const first = raw.split(/[._-]/).find(Boolean);
  if (!first || first.length < 2) return null;
  if (!/^[a-z]+$/.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
