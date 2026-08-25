# memory-drift-game

《记忆漂移：最后一个下午 / Memory Drift: The Last Afternoon》是一款约 5–6 分钟的竖屏 2.5D 互动叙事游戏。设计基准为 1080×1920；Canvas 场景、照片、纹理和 Web Audio 声音均为原创程序生成，生产构建不依赖外部素材。

在线版本：https://630388703-sudo.github.io/memory-drift-game/

## 启动

```bash
npm install
npm run dev
```

检查与构建：

```bash
npm run lint
npm run build
```

## 键位

- `← → ↑ ↓` 或 `WASD`：移动扫描框、切换三轨、浏览坐标、选择门和碎片
- `Space` 短按：发出约 1.2 秒扫描波，切换碎片解释
- `Space` 稳定按住约 `0.65–2.3s`：进入 FOCUS、减慢走廊并确认读取
- `Space` 按住超过约 `2.3s`：OVERLOAD，强制读取并留下错误记忆或重影
- `R`：重新开始
- `F`：进入或退出全屏
- `E`：结局阶段导出本次匿名测试记录
- 右上角：静音 / 开启声音

输入反馈分为 `UNSTABLE 0–30%`、`FOCUS 30–70%`、`OVERLOAD 70–100%`。按压时长被映射成这三段压力；未来硬件可以直接传入同样的开始、结束和持续时间事件。

## 游戏流程

待机吸引 → 分阶段动态教学 → Stable Archive 三个扫描锚点 → Memory Drift 三轨走廊与两个碎片 → 三扇门 → Corrupted Classroom 三个坐标 → 五碎片重组 → Version A/B → 结局数据 → 10 秒自动重置。首次体验按正常观察与操作节奏约 5–6 分钟。

游戏没有死亡或 Game Over。空白数据区只会降低可信度；漏掉走廊碎片时空间自动回环。移动方向、压力状态、人物处理、门、坐标和碎片解释都持续改变 `memoryBias`，但 Version A 与 B 永远保持为两个同样合理的可保存版本。

## 目录

```text
app/
  MemoryDriftGame.tsx   状态机、关卡流程、记忆偏向、UI 和触控操作
  globals.css           1080×1920 响应式竖屏布局与柔和过渡
  layout.tsx            页面元数据与社交预览
  page.tsx              游戏入口
game/
  audio.ts              程序化雨声、时钟、脚步、扫描提示和短语音
  config.ts             文本、锚点、碎片、矛盾池、版本与资源入口
  input.ts              键盘 / 触控 / 未来硬件的独立输入适配层
  renderer.ts           Canvas 旧照片、走廊、教室、工作台和结局渲染
public/
  og.png                 原创社交预览图
  loot.html              可直接访问的 LOOT 美术优化版
  assets/generated/      三张原创梦核场景背景（WebP）
loot/
  index.html             可粘贴进 LOOT 的纯网页完整流程验证版
  prompt.md              LOOT 深度创作提示词
docs/
  LOOT_WORKFLOW.md       LOOT 导入与迭代记录
  USER_TEST_PROTOCOL.md  用户测试与访谈方案
.github/workflows/
  ci.yml                 GitHub 自动检查与生产构建
```

## 项目文档

- [LOOT 原型工作流](docs/LOOT_WORKFLOW.md)
- [用户测试方案](docs/USER_TEST_PROTOCOL.md)
- [LOOT 单文件验证版](loot/index.html)

GitHub Pages 根地址直接进入游戏，也可以通过 `/loot.html` 路径打开同一版本。

LOOT 当前版本为 Experience V5：三轨走廊缩短为约 45–55 秒的记忆追逐，加入五组路线门阵、八枚记忆微光、连击反馈、↑ 记忆跃迁、↓ 聚焦慢行和扫描碎片吸附。失误只会让路径短暂回退，不会死亡或中断叙事。版本同时保留原创竖屏场景、胶片扫描线、雨幕、漂尘、视差、锚点共振、真假回声、循环教室校准、九宫格碎片拼合和双版本结局。每个阶段首次进入自动显示操作教学，H 可再次查看；L 切换中英文，F 全屏，M 静音。结局导出的 JSON 只包含本次游戏行为，不记录姓名、账号、联系方式、位置或设备身份。

## 替换素材

集中修改 `game/config.ts` 中的锚点、碎片、文案、结局和 `assets` 路径。程序视觉位于 `game/renderer.ts`，声音位于 `game/audio.ts`。未来可把照片、纹理和音频放入 `public/assets/`，再从配置读取；状态机不需要随素材一起重写。

## Arduino / USB HID 接入

`game/input.ts` 是唯一输入边界。Arduino、USB HID 摇杆和压力传感器适配器只需把硬件数据转换为 `left/right/up/down/pressure-start/pressure-end`，并调用 `GameInput.emitHardware(action, heldMilliseconds)`。如果控制器直接映射为键盘按键，无需额外修改。
