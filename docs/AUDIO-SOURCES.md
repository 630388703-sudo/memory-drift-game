# 声音素材来源与许可

以下声音随项目保存在 `public/audio/`，用于离线展览和 GitHub Pages。两项素材的来源页面均标注为 Pixabay Content License；完整条款以 Pixabay 当前页面为准：<https://pixabay.com/service/license-summary/>。

## 背景音乐

- 项目文件：`public/audio/nostalgic-memories.mp3`
- 标题：Minimal Idm Ambient Works - Drumless Loop
- 作者：Musinova
- 时长：1:33
- 来源：<https://pixabay.com/music/ambient-minimal-idm-ambient-works-drumless-loop-518244/>
- Pixabay 素材编号：518244

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
