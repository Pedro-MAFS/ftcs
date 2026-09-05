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

/** 与 desktop `library-image.ts` / US-I-13 对齐 */
export const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
]);

export const SPECIAL_FILE_EXTENSIONS = new Set([
  ".xlsx",
  ".xls",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
]);

export type FileSupportStatus = "supported" | "office" | "image" | "pdf" | "special" | "unknown";

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
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (ext === ".pdf") {
    return "pdf";
  }
  if (SPECIAL_FILE_EXTENSIONS.has(ext)) {
    return "special";
  }
  return "unknown";
}

export const SPECIAL_FILE_MESSAGE =
  "该文件格式需专用解析器，当前版本暂不支持。请提供 txt/md/json/csv、图片、文字型 PDF，或提供公司网站 URL。";

export const IMAGE_FILE_MESSAGE =
  "图片文件，请用 Read 多模态读取并提取产品信息。";

export const PDF_FILE_MESSAGE =
  "PDF 已在桌面端抽成 .txt 侧车，请 Read 侧车路径（.pdf.txt），不要 Read 原件。";
