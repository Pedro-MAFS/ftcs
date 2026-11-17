import { z } from "zod";

/**
 * domain_search 入参（US-HC-08）。
 * 可选字段没有默认值：未传保持缺省，不代填 limit，不默认 type=personal。
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
    .describe("Optional comma-separated departments. Omit to leave unset."),
  seniority: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional comma-separated seniority. Omit to leave unset."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Optional non-negative integer offset. Omit to leave unset. Pass a new offset to read another page."),
};

export const domainSearchToolSchema = z.object(domainSearchToolShape);

export type DomainSearchToolInput = z.infer<typeof domainSearchToolSchema>;
