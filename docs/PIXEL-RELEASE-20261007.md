# 横屏像素版同步与清理 — 2026-10-07

本次以 `7a46e1bde8ddd678d605f74568e7c2441a3ba197` 为父提交，不强推、不重写历史。当前分支统一为棕发无五官角色的横屏像素版。GitHub Actions 从 source 构建 Pages，不再保留旧根目录 HTML/JS/CSS。

## 从当前分支移除的旧文件

- `app/DormantVisual.tsx`
- `app/MemoryRushGame.tsx`
- `app/layout-v14.css`
- `app/memory-feedback.ts`
- `app/photo-fault.ts`
- `app/photo-slot-feedback.ts`
- `app/presentation.css`
- `assets/index-B_kXfy7w.js`
- `assets/index-BgRlslps.css`
- `assets/layout-v14.css`
- `game/assets/grid-memory-bubble.webp`
- `game/assets/grid-memory-cart.webp`
- `game/assets/grid-memory-photo.webp`
- `game/assets/grid-surreal-memory-a.webp`
- `game/assets/grid-surreal-memory-b.webp`
- `game/assets/memory-glitch-overlay.webp`
- `game/assets/traveler-run-back.png`
- `index.html`
- `public/file.svg`
- `public/fonts/BarlowCondensed-600.woff2`
- `public/fonts/BarlowCondensed-800.woff2`
- `public/fonts/SmileySans-Oblique.woff2`
- `public/globe.svg`
- `public/og.png`
- `public/window.svg`
- `tests/memory-copy.test.mjs`

## 保留

厂商硬件/TouchDesigner历史说明、LOOT嵌入接入、音频与字体许可记录，以及现有可选 Sites/Next 架构配置均保留。硬件文件明确区分旧接口与新版实现。未删除 Git 历史、GitHub Releases 或本机备份；旧代码可从上述父提交恢复。

## 验证

当前发布目录类型检查通过；39项游戏/输入/存储/音频测试和3项静态构建检查通过。构建标识 `pixel-20261007-hair`，可读取 `version.json` 确认。实体机台和压力传感器未验收；Windows安装包不在本次 GitHub/Pages 同步范围。
