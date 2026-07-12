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

export function getDataDir(root: string): string {
  return join(root, "data");
}

export function getProductsDir(root: string): string {
  return join(getDataDir(root), "products");
}

export function getProductDir(root: string, productId: string): string {
  return join(getProductsDir(root), productId);
}

export function getProfilePath(root: string, productId: string): string {
  return join(getProductDir(root, productId), "profile.json");
}

export function getInputsDir(root: string, productId: string): string {
  return join(getProductDir(root, productId), "inputs");
}

export function getConfigPath(root: string): string {
  return join(root, "config", "scoring-rules.yaml");
}

export function getKeywordsDir(root: string, productId: string): string {
  return join(getDataDir(root), "keywords", productId);
}

export function getKeywordsPath(root: string, productId: string): string {
  return join(getKeywordsDir(root, productId), "expansion.json");
}

export function getLeadsDir(root: string, productId: string): string {
  return join(getDataDir(root), "leads", productId);
}

export function getRawLeadsDir(root: string, productId: string): string {
  return join(getLeadsDir(root, productId), "raw");
}

export function getRawLeadsPath(root: string, productId: string, round: string): string {
  return join(getRawLeadsDir(root, productId), `${round}.jsonl`);
}

export function getExplorationRunsDir(root: string, productId: string): string {
  return join(getDataDir(root), "exploration", productId, "runs");
}

export function getExplorationRunPath(root: string, productId: string, runId: string): string {
  return join(getExplorationRunsDir(root, productId), `${runId}.json`);
}

export function getScoredLeadsPath(root: string, productId: string): string {
  return join(getLeadsDir(root, productId), "scored.json");
}

export function getEmailsDir(root: string): string {
  return join(getDataDir(root), "emails");
}

export function getEmailDraftDir(root: string, leadId: string): string {
  return join(getEmailsDir(root), leadId);
}

export function getEmailDraftPath(root: string, leadId: string): string {
  return join(getEmailDraftDir(root, leadId), "draft.json");
}

export function getEmailDraftMarkdownPath(root: string, leadId: string): string {
  return join(getEmailDraftDir(root, leadId), "draft.md");
}
