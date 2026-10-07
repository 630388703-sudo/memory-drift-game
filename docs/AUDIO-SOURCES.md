# 声音素材来源与许可

2026-10-07 电子音频版：当前音源为 PYNCHON 和 Kenney 音效。保留下方 Pixabay 历史记录供回溯，不再在当前游戏包中播放或分发旧文件。当前设置页只有静音开关；现场音箱和耳机听感尚需实测。

## 当前来源与编辑：2026-10-07 电子版

本次从作者发布页及 Kenney 官方网站下载，不依赖第三方搬运。四个成品文件共约 527 KiB，随游戏保存在 `public/audio/`。本轮使用 CC0 音源，不改变画面、玩法或六键输入。

| 游戏文件 | 原素材与作者 | 取得来源 | 编辑 |
| --- | --- | --- | --- |
| `pynchon-loop.mp3` | PYNCHON — James Gargette（cinameng） | <https://opengameart.org/content/pynchon> | 原作者标注为短循环；裁去源文件开头 53 ms 编码静音，去除极低频、收敛高频，响度整理；首 2 ms / 尾 6 ms 去爆音，转为 128 kbps MP3；解码约 32.78 秒 |
| `metal-hit-a.mp3` | Impact Sounds / `impactMetal_heavy_000.ogg` — Kenney | <https://kenney.nl/assets/impact-sounds> | 高低通、尾部淡出、转单声道 MP3 |
| `metal-hit-b.mp3` | Impact Sounds / `impactPlate_heavy_000.ogg` — Kenney | 同上 | 截至 280 ms、高低通、尾部淡出、转单声道 MP3 |
| `memory-static.mp3` | Digital Audio / `spaceTrash1.ogg` — Kenney | <https://kenney.nl/assets/digital-audio> | 取前 280 ms，限定 550–6500 Hz，短淡入与淡出，转单声道 MP3 |

下载日期：2026-10-07。上述三个来源页均标明 **CC0**：<https://creativecommons.org/publicdomain/zero/1.0/>。保留自愿署名，PYNCHON 使用发布页 Attribution Notice 指定的 James Gargette；两个 Kenney 下载包内原始 License.txt 收录于 `docs/audio-licenses/`。这是来源记录，不冒充平台签发的授权证书。

直接下载地址：

- PYNCHON：<https://opengameart.org/sites/default/files/pynchon.mp3>
- Impact Sounds：<https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip>
- Digital Audio：<https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip>

### 当前混音

- 背景成品测量约 **-18.4 LUFS / -5.0 dBTP**；音乐总线游玩 -12 dB、答题/暂停 -22 dB，主输出 -4 dB。相比上一版过低的背景总线，节奏更容易听见；并非将全部声音一起放大。
- A/B/C 的低通分别为 9500 / 2600 / 6500 Hz，保持同一节奏但改变质地。
- 背景解码为 AudioBuffer 后循环，避免 HTMLAudio 重新播放产生的间隙；静音/切出时保留播放位置，恢复不会重头播放。样本解码完成不等于允许自动播放，仍须用户操作解锁。
- 碰撞：保留低频下坠和两层短噪声，叠加两个交替的金属采样；采样 -7 dB、最多 280 ms。碰撞时音乐避让 14 dB，420 ms 恢复。
- 收集：清亮上行双音，不加碰撞采样。记忆改写叠加轻微静电擦写；记忆干扰为短方波、错开的第二脉冲与数字采样，背景在 115 ms 内断续两次再恢复。断音总线与碰撞避让分开，后来的弱事件不会抹去强碰撞的避让。
- 网络音效加载失败仍有合成反馈。素材分别加载，避免一个下载失败拖住全部声音。静音、窗口失活、销毁均清除瞬态与断音自动化；限制复音和重复触发。

以上响度为数字测量和增益设置，不代表展场实际声压，也不能替代耳机与现场音箱试听。旧音源本地备份在本次任务输出的 `audio-refresh-20261007/previous-audio/`，Git 历史也保留旧版本。

