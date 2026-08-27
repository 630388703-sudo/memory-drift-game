# LOOT 与 GitHub 双发布

## 单一版本来源

完整游戏只在 GitHub 仓库维护。`main` 分支更新后，Actions 会构建 `gh-pages/` 并发布到：

<https://630388703-sudo.github.io/memory-drift-game/>

`loot/index.html` 是轻量展示壳，只嵌入这条地址。因此 LOOT 作品先发布后仍然可以修改：继续提交 GitHub 即可，不需要重复发布整份 LOOT 代码。

## LOOT 发布步骤

1. 在 LOOT 创建或打开作品；
2. 使用 `loot/index.html` 作为网页内容；
3. 预览时确认页面能够获得键盘焦点；
4. 发布后完整测试方向键、空格、L、M、V、H、F、R；
5. 如果 LOOT 外层拦截键盘，点击一次游戏画面再操作。

## 版本检查

- LOOT 标题必须是《忘了自己是什么》；
- 首屏出现保护区准备间，不应再出现旧教室走廊；
- GitHub Pages 和备用托管应显示相同七段流程；
- LOOT iframe 两侧不增加灰色舞台或额外标题栏；
- 后续视觉调整优先修改源码，不在 LOOT 页面维护第二份游戏。
