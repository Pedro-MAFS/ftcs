# 初始化项目目录结构
# 用法: .\scripts\init-project.ps1

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dirs = @(
  "data/products/_example/inputs",
  "data/keywords", "data/leads", "data/emails",
  "data/exploration", "data/cache/search",
  "config", "skills", "mcp-servers", "scripts",
  "logs/exploration", ".cursor/skills", "docs/retrospective"
)

foreach ($dir in $dirs) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Host "Created: $dir"
}

Write-Host "`nProject skeleton initialized."
Write-Host "Next: read docs/04-实施计划.md and start Phase 1."