## 历史来源：Pixabay

下列为之前版本使用的两项素材，当时来源页标注 Pixabay Content License：<https://pixabay.com/service/license-summary/>。以下混音参数仅为历史记录。

## 历史调音：2026-10-07 六键像素版（更换音源前）

未更换下面记录的两个音频文件。硬碰撞叠加短低频敲击、32 毫秒碎裂声和轻噪声，原有撞击采样淡出并限制在 340 毫秒内。收集维持清亮双音，成功保护用上行弹开声；碰撞音高仅在 ±2% 范围变化。

背景音独立避让总线在硬碰撞时衰减 14 dB，保持后用 420 毫秒恢复；较弱音效和场景音量变化不会提前取消避让。主输出保留余量与压缩，静音、离开页面和销毁时清理节点及自动化。以上是混音参数，不是现场声压或主观响度测量。文末旧调音记录仅供追溯。

## 背景音乐素材

- 项目文件：`public/audio/glitch-light.mp3`
- 标题：Glitch Light
- 作者：BerryDeep
- 时长：3:04（文件解码约 184.2 秒）
- 来源：<https://pixabay.com/music/abstract-glitch-light-592315/>
- Pixabay 素材编号：592315
- 获取：用户于 2026-09-22 从上述页面下载并提供原始 MP3。
- 许可：来源页面标注 Pixabay Content License；仅作为本互动作品的配乐使用，不作为独立音频素材提供再分发。
- 页面标注 Content ID Registered。发布带音乐的视频前应保留下载记录及许可凭证；此来源记录不是平台签发的许可证书。

## 2026-09-22 配乐更换

按用户选择，以 Glitch Light 替换 Musinova 的旧配乐。使用新文件名防止旧音频缓存；旧曲仅保留在旧版归档中。

原始文件响度分析约为 -9.60 LUFS、真峰值 +0.84 dBTP；旧文件约为 -17.37 LUFS。游戏音乐总线相应降低 8 dB（游玩 -27 dB，答题/暂停 -35 dB），补偿源文件响度差，不改变音效音量。保留分阶段滤波、碰撞压低背景 12 dB、静音与离开页面暂停。以上是数字测量与混音设置，不能代替现场音箱试听。

## 碰撞音

- 项目文件：`public/audio/impact-thud.mp3`
- 标题：Impact Thud
- 作者：Universfield
- 时长：约 1 秒
- 来源：<https://pixabay.com/sound-effects/film-special-effects-impact-thud-291047/>
- Pixabay 素材编号：291047

记录日期：2026-09-11。素材来源记录保留；2026-09-16 调整为统一混音，不再以满音量直接播放撞击素材。

## 2026-09-16 音效区分与混音

实现：`app/memory-audio.ts`。除上述已有音频外，本轮声音由 Web Audio 实时合成，未新增第三方素材。

- 收集：清亮的上行双音；覆盖保存保留双音，增加轻微擦写声。
- 碰撞：低频下坠撞击、短促中频碎裂，加已有 Impact Thud。素材未加载时合成撞击仍立即响应。
- 泡泡：下滑的水泡音，与收集、硬碰撞均不同。
- 主动保护：三音锁定；保护抵消干扰：短促弹开声，不播放受伤撞击。
- 确认、操作未完成、唤醒、版本重写、结束各使用独立节奏。
- 背景与效果分总线，经主输出压缩器混合；碰撞压低背景 12 dB，约 0.3 秒后平滑恢复。
- 黑白版本收窄背景音高频；暂停/回答期间降低背景，离开页面或待机停止播放。
- 静音同时停止当前效果和背景；限制重复触发与同时发声数量，结束后释放音频节点。
- 设置内可单独试听收集和碰撞，不改变游戏状态。倍速不改变音效音高。

自动测试覆盖声音结构、触发限流、背景避让、静音与清理。实际展场仍需用现场音箱校准总体音量，不能以代码增益代替实际声压或响度测量。
