# 同步 skills/ 到 .cursor/skills/ 与 .opencode/skills/
# 用法: .\scripts\sync-skills.ps1

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "skills"
$targets = @(
  (Join-Path $root ".cursor\skills"),
  (Join-Path $root ".opencode\skills")
)

if (-not (Test-Path $source)) {
  Write-Error "skills/ directory not found"
  exit 1
}

foreach ($target in $targets) {
  New-Item -ItemType Directory -Force -Path $target | Out-Null

  Get-ChildItem -Path $source -Directory | ForEach-Object {
    $dest = Join-Path $target $_.Name
    if (Test-Path $dest) {
      Remove-Item -Recurse -Force $dest
    }
    Copy-Item -Recurse -Force $_.FullName $dest
    Write-Host "Synced: $($_.Name) -> $target"
  }
}

Write-Host "`nSkills synced to .cursor/skills/ and .opencode/skills/"
