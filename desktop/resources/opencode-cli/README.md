# OpenCode CLI 二进制（预留）

当前 Phase 2.0 采用 **OpenCode SDK Server+Client**，通过系统 PATH 启动 `opencode`，**暂不使用本目录内嵌二进制**。

开发期请安装本机 CLI：

```powershell
npm install -g opencode-ai
opencode --version
```

或设置：

```powershell
$env:FTCS_OPENCODE_PATH = "C:\path\to\opencode.exe"
```

本目录保留给后续「安装包捆绑 CLI」阶段使用。
