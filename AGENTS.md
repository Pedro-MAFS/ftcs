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

## 改了 Skill 或 MCP，必须升工作区同步版本

桌面端运行时用的不是仓库里的 `workspace/`，而是用户工作区（如 `D:\FTCS_WORKSPACE`）。`npm run dev` 不会每次覆盖。只有 `desktop/electron/config/workspace-init.ts` 里的 `WORKSPACE_TEMPLATE_VERSION` 与工作区 `.ftcs/workspace-sync.json` 不一致时，才会重新复制 `skills/`、`mcp-servers/`、`config/`，以及工作区根上的 `AGENTS.md`。

### 必须遵守

改动下列任一内容时，**同一次改动里**把 `WORKSPACE_TEMPLATE_VERSION` 改成新字符串（日期加简短原因，不要复用当前值）：

- `workspace/skills/`
- `workspace/mcp-servers/`（含源码、技能会调用的工具说明）
- `workspace/config/`
- 仓库 `workspace/AGENTS.md`（会同步到用户工作区，供 OpenCode 会话加载）

只改桌面端 TypeScript、不同步进用户工作区的文件，不必为此升版本。

### MCP 还要重新打包

OpenCode 跑的是 `workspace/mcp-servers/<包名>/dist/mcp.js`，不是 `src/`。`dist/` 被 gitignore。改了 MCP 源码后，在对应包执行 `npm run build`，或在 `desktop` 执行 `npm run build:mcp`，再升版本。否则同步过去的仍是旧包。

升版本并打好包之后，需要重启桌面端，用户工作区才会换上新的 Skill 和 MCP。
