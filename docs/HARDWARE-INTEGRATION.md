# 展厅硬件接入说明

此网页已经把玩法与具体硬件解耦。厂家不需要修改游戏逻辑，只需把摇杆、街机按钮或压力传感器转换成下列输入之一。

## 直接可用的标准输入

- 横向摇杆：标准 Gamepad API 的 `axes[0]`，死区为 `0.18`。
- 数字方向：Gamepad 按钮 `14/15`，或键盘 `←/→`、`A/D`、`J/L`。
- 主按钮：Gamepad 按钮 `0/1/2`，或键盘 `Space`、`Enter`、`Z/X`。
- 暂停按钮：Gamepad `Start`（按钮 `9`），或键盘 `P/Escape`。

主按钮在引导页用于继续，在游戏内用于“遗忘冲刺”，在能力选择页用于确认。这样单摇杆加单按钮即可完成整局。

## 压力传感器 / Arduino / TouchDesigner 桥接

厂家可在浏览器容器或 TouchDesigner Web Render 中调用：

```js
window.MemoryDriftInput.wake();   // 距离/压力传感器检测到观众后唤醒
window.MemoryDriftInput.move(-1); // 左移，范围 -1..1
window.MemoryDriftInput.move(1);  // 右移
window.MemoryDriftInput.press(0.8); // 压力超过厂家阈值时触发一次
window.MemoryDriftInput.pause();
```

也可以派发事件，适合串口桥接脚本：

```js
window.dispatchEvent(new CustomEvent("memory-control", {
  detail: { action: "wake" }
}));

window.dispatchEvent(new CustomEvent("memory-control", {
  detail: { action: "move", value: 0.65 }
}));

window.dispatchEvent(new CustomEvent("memory-control", {
  detail: { action: "press", value: 0.82 }
}));
```

## 推荐厂家映射

1. 摇杆 X 轴归一化为 `-1..1`，中心死区建议 `0.15–0.22`。
2. 压力值先做 5–8 帧移动平均；从低于 `0.55` 上升到高于 `0.55` 时只触发一次 `press`，释放到 `0.35` 以下后才能再次触发，避免连发。
3. 街机只有方向与一个按钮也可完成所有页面；第二按钮可映射为 `pause`。
4. 竖屏建议 1080×1920；浏览器全屏并隐藏鼠标。网页会在其他比例中保持完整竖屏画面。
5. 第一次现场开机需用任意按钮完成一次用户手势，浏览器才允许播放声音。
6. 待机画面收到 `wake`、首次 `press`、键盘、触控或手柄动作后进入引导；引导 90 秒无操作、结算 45 秒无操作会自动回到待唤醒状态。
7. 中文/英文可在右上角设置中切换，选择会保存在浏览器本地。

## 交付验收

- 摇杆中心静止时角色不漂移。
- 左右推满能抵达两侧收集区，但不会超出道路。
- 主按钮可完成引导、冲刺和三选一确认。
- 碰撞、收集、泡泡、裂隙均有不同音效。
- 断开硬件后仍可用键盘和触控继续游戏。
- 刷新页面后最高分、相册和上一局痕迹仍保留。
