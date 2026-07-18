import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function hasWorkspaceMarker(root: string): boolean {
  return existsSync(join(root, "config", "scoring-rules.yaml"));
}

/**
 * 解析运行时工作区根目录（含 config/scoring-rules.yaml 与 data/）。
 * 优先 FTCS_WORKSPACE；开发时一般为 <repo>/workspace。
 */
export function findProjectRoot(startDir = MODULE_DIR): string {
  const fromEnv = process.env.FTCS_WORKSPACE?.trim();
  if (fromEnv) {
    const resolved = resolve(fromEnv);
    if (hasWorkspaceMarker(resolved)) {
      return resolved;
    }
    throw new Error(
      `FTCS_WORKSPACE 已设置但无效（缺少 config/scoring-rules.yaml）: ${resolved}`
    );
  }

  if (hasWorkspaceMarker(process.cwd())) {
    return resolve(process.cwd());
  }

  let current = resolve(startDir);
  for (let i = 0; i < 10; i += 1) {
    const nestedWorkspace = join(current, "workspace");
    if (hasWorkspaceMarker(nestedWorkspace)) {
      return nestedWorkspace;
    }
    if (hasWorkspaceMarker(current)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(
    "Unable to locate workspace root (expected workspace/config/scoring-rules.yaml or FTCS_WORKSPACE)"
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

export function getDiscardedLeadsPath(root: string, productId: string): string {
  return join(getLeadsDir(root, productId), "discarded.json");
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
