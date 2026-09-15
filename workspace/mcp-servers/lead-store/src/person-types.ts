import { z } from "zod";

/**
 * Hunter 来源的联系人（people[]）Schema
 * 对应 docs/design/US-C-01-people-schema与leads-patch-scored.md §2
 */

export const PersonSourceSchema = z.object({
  domain: z.string(),
  /** http(s) 或 urn:ftcs:manual 等 */
  uri: z
    .string()
    .min(1)
    .refine(
      (value) => {
        if (value.startsWith("urn:")) return true;
        try {
          // eslint-disable-next-line no-new
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid uri" },
    ),
  extracted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  last_seen_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  still_on_page: z.boolean(),
});

export type PersonSource = z.infer<typeof PersonSourceSchema>;

export const EmailStatusSchema = z.enum([
  "hunter_valid",
  "hunter_accept_all",
  "hunter_invalid",
  "hunter_unknown",
  "hunter_unverified",
]);

export type EmailStatus = z.infer<typeof EmailStatusSchema>;

export const PersonProviderSchema = z.enum(["hunter", "manual"]);

export type PersonProvider = z.infer<typeof PersonProviderSchema>;

export const PersonSchema = z.object({
  id: z.string().regex(/^person_\d{8}_\d{4}$/),
  name: z.string().min(1),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  title: z.string().nullable(),
  role_match: z.string().nullable(),
  match_reason: z.string().min(1),
  email: z.string().email(),
  email_status: EmailStatusSchema,
  confidence: z.number().int().min(0).max(100),
  sources: z.array(PersonSourceSchema).min(1),
  provider: PersonProviderSchema,
  enriched_at: z.string().datetime(),
});

export type Person = z.infer<typeof PersonSchema>;

/** 用于 leads_patch_scored 的输入（不含 id / enriched_at，由 MCP 生成） */
export const PersonInputSchema = PersonSchema.omit({ id: true, enriched_at: true });

export type PersonInput = z.infer<typeof PersonInputSchema>;

/**
 * 邮箱质量排序比较函数
 * 规则（§6.3）：
 * 1. 邮箱类型：personal > generic（通过 email 前缀推断，personal 邮箱通常含 first_name 或不含常见 generic 前缀）
 * 2. 置信度：Hunter confidence 降序
 * 3. 职位匹配：有 title 且匹配 buyer_personas 的优先（此处简化：有 title 优先）
 * 4. 姓名完整性：有 first_name 优先
 */
const GENERIC_PREFIXES = new Set([
  "info",
  "sales",
  "support",
  "contact",
  "hello",
  "mail",
  "admin",
  "office",
  "service",
  "help",
  "enquiry",
  "inquiry",
  "customerservice",
  "techsupport",
  "webmaster",
  "accountsreceivable",
]);

/** 导出供 C7 contacts 同步与排序共用（US-C-03） */
export function isPersonalEmail(email: string): boolean {
  const prefix = email.split("@")[0]?.toLowerCase() ?? "";
  return !GENERIC_PREFIXES.has(prefix) && !prefix.includes("noreply") && !prefix.includes("no-reply");
}

/** C7：同步 contacts 的最低 confidence */
export const SYNC_CONFIDENCE_MIN = 70;

export function comparePersons(a: PersonInput, b: PersonInput): number {
  // 1. 邮箱类型：personal > generic
  const aPersonal = isPersonalEmail(a.email);
  const bPersonal = isPersonalEmail(b.email);
  if (aPersonal !== bPersonal) {
    return aPersonal ? -1 : 1;
  }

  // 2. 置信度降序
  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence;
  }

  // 3. 有 title 优先
  const aHasTitle = a.title !== null && a.title !== "";
  const bHasTitle = b.title !== null && b.title !== "";
  if (aHasTitle !== bHasTitle) {
    return aHasTitle ? -1 : 1;
  }

  // 4. 有 first_name 优先
  const aHasName = a.first_name !== null && a.first_name !== "";
  const bHasName = b.first_name !== null && b.first_name !== "";
  if (aHasName !== bHasName) {
    return aHasName ? -1 : 1;
  }

  return 0;
}
