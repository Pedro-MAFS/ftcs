import { z } from "zod";

/**
 * Hunter REST 响应 Schema（裁剪版，仅保留 FTCS 需要的字段）。
 * 参考 docs/reference/hunter-api/README.md §6/§7/§9。
 */

export const HunterErrorItemSchema = z.object({
  id: z.string(),
  code: z.number(),
  details: z.string(),
});

export const HunterErrorBodySchema = z.object({
  errors: z.array(HunterErrorItemSchema),
});

export const HunterSourceSchema = z.object({
  domain: z.string(),
  uri: z.string(),
  extracted_on: z.string(),
  last_seen_on: z.string(),
  still_on_page: z.boolean(),
});

export const HunterVerificationSchema = z.object({
  date: z.string().nullable(),
  status: z.string().nullable(),
});

export const HunterEmailEntrySchema = z.object({
  value: z.string(),
  type: z.enum(["personal", "generic"]).nullable(),
  confidence: z.number().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  position: z.string().nullable(),
  seniority: z.string().nullable(),
  department: z.string().nullable(),
  decision_maker: z.boolean().nullable(),
  verification: HunterVerificationSchema.nullable(),
  sources: z.array(HunterSourceSchema).default([]),
});

export const HunterDomainSearchDataSchema = z.object({
  domain: z.string().nullable(),
  organization: z.string().nullable(),
  pattern: z.string().nullable(),
  accept_all: z.boolean().nullable(),
  disposable: z.boolean().nullable(),
  webmail: z.boolean().nullable(),
  emails: z.array(HunterEmailEntrySchema).default([]),
});

export const HunterDomainSearchResponseSchema = z.object({
  data: HunterDomainSearchDataSchema,
  meta: z
    .object({
      results: z.number().optional(),
    })
    .passthrough()
    .optional(),
});

export type HunterEmailEntry = z.infer<typeof HunterEmailEntrySchema>;
export type HunterDomainSearchData = z.infer<typeof HunterDomainSearchDataSchema>;

/** 裁剪后的 emails[] 条目（sources ≤5 + source_count） */
export interface TrimmedEmailEntry extends Omit<HunterEmailEntry, "sources"> {
  sources: z.infer<typeof HunterSourceSchema>[];
  source_count: number;
}

export interface TrimmedDomainSearch {
  domain: string | null;
  organization: string | null;
  pattern: string | null;
  accept_all: boolean | null;
  disposable: boolean | null;
  webmail: boolean | null;
  emails: TrimmedEmailEntry[];
  dropped_no_sources: number;
  meta: { results: number };
}

export const MAX_SOURCES_PER_EMAIL = 5;

/**
 * 裁剪 Domain Search 响应（US-C-02 详设 §4）：
 * - sources ≤5：still_on_page 优先，再按 last_seen_on 降序
 * - 无 sources 的邮箱丢弃并计数（US-C-01 Schema 要求每人至少 1 条来源）
 */
export function trimDomainSearch(data: HunterDomainSearchData, metaResults = 0): TrimmedDomainSearch {
  let dropped = 0;
  const emails: TrimmedEmailEntry[] = [];

  for (const entry of data.emails) {
    if (entry.sources.length === 0) {
      dropped += 1;
      continue;
    }
    const sorted = [...entry.sources].sort((a, b) => {
      if (a.still_on_page !== b.still_on_page) {
        return a.still_on_page ? -1 : 1;
      }
      return b.last_seen_on.localeCompare(a.last_seen_on);
    });
    emails.push({
      ...entry,
      sources: sorted.slice(0, MAX_SOURCES_PER_EMAIL),
      source_count: entry.sources.length,
    });
  }

  return {
    domain: data.domain,
    organization: data.organization,
    pattern: data.pattern,
    accept_all: data.accept_all,
    disposable: data.disposable,
    webmail: data.webmail,
    emails,
    dropped_no_sources: dropped,
    meta: { results: metaResults },
  };
}

/** Email Verifier 响应（透传 data 主要字段） */
export const HunterVerifierDataSchema = z.object({
  status: z.string(),
  score: z.number().nullable(),
  email: z.string(),
  regexp: z.boolean().nullable(),
  gibberish: z.boolean().nullable(),
  disposable: z.boolean().nullable(),
  webmail: z.boolean().nullable(),
  mx_records: z.boolean().nullable(),
  smtp_server: z.boolean().nullable(),
  smtp_check: z.boolean().nullable(),
  accept_all: z.boolean().nullable(),
  block: z.boolean().nullable(),
  sources: z.array(HunterSourceSchema).optional(),
});

export type HunterVerifierData = z.infer<typeof HunterVerifierDataSchema>;

/** Account 响应（requests 三种桶都可能存在，视计划而定） */
export const HunterAccountDataSchema = z.object({
  plan_name: z.string().nullable().optional(),
  plan_level: z.number().nullable().optional(),
  reset_date: z.string().nullable().optional(),
  requests: z
    .object({
      credits: z
        .object({
          used: z.number(),
          available: z.number(),
          remaining: z.number(),
        })
        .optional(),
      searches: z
        .object({
          used: z.number(),
          available: z.number(),
          remaining: z.number(),
        })
        .optional(),
      verifications: z
        .object({
          used: z.number(),
          available: z.number(),
          remaining: z.number(),
        })
        .optional(),
    })
    .optional(),
});

export type HunterAccountData = z.infer<typeof HunterAccountDataSchema>;
