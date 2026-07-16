import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getProductsDir } from "./paths.js";

function formatDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generateProductId(root: string, date = new Date()): string {
  const datePart = formatDate(date);
  const prefix = `prod_${datePart}_`;
  const productsDir = getProductsDir(root);

  let entries: string[] = [];
  try {
    entries = readdirSync(productsDir, { withFileTypes: false }) as string[];
  } catch {
    entries = [];
  }

  const seqNumbers = entries
    .filter((name) => name.startsWith(prefix))
    .map((name) => {
      const suffix = name.slice(prefix.length);
      return Number.parseInt(suffix, 10);
    })
    .filter((value) => Number.isFinite(value));

  const nextSeq = (seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0) + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}
