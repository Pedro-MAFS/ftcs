# Agent 约定

## 禁止用 PowerShell 编辑项目文本文件

Windows PowerShell 5.x 默认编码与仓库 UTF-8（尤其无 BOM 的中文 Markdown/源码）不一致。用 `Set-Content`、`Out-File`、重定向 `>`，或 `Get-Content | … | Set-Content` 整文件回写时，容易把中文写成乱码。

### 必须遵守

- **不要**用 PowerShell 创建、覆盖或整文件回写项目中的文本文件（`.md`、`.java`、`.yml`、`.sql`、`.ts`、`.json` 等）。
- 改文件请用 **Cursor / IDE 的写入能力**，或明确按 UTF-8 写的工具（如 Node `fs.writeFileSync(..., 'utf8')`、Python 指定 `encoding='utf-8'`）。
- PowerShell **可以**继续用于：`git`、`mvn`、构建、进程管理等**不改写文件内容**的命令。

### 若必须用脚本写文件

- 优先 PowerShell 7+，并显式指定 UTF-8（无 BOM 更佳）。
- 写完后抽查中文是否仍正常；一旦发现乱码，用正确 UTF-8 内容整文件恢复，不要再次用错误编码覆盖。
