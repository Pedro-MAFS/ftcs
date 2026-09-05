# PDF 文本抽取 spike 结论

> **日期**：2026-09-05  
> **故事**：US-I-13  
> **详设**：[../design/US-I-13-文字型PDF侧车.md](../design/US-I-13-文字型PDF侧车.md)

## 结论

| 项 | 决定 |
|----|------|
| **选用库** | **`pdf-parse@2.4.5`**（v2 `PDFParse` API） |
| **不选** | `pdf-parse@1.1.x`（内置旧 pdf.js，无法解析 pdf-lib / 现代 PDF 1.7） |
| **不选** | poppler / 外部 exe |
| **Electron** | 主进程 `externalizeDepsPlugin` 外置依赖；`new PDFParse({ data })` + `getText()` + `destroy()` |
| **内嵌图** | **不 OCR**；仅文本层进侧车；写入前去掉 `\0` 等 C0 控制符（OpenCode Read 遇空字节即拒读） |

## spike 记录

| # | 用例 | 结果 |
|---|------|------|
| S1 | pdf-lib 生成的文字型 PDF | `getText()` 抽出 `GreenWood Product Catalog…`，有效字符 ≥ 80 |
| S2 | 仓库内假 `安装手册.pdf`（非真 PDF） | `encrypted_or_invalid` |
| S3 | 随机字节 `not-a-pdf` | `encrypted_or_invalid` |
| S4 | tsx 主进程模块 `extractPdfTextToString` | 通过（见 `profile-pdf-extract.test.ts`） |

## 测试夹具

- `desktop/electron/profile/fixtures/sample-text.pdf` — 由 `gen-sample-text-pdf.mjs`（pdf-lib）生成，供单测集成用。

## API 示例（量产）

```ts
import { PDFParse } from 'pdf-parse'

const parser = new PDFParse({ data: buffer })
try {
  const result = await parser.getText()
  return result.text ?? ''
} finally {
  await parser.destroy()
}
```
