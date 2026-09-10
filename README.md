# 忘了自己是什么 / What Was I Again?

一件为 1080×1920 竖屏装置设计的网页互动实验。观众从“未响应”的生成式粒子信号进入一段记忆：经历动机导入、观看同一张图、三次回答同一个问题，并在照片与干扰之间移动。每次回想都会制造一个更强烈的新版本——彩色原图、全黑白档案、紫蓝色重构——最后把问题从“记对了吗”转向“我们是否正在失去遗忘的能力”。

- 在线地址：<https://630388703-sudo.github.io/memory-drift-game/>
- 备用托管：<https://memory-drift-game.dsydsy0920900940.chatgpt.site>
- 单轮时长：约 1 分钟，加引导与结果阅读
- 输入：触控、键盘、Gamepad，或 `window.MemoryDriftInput` 硬件桥接

## 体验流程

1. **未响应**：观众尚未靠近时，屏幕循环显示 TouchDesigner 风格的流体粒子信号。
2. **信号读取**：触碰、按键或硬件唤醒后，显示约 3.2 秒的加载过渡。
3. **介绍与观察**：通过五段短导入建立“保存不等于记住”的主题，观看包含四个人的最初画面，并记录第一次回答。
4. **记忆旅程**：左右移动收集照片并避开干扰。碰撞会触发明显的低频冲击声和画面断裂。
5. **版本重构**：约 18 秒再次回想后进入黑白 VERSION B；约 36 秒再次回想后进入紫蓝 VERSION C。
6. **结尾反问**：对照最初画面和三次回答，讨论遗忘作为自我保护，以及数字保存对自然遗忘的削弱。

人数回答只用于记录变化，不加分、不扣分，也不会判定失败。

## 本地运行

```bash
npm install
npm run dev
```

检查与静态构建：

```bash
npm run lint
npm test
npm run build:static
```

`npm run build:static` 在 `gh-pages/` 生成 GitHub Pages 版本。推送到 `main` 后，GitHub Actions 会自动检查并发布。

## 操作与硬件

- `←/→`、`A/D` 或 `J/L`：移动；人数提问时切换答案。
- `Enter`、`Space`、`Z` 或 `X`：唤醒、继续或确认回答。
- `P` / `Escape`：暂停。
- 触控：在画面内左右拖动；按钮直接点击。
- 标准手柄：左摇杆或方向键移动，主按钮确认，Start 暂停。

Arduino、压力传感器和 TouchDesigner 桥接方式见 [docs/HARDWARE-INTEGRATION.md](docs/HARDWARE-INTEGRATION.md)。

## 声音与授权

背景音乐和碰撞音来自 Pixabay，文件保存在 `public/audio/`。作者、来源页面、下载文件与许可说明见 [docs/AUDIO-SOURCES.md](docs/AUDIO-SOURCES.md)。代码仓库保留这份记录，避免声音脱离授权来源。

## 主要目录

```text
app/
  MemoryRushGame.tsx     当前互动、状态、Canvas 渲染与硬件输入
  globals.css            竖屏视觉、待机粒子、加载与结果界面
game/assets/             当前使用的背景、角色、照片、干扰与故障素材
public/audio/            Pixabay 背景音乐与碰撞音
standalone/main.tsx      GitHub Pages 静态入口
docs/AUDIO-SOURCES.md    声音作者与许可记录
docs/HARDWARE-INTEGRATION.md  展厅硬件映射与验收清单
loot/                    LOOT 发布壳与继续迭代说明
```

旧七关“追捕生物／身体拼装”初稿、旧打包产物和未使用道具素材已经移除；LOOT 壳、GitHub Pages 流程与硬件桥接继续保留。
