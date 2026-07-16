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
