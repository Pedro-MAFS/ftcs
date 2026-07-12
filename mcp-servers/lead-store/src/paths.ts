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
