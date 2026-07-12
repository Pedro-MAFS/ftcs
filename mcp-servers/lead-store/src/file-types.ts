export const SUPPORTED_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
]);

export const SPECIAL_FILE_EXTENSIONS = new Set([
  ".pdf",
  ".xlsx",
  ".xls",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
]);

export type FileSupportStatus = "supported" | "special" | "unknown";

export function getFileExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) {
    return "";
  }
  return filePath.slice(dot).toLowerCase();
}

export function classifyInputFile(filePath: string): FileSupportStatus {
  const ext = getFileExtension(filePath);
  if (SUPPORTED_TEXT_EXTENSIONS.has(ext)) {
    return "supported";
  }
  if (SPECIAL_FILE_EXTENSIONS.has(ext)) {
    return "special";
  }
  return "unknown";
}

export const SPECIAL_FILE_MESSAGE =
  "该文件格式需专用解析器，当前版本暂不支持。请提供 txt/md/json/csv，或提供公司网站 URL。";
