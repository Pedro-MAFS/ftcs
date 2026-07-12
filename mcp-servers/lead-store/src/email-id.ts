import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./paths.js";

function formatDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function collectEmailIds(root: string, prefix: string): number[] {
  const emailsDir = join(getDataDir(root), "emails");
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
        const draftPath = join(fullPath, "draft.json");
        try {
          const parsed = JSON.parse(readFileSync(draftPath, "utf8")) as { id?: string };
          if (parsed.id?.startsWith(prefix)) {
            ids.push(Number.parseInt(parsed.id.slice(prefix.length), 10));
          }
        } catch {
          // ignore
        }
      }
    }
  };

  walk(emailsDir);
  return ids.filter((value) => Number.isFinite(value));
}

export function generateEmailId(root: string, date = new Date()): string {
  const datePart = formatDate(date);
  const prefix = `email_${datePart}_`;
  const seqNumbers = collectEmailIds(root, prefix);
  const nextSeq = (seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0) + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

const COUNTRY_LANGUAGE: Record<string, string> = {
  us: "en",
  usa: "en",
  uk: "en",
  de: "en",
  fr: "en",
  es: "en",
  au: "en",
  ca: "en",
  cn: "en",
};

export function resolveEmailLanguage(country?: string): string {
  if (!country) {
    return "en";
  }
  return COUNTRY_LANGUAGE[country.trim().toLowerCase()] ?? "en";
}

export function pickPrimaryEmail(
  contacts: Array<{ type: string; value: string; confidence?: string }>
): string | undefined {
  const emails = contacts.filter((contact) => contact.type === "email");
  if (emails.length === 0) {
    return undefined;
  }

  const ranked = [...emails].sort((a, b) => {
    const weight = (confidence?: string) =>
      confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
    return weight(b.confidence) - weight(a.confidence);
  });

  return ranked[0]?.value;
}
