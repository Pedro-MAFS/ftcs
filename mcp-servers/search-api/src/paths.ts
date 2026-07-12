import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

export function findProjectRoot(startDir = MODULE_DIR): string {
  let current = resolve(startDir);

  for (let i = 0; i < 8; i += 1) {
    const marker = join(current, "config", "scoring-rules.yaml");
    if (existsSync(marker)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(
    "Unable to locate project root (expected config/scoring-rules.yaml)"
  );
}

export function getUsagePath(root: string, date = new Date()): string {
  const datePart = formatDate(date);
  return join(root, "data", "cache", "search", `usage-${datePart}.json`);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
