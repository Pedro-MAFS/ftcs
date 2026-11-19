# FTCS 形象图标导出（2026-11-19）

从今日抖音成片使用的动画形象导出，可供应用图标和桌面端使用。这是素材导出，不含产品代码改动。

## 推荐作应用图标（带表情的形象）

- `ftcs-mascot-1024.png`：主图标，1024×1024，透明底，闲置表情（微笑、睁眼）。
- `ftcs-mascot.ico`：Windows 图标（含 16–256 多尺寸）。
- `sizes/ftcs-mascot-16.png` 至 `ftcs-mascot-1024.png`：16 / 32 / 48 / 64 / 128 / 256 / 512 / 1024。

桌面端（Electron 等）通常把 `ftcs-mascot-1024.png` 交给 electron-builder / icon 生成流程，或直接使用本目录的 png 与 ico。

## 应用内动画（同一形象的三帧）

透明底 1024×1024，构图与主图标对齐，可做口型/眨眼：

- `sprites/ftcs-mascot-idle.png` 闲置（与主图标相同）
- `sprites/ftcs-mascot-talk.png` 张嘴
- `sprites/ftcs-mascot-blink.png` 眨眼

## 正式标志（无表情，仅蓝底白字 FT）

若桌面端应用图标要继续用现有正式标志，而不是拟人形象，见 `official-logo/`。这不是新画的，是从现有 FTCS logo 去白底导出。

## 说明

- 形象来自今日成片的拟人 FT 圆角方块，不是矢量源文件；放大请优先用 1024 PNG。
- 画布为透明圆角，系统可再套各自的图标遮罩。
- 未生成 macOS .icns（可在 macOS 上用 1024 PNG 生成）。
