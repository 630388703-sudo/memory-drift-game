# 忘了自己是什么 / What Was I Again?

一款为竖屏设计的 HTML5 互动游戏。玩家追捕一只会忘记自身形态的生物；移动、观察、失误、重听与身体部件选择都会被它模仿，最终共同生成一个此前不存在的新形态。

- 游戏地址：<https://630388703-sudo.github.io/memory-drift-game/>
- 备用托管：<https://memory-drift-game.dsydsy0920900940.chatgpt.site>
- 设计基准：1080 × 1920，响应式适配其他竖屏与桌面浏览器
- 体验时长：约 5–6 分钟
- 视觉与声音：Canvas / SVG / Web Audio 原创程序生成，不依赖外部版权素材

## 启动

```bash
npm install
npm run dev
```

检查与构建：

```bash
npm run lint
npm test
npm run build:static
```

`npm run build:static` 会在 `gh-pages/` 生成完全静态的 GitHub Pages 版本。推送到 `main` 后，GitHub Actions 会自动检查并重新发布，因此发布后仍可继续修改。

## 键位

- `方向键` / `WASD`：移动、选择目标或身体部件
- `Space`：碰、扑、跳、确认或安装
- `↑`：声音关重听
- `L`：中英文切换
- `M`：静音
- `V`：视觉辅助
- `H`：快速指南
- `F`：全屏
- `R`：重开本局，保留上一观察者痕迹
- `Shift + R`：管理清除，连同本地展览痕迹一起重置

页面也提供触控方向键和动作按钮。输入逻辑集中在 `game/input.ts`，以后接入 USB HID、Arduino 或其他控制器时，只需把硬件信号映射为语义动作，不必重写关卡。

## 游戏流程

1. **准备间**：靠近并碰触可疑物件，找到伪装的生物。
2. **中央庭院**：根据形状、动作与声音破绽完成三轮追捕；扑错会生成假生物，最多保留三个。
3. **记忆竖井**：左右移动和跳跃。每次起跳后的 0.35 秒，跳跃弧线顶点附近会形成残影平台；跌落不会死亡，而会留下可被生物学会的动作。
4. **声音模仿**：听原声和模仿声，用左右键指出变化的音；提供可选视觉辅助。
5. **身体拼装**：为头、身体、双臂与腿安装云、弹簧、喇叭、叶子、灯泡或绳子。没有标准答案。
6. **身体试用**：生物直接表演由玩家选择与行为共同形成的动作状态。
7. **观察报告**：比较初次观测与当前学习形态，显示 MOTION、ATTENTION、ECHO、TRACE 的主要倾向。

游戏没有死亡、Game Over 或“正确物种”。核心结论固定为 `ORIGINAL FORM: UNVERIFIABLE / 原始形态：无法验证`。

## 玩家间记忆链

每局结束时，系统从结果中抽取一个微弱特征写入 `localStorage`。下一位玩家会在准备间角落看到模糊残影，并在报告中看到“上一观察者留下”。普通 `R` 重置不会删除它。

只保存一个抽象特征 ID 和最近 20 次匿名本地结果，不收集姓名、账号、联系方式、位置或设备身份，也不会上传到服务器。

## 目录

```text
app/
  WhatWasIAgainGame.tsx  完整关卡状态机、UI 与触控层
  globals.css            竖屏响应式视觉与按钮系统
game/
  config.ts              关卡、物件、声音与部件配置
  input.ts               键盘 / 触控 / 未来硬件输入边界
  renderer.ts            Canvas 场景、角色、生物与最终形态
  audio.ts               Web Audio 程序化背景与反馈音
  session.ts             行为统计、本地痕迹与观察报告
standalone/
  main.tsx               GitHub Pages 静态入口
loot/
  index.html             LOOT 发布壳，自动载入 GitHub 最新版
  prompt.md              LOOT 继续迭代时使用的约束说明
docs/
  LOOT_WORKFLOW.md       LOOT / GitHub 双发布流程
  USER_TEST_PROTOCOL.md  全流程测试清单
```

## 修改内容

- 关卡文案、物件、声音序列、身体部件：`game/config.ts`
- 生物、玩家、场景与报告画面：`game/renderer.ts`
- 界面、提示、按钮、关卡衔接：`app/WhatWasIAgainGame.tsx`
- 颜色、字体、响应式布局：`app/globals.css`
- 输入或未来硬件：`game/input.ts`
- 本地痕迹和最终报告规则：`game/session.ts`

LOOT 发布壳指向 GitHub Pages，所以以后只要继续提交并通过 Actions，已发布的 LOOT 页面也会自动显示新版本，不需要重复粘贴整份游戏代码。
