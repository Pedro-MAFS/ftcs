import { z } from "zod";

/**
 * Hunter API v2 Domain Search 官方英文 slug。只写在工具说明里，客户端不枚举校验。
 * 名单以后可能增加；未列出的值仍原样交给上游。
 */
export const DEPARTMENT_SLUGS =
  "executive, it, finance, management, sales, legal, support, hr, marketing, communication, education, design, health, operations, product, research, consulting, administrative, procurement";
export const SENIORITY_SLUGS = "junior, senior, executive";

export const DOMAIN_SEARCH_TOOL_DESCRIPTION =
  "Hunter Domain Search: one call returns one page for a lead domain (cached 24h). Choose limit (1-100), type (personal or generic), department, seniority, and offset per call; omit any you are not setting. Do not assume a default limit or type. department and seniority, when set, must be comma-separated official English slugs only, not Chinese names or invented values. department: " +
  DEPARTMENT_SLUGS +
  ". seniority: " +
  SENIORITY_SLUGS +
  ". The official list may grow later. To read another page, call again with a new offset. This tool does not follow meta.results. Official channel uses the token gateway; custom channel uses HUNTER_API_KEYS.";

/**
 * domain_search 入参（US-HC-08）。
 * 可选字段没有默认值：未传保持缺省，不代填 limit，不默认 type=personal。
 * department / seniority 不在客户端做枚举校验。
 */
export const domainSearchToolShape = {
  domain: z
    .string()
    .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i)
    .describe("Lead company eTLD+1 domain, e.g. pantron.com. Not a URL or email."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Optional integer 1-100. Omit to leave unset."),
  type: z
    .enum(["personal", "generic"])
    .optional()
    .describe("Optional email type. Omit to leave unset."),
  department: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional comma-separated official English slugs only (Hunter API v2 Domain Search; the list may grow later): " +
        DEPARTMENT_SLUGS +
        ". Do not use Chinese department names or invented values. Omit to leave unset."
    ),
  seniority: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional comma-separated official English slugs only: " +
        SENIORITY_SLUGS +
        ". Do not use Chinese names or invented values. Omit to leave unset."
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Optional non-negative integer offset. Omit to leave unset. Pass a new offset to read another page."),
};

export const domainSearchToolSchema = z.object(domainSearchToolShape);

export type DomainSearchToolInput = z.infer<typeof domainSearchToolSchema>;
