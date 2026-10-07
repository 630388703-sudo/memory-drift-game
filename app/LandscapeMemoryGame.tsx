"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MemoryAudio, type MemoryCue } from "./memory-audio";
import { emptyPhotoSlots, storePhoto, losePhoto, alterPhoto, photoCount, type PhotoSlots } from "./memory-storage";
import { COUNT_OPTIONS, moveChoiceIndex, recallLabel } from "./memory-recall";
import { createWorld, stepWorld, type WorldEvent } from "./pixel-world";
import { createPixelInput, loadPixelBindings, DEFAULT_BUTTONS, type PixelAction, type PixelTouchAction, type PixelDevice } from "./pixel-input";
import { loadPixelArt, drawPixelWorld, drawMemoryPhoto, drawAtlasSprite, type PixelArt } from "./pixel-renderer";
import "./pixel-game.css";

type Screen = "title" | "loading" | "observe" | "count" | "detail" | "play" | "pause" | "controls" | "result";
type Lang = "en" | "zh";
type RecordData = { recalls: number[]; details: string[]; retained: number; collected: number; altered: number; replaced: number };
const ACTIONS: PixelAction[] = ["jump", "protect", "confirm", "pause", "compare", "help"];
const KEY_LABELS = ["Z / Space", "X", "Enter", "P / Esc", "C", "H"];
const NAMES = { en: ["Jump", "Protect photo", "Confirm", "Pause", "Compare original", "Controls"], zh: ["跳跃", "保护照片", "确认", "暂停", "对照原图", "操作说明"] };

function Icon({ kind }: { kind: "pause" | "sound" | "muted" | "settings" | "left" | "right" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {kind === "pause" ? <><path d="M8 4v16M16 4v16" strokeWidth="4" /></> : kind === "settings" ? <><path d="M4 7h16M4 17h16" /><path d="M8 3v8M16 13v8" strokeWidth="4" /></> : kind === "left" || kind === "right" ? <path d={kind === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} /> : <><path d="M3 9h4l5-5v16l-5-5H3z" />{kind === "sound" ? <path d="M16 8q5 4 0 8M19 4q8 8 0 16" /> : <path d="M16 9l6 6m0-6l-6 6" />}</>}
  </svg>;
}

function Photo({ art, count = 4, sky = "blue", carousel = "right", label }: { art: PixelArt | null; count?: number; sky?: string; carousel?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (ctx && art) drawMemoryPhoto(ctx, art, { count, sky, carousel }); }, [art, count, sky, carousel]);
  return <canvas ref={ref} width={480} height={270} className="px-memory-photo" role="img" aria-label={label} />;
}

function Sprite({ art, index = 4 }: { art: PixelArt | null; index?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (ctx && art) { ctx.clearRect(0, 0, 40, 40); ctx.imageSmoothingEnabled = false; drawAtlasSprite(ctx, art, index, 2, 2, 36, 36); } }, [art, index]);
  return <canvas ref={ref} width={40} height={40} aria-hidden="true" />;
}

export default function LandscapeMemoryGame() {
  const [language, setLanguage] = useState<Lang>("en");
  const [screen, setScreen] = useState<Screen>("title");
  const [art, setArt] = useState<PixelArt | null>(null);
  const [assetError, setAssetError] = useState(false);
  const [sound, setSound] = useState(true);
  const [device, setDevice] = useState<PixelDevice>("keyboard");
  const [stage, setStage] = useState(0);
  const [selection, setSelection] = useState(-1);
  const [recalls, setRecalls] = useState<number[]>([]);
  const [details, setDetails] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoSlots>(emptyPhotoSlots);
  const [feedback, setFeedback] = useState<[string, string]>(["向右走，捡起沿路的照片。", "Walk right and pick up the photographs."]);
  const [comment, setComment] = useState(0);
  const [showOriginal, setShowOriginal] = useState(true);
  const [bindings, setBindings] = useState(loadPixelBindings);
  const [bindingAction, setBindingAction] = useState<PixelAction | null>(null);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [replaced, setReplaced] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLElement>(null);
  const world = useRef(createWorld());
  const runtime = useRef({ screen: "title" as Screen, stage: 0, selection: -1, recalls: [] as number[], details: [] as string[], photos: emptyPhotoSlots(), replaced: 0, comment: 0, sound: true, returnScreen: "title" as Screen });
  const input = useRef<ReturnType<typeof createPixelInput> | null>(null);
  const audio = useRef<MemoryAudio | null>(null);
  const artRef = useRef<PixelArt | null>(null);
  const actions = useRef({ action: (_a: PixelAction, _p: boolean) => {}, navigate: (_d: number) => {}, event: (_e: WorldEvent) => {} });
  const bootTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);
  const label = (value: string | number | undefined) => recallLabel(value, language);

  const cue = (name: MemoryCue) => { if (runtime.current.sound) audio.current?.play(name); };
  const unlock = () => {
    if (!runtime.current.sound) return;
    try { if (!audio.current) audio.current = new MemoryAudio(new AudioContext(), document.baseURI); audio.current.unlock(); } catch { /* Sound is optional. */ }
  };
  const changeScreen = (next: Screen) => {
    runtime.current.screen = next;
    input.current?.clear();
    setScreen(next);
    audio.current?.setScene((["A", "B", "C"] as const)[Math.min(world.current.checkpoint, 2)], next !== "play");
  };
  const choose = (index: number) => { runtime.current.selection = index; setSelection(index); cue("confirm"); };
  const ask = (index: number) => {
    runtime.current.stage = index; runtime.current.selection = -1;
    setStage(index); setSelection(-1); changeScreen("count");
  };
  const setSlots = (next: PhotoSlots) => { runtime.current.photos = next; setPhotos(next); };
  const reset = () => {
    world.current = createWorld();
    runtime.current.recalls = []; runtime.current.details = []; runtime.current.replaced = 0; runtime.current.comment = 0;
    setRecalls([]); setDetails([]); setReplaced(0); setComment(0); setSlots(emptyPhotoSlots()); setRecord(null); setShowOriginal(true);
    setFeedback(["向右走，捡起沿路的照片。", "Walk right and pick up the photographs."]);
    changeScreen("observe");
  };
  const begin = () => {
    if (!artRef.current) return;
    unlock(); changeScreen("loading"); cue("wake");
    bootTimer.current = setTimeout(() => { changeScreen("observe"); cue("ready"); }, 2200);
  };
  const submit = () => {
    const state = runtime.current;
    if (state.selection < 0) return;
    cue("confirm");
    if (state.screen === "count") {
      const next = [...state.recalls]; next[state.stage] = COUNT_OPTIONS[state.selection];
      state.recalls = next; setRecalls(next);
      if (state.stage === 0) changeScreen("play");
      else { state.selection = -1; setSelection(-1); changeScreen("detail"); }
    } else {
      const options = state.stage === 1 ? ["left", "center", "right", "unknown"] : ["blue", "white", "pink", "unknown"];
      const next = [...state.details]; next[state.stage - 1] = options[state.selection];
      state.details = next; setDetails(next); changeScreen("play");
      setFeedback(["记下了，继续向右走。", "Saved. Keep heading right."]);
    }
  };
  const openControls = () => {
    if (runtime.current.screen === "controls" || runtime.current.screen === "loading") return;
    runtime.current.returnScreen = runtime.current.screen;
    changeScreen("controls");
  };
  const closeControls = () => { input.current?.capture(null); setBindingAction(null); changeScreen(runtime.current.returnScreen); };
  const togglePause = () => {
    if (runtime.current.screen === "play") changeScreen("pause");
    else if (runtime.current.screen === "pause") changeScreen("play");
    else if (runtime.current.screen === "controls") closeControls();
  };
  const finish = () => {
    const state = runtime.current;
    const next: RecordData = { recalls: [...state.recalls], details: [...state.details], retained: photoCount(state.photos), collected: world.current.collected.size, altered: state.photos.filter(p => p?.altered).length, replaced: state.replaced };
    setRecord(next); setShowOriginal(true); changeScreen("result"); cue("finish");
    try { localStorage.setItem("memory-drift.pixel-record.v1", JSON.stringify(next)); } catch { /* Visits still work without local storage. */ }
  };

  actions.current = {
    action(action, pressed) {
      const current = runtime.current.screen;
      if (pressed) unlock();
      if (action === "compare" && current === "result") { setShowOriginal(pressed); return; }
      if (!pressed) return;
      if (action === "pause") { togglePause(); return; }
      if (action === "help") { if (current === "controls") closeControls(); else openControls(); return; }
      if (current === "play" || current === "loading") return;
      if (action === "jump" || action === "confirm") {
        const focused = document.activeElement;
        const button = focused instanceof HTMLButtonElement && overlay.current?.contains(focused) ? focused : overlay.current?.querySelector<HTMLButtonElement>("[data-primary]");
        if (button && !button.disabled) button.click();
      }
    },
    navigate(direction) {
      const current = runtime.current.screen;
      if (current === "count" || current === "detail") {
        choose(moveChoiceIndex(runtime.current.selection, direction));
        // Confirm should submit the selection rather than re-click the focused option.
        requestAnimationFrame(() => overlay.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus());
      } else if (current !== "play" && current !== "loading") {
        const buttons = Array.from(overlay.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (!buttons.length) return;
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(at + direction + buttons.length) % buttons.length]?.focus();
      }
    },
    event(event) {
      const state = runtime.current;
      if (event.type === "photo") {
        const full = photoCount(state.photos) === 5;
        if (full) { state.replaced++; setReplaced(state.replaced); }
        setSlots(storePhoto(state.photos, { id: Number(event.id.split("-")[1]), at: world.current.time, version: (["A", "B", "C"] as const)[world.current.checkpoint], altered: false }));
        cue(full ? "overwrite" : "collect");
        setFeedback(full ? ["存满五张了，最早的一张被换掉。", "Five slots full. The oldest photo was replaced."] : ["捡到一张照片。", "Photograph collected."]);
      } else if (event.type === "collision") { const hadPhoto = photoCount(state.photos) > 0; setSlots(losePhoto(state.photos)); cue("collision"); setFeedback(hadPhoto ? ["撞到了，丢了一张照片。", "Hit. One stored photo was lost."] : ["撞到障碍了。", "You hit an obstacle."]); }
      else if (event.type === "bubble") { const hadPhoto = photoCount(state.photos) > 0; setSlots(alterPhoto(state.photos)); cue("bubble"); setFeedback(hadPhoto ? ["泡泡改动了一张照片。", "A bubble changed a stored photo."] : ["碰到泡泡，画面错了一下。", "A bubble disturbed the picture."]); }
      else if (event.type === "protect") { cue("protect"); setFeedback(["已准备好，四秒内能挡一次。", "Ready to block one hit for four seconds."]); }
      else if (event.type === "block") { cue("block"); setFeedback(["挡住了，照片还在。", "Blocked. Your photographs are safe."]); }
      else if (event.type === "checkpoint") { ask(event.index); cue("transition"); }
      else if (event.type === "finish") finish();
    },
  };

  useEffect(() => {
    let live = true;
    void loadPixelArt().then(value => { if (live) { artRef.current = value; setArt(value); } }).catch(() => { if (live) setAssetError(true); });
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches); updateMotion(); motion.addEventListener("change", updateMotion);
    input.current = createPixelInput({ onAction: (a, p) => actions.current.action(a, p), onNavigate: d => actions.current.navigate(d), onDevice: setDevice, onRebind: (_a, _i, next) => { setBindings(next); setBindingAction(null); }, onDisconnect: () => { if (runtime.current.screen === "play") changeScreen("pause"); } });
    const onBlur = () => { if (runtime.current.screen === "play") changeScreen("pause"); audio.current?.setActive(false); };
    const onFocus = () => audio.current?.setActive(!document.hidden);
    const onVisibility = () => document.hidden ? onBlur() : onFocus();
    window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onVisibility);
    return () => { live = false; input.current?.dispose(); input.current = null; audio.current?.dispose(); audio.current = null; if (bootTimer.current) clearTimeout(bootTimer.current); motion.removeEventListener("change", updateMotion); window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    let frame = 0, previous = 0, accumulator = 0, jumpQueued = false;
    const render = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, .06) : 0; previous = now;
      const controls = input.current?.read() ?? { axis: 0, jump: false, jumpPressed: false, protect: false };
      if (runtime.current.screen === "play") {
        accumulator += delta; jumpQueued ||= controls.jumpPressed;
        while (accumulator >= 1 / 120 && runtime.current.screen === "play") {
          const events = stepWorld(world.current, { ...controls, jumpPressed: jumpQueued, protect: controls.protect && photoCount(runtime.current.photos) > 0 }, 1 / 120);
          jumpQueued = false; accumulator -= 1 / 120;
          events.forEach(event => actions.current.event(event));
        }
        const x = world.current.x;
        const nextComment = x > 800 && x < 1200 ? 1 : x > 1980 && x < 2440 ? 2 : 0;
        if (nextComment !== runtime.current.comment) { runtime.current.comment = nextComment; setComment(nextComment); }
      } else { accumulator = 0; jumpQueued = false; }
      const ctx = canvas.current?.getContext("2d");
      if (ctx && artRef.current) drawPixelWorld(ctx, world.current, artRef.current, { reducedMotion, idle: runtime.current.screen !== "play", version: Math.min(world.current.checkpoint, 2) as 0 | 1 | 2 });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  useEffect(() => { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; document.title = language === "zh" ? "忘了自己是什么 · 像素横屏版" : "What Was I Again? · Pixel Edition"; }, [language]);
  useEffect(() => { overlay.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus({ preventScroll: true }); }, [screen]);

  const bindTouch = (action: PixelTouchAction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); unlock(); input.current?.setTouch(action, true); },
    onPointerUp: () => input.current?.setTouch(action, false), onPointerCancel: () => input.current?.setTouch(action, false), onLostPointerCapture: () => input.current?.setTouch(action, false),
  });
  const isQuestion = screen === "count" || screen === "detail";
  const options: Array<string | number> = screen === "count" ? [...COUNT_OPTIONS] : stage === 1 ? ["left", "center", "right", "unknown"] : ["blue", "white", "pink", "unknown"];
  const area = Math.min(world.current.checkpoint, 2);
  const areaTitles = language === "en" ? ["THE FIRST IMAGE", "OTHER PEOPLE'S MEMORY", "WHAT REMAINS"] : ["最初的照片", "别人的记忆", "还记得什么"];
  const primaryText = tr("我看过了", "I have seen it");
  const buttonName = (action: PixelAction) => `${tr("键", "BTN ")}${bindings[action] + 1}`;

  return <main className="px-page" data-screen={screen}>
    <div className="px-game">
      <header className="px-header">
        <strong>{tr("忘了自己是什么", "WHAT WAS I AGAIN?")}</strong>
        <span className="px-area">0{area + 1} / {areaTitles[area]}</span>
        <nav aria-label={tr("游戏设置", "Game settings")}>
          <button type="button" className="px-language" onClick={() => setLanguage(language === "en" ? "zh" : "en")} aria-label={tr("Switch to English", "切换到中文")}>{language === "en" ? "中" : "EN"}</button>
          <button type="button" aria-label={tr(sound ? "关闭声音" : "开启声音", sound ? "Mute sound" : "Enable sound")} aria-pressed={!sound} onClick={() => { runtime.current.sound = !sound; setSound(!sound); audio.current?.setEnabled(!sound); if (!sound) unlock(); }}><Icon kind={sound ? "sound" : "muted"} /></button>
          <button type="button" aria-label={tr("操作说明与改键", "Controls and remapping")} onClick={openControls}><Icon kind="settings" /></button>
          <button type="button" aria-label={tr("暂停", "Pause")} disabled={screen !== "play" && screen !== "pause"} onClick={togglePause}><Icon kind="pause" /></button>
        </nav>
      </header>
      <div className="px-stage">
        <canvas ref={canvas} className="px-world" width={480} height={270} role="img" aria-label={tr("横向像素关卡：向右移动，跳跃捡照片，避开干扰。", "Side-scrolling pixel level. Move right, jump to collect photographs and avoid interference.")} />
        {screen === "play" && <>
          <div className="px-hud" aria-label={tr("照片存档", "Stored photographs")}><div className="px-slots">{photos.map((p, i) => <span key={i} className={p?.altered ? "is-altered" : ""} aria-label={p ? tr(p.altered ? "已改动的照片" : "照片", p.altered ? "Changed photograph" : "Photograph") : tr("空位", "Empty slot")}>{p ? <Sprite art={art} /> : <i />}{p?.altered && <b>×</b>}</span>)}</div><small>{tr("照片", "PHOTOS")} {photoCount(photos)} / 5 {replaced > 0 && <em> · {tr("替换", "REPLACED")} {replaced}</em>}</small></div>
          <p className="px-feedback" role="status">{tr(...feedback)}</p>
          {comment > 0 && <aside className="px-comment"><small>{tr("别人的留言 · 游戏虚构", "OTHER PEOPLE'S COMMENTS · FICTIONAL")}</small><p>{comment === 1 ? tr("“我记得有五个人。”", '“I remember five people.”') : tr("“那天的天空是粉色的吧。”", '“Wasn’t the sky pink that day?”')}</p><p>{comment === 1 ? tr("“对，我也记得五个。”", '“Yes, five. That’s what I remember.”') : tr("“嗯，我记得也是。”", '“That’s how I remember it too.”')}</p></aside>}
        </>}
        {screen !== "play" && <section ref={overlay} className={`px-overlay px-${screen}`} aria-label={tr("游戏面板", "Game panel")}>
          {screen === "title" && <div className="px-title-layout"><div><h1>{language === "en" ? <>What was<br />I again?</> : <>忘了自己<br />是什么</>}</h1><p>{tr("先看一张照片。沿路捡起照片碎片，中途会再问你记住了什么。", "Look at a photograph. Collect its fragments along the way. See what you remember when you are asked again.")}</p><button type="button" data-primary className="px-primary" disabled={!art || assetError} onClick={begin}>{assetError ? tr("素材加载失败", "Art could not load") : art ? tr("看看那张照片", "Look at the photograph") : tr("正在准备画面…", "Preparing the scene…")}</button>{assetError && <button type="button" onClick={() => location.reload()}>{tr("重新加载", "Reload")}</button>}<small>{tr("没有倒计时。按自己的节奏玩。", "No countdown. Take your time.")}</small></div><div className="px-title-controls"><div className="px-cabinet" aria-hidden="true"><span className="px-stick"><i /></span><div>{[0,1,2,3,4,5].map(n => <i key={n}>{n + 1}</i>)}</div></div><h2>{tr("一个摇杆，六个按键", "One stick. Six buttons.")}</h2><p>{tr("摇杆左右移动；跳上平台捡照片。", "Move left or right. Jump onto platforms for photographs.")}</p><div className="px-mini-controls"><span><kbd>Z</kbd>{tr("跳跃", "Jump")}</span><span><kbd>X</kbd>{tr("长按保护", "Hold to protect")}</span><span><kbd>Enter</kbd>{tr("确认", "Confirm")}</span></div><button type="button" className="px-text-button" onClick={openControls}>{tr("查看六键说明 / 调整按键", "Six-button guide / remap controls")}</button></div></div>}
          {screen === "loading" && <div className="px-boot" role="status"><div className="px-signal">{Array.from({ length: 12 }, (_, n) => <i key={n} style={{ animationDelay: `${n * .09}s` }} />)}</div><p>{tr("正在打开照片", "Opening the photograph")}</p></div>}
          {screen === "observe" && <div className="px-observe-layout"><div className="px-photo-frame"><Photo art={art} label={tr("原始照片：四个人，右侧旋转木马，蓝色天空。", "Original photograph: four people, a carousel on the right and a blue sky.")} /><small>{tr("原始照片", "ORIGINAL PHOTOGRAPH")}</small></div><div><h1>{tr("看看这张照片", "Take a look.")}</h1><p>{tr("记住你看到的人和周围的景物。看好后再继续。", "Notice the people and the place around them. Continue when you are ready.")}</p><button type="button" data-primary className="px-primary" onClick={() => ask(0)}>{primaryText}</button></div></div>}
          {isQuestion && <div className="px-question"><small>{tr(`第 ${stage + 1} 次回想`, `RECALL ${stage + 1} / 3`)}</small><h1>{screen === "count" ? tr("最初的照片里，有几个人？", "How many people were in the first photograph?") : stage === 1 ? tr("旋转木马在哪一侧？", "Where was the carousel?") : tr("最初的天空是什么颜色？", "What color was the sky?")}</h1><div className="px-choices" role="group" aria-label={tr("选择答案", "Choose an answer")}>{options.map((value, i) => <button type="button" key={value} aria-pressed={selection === i} onClick={() => choose(i)}>{label(value)}</button>)}</div><p>{tr("摇杆左右选择，回中后可再选。按确认键提交。", "Move the stick to choose, then return it to center. Press Confirm to continue.")}</p><button type="button" data-primary className="px-primary" disabled={selection < 0} onClick={submit}>{tr("记下这个回答", "Keep this answer")}</button></div>}
          {screen === "pause" && <div className="px-pause-panel"><h1>{tr("暂停了", "Paused")}</h1><p>{tr("照片和你的回答都还在。", "Your photographs and answers are still here.")}</p><button type="button" data-primary className="px-primary" onClick={() => { unlock(); changeScreen("play"); }}>{tr("继续走", "Continue")}</button><button type="button" onClick={openControls}>{tr("操作说明", "Controls")}</button></div>}
          {screen === "controls" && <div className="px-controls-panel"><div className="px-controls-heading"><h1>{tr("操作说明", "Controls")}</h1><button type="button" data-primary onClick={closeControls}>{tr("返回", "Back")}</button></div><p>{tr("摇杆左右 / 方向键 / A、D：移动。问答时左右选答案，再按确认。", "Joystick / arrow keys / A, D: move. During a question, choose left or right, then confirm.")}</p><div className="px-binding-list">{ACTIONS.map((action, i) => <div key={action}><span>{NAMES[language][i]}</span><kbd>{KEY_LABELS[i]}</kbd><button type="button" aria-label={`${tr("重新设置", "Remap")} ${NAMES[language][i]}`} aria-pressed={bindingAction === action} onClick={() => { input.current?.capture(action); setBindingAction(action); }}>{bindingAction === action ? tr("请按实体按键…", "Press a button…") : `${buttonName(action)} ↗`}</button></div>)}</div><p className="px-control-note">{tr("保护：先捡到照片，再长按 0.7 秒，可在随后 4 秒内挡一次碰撞。键号是默认输入顺序，不代表机台上的位置；点右侧按钮后，按你想用的实体键。重复分配会交换功能。", "Protection: collect a photo, then hold for 0.7 seconds to block one hit within 4 seconds. Button numbers are input defaults, not cabinet positions. Select a binding and press your physical button. Conflicting bindings swap.")}</p><div className="px-control-footer"><button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); input.current?.setBindings({ ...DEFAULT_BUTTONS }); setBindings({ ...DEFAULT_BUTTONS }); }}>{tr("恢复默认按键", "Reset bindings")}</button>{bindingAction && <button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); }}>{tr("取消改键", "Cancel remapping")}</button>}<span>{tr("声音", "AUDIO")}: Glitch Light — BerryDeep</span></div></div>}
          {screen === "result" && record && <div className="px-result-layout"><div><div className="px-result-tabs"><button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>{tr("原始照片", "Original")}</button><button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>{tr("按人数重画的一版", "From your count")}</button></div><Photo art={art} count={showOriginal ? 4 : (recalls[2] ?? 0)} sky="blue" carousel="right" label={showOriginal ? tr("原始照片", "Original photograph") : tr("依据最后人数重画的照片，不是原图", "A reconstruction from your final count, not the original")} /><p>{showOriginal ? tr("原图一直没有变。", "The original never changed.") : tr("这一版只按最后回答的人数重画；位置和颜色的回答在旁边对照。选了记不清，就不补入人物。", "Only the people are redrawn from your final count. Position and color are compared alongside. Not sure leaves the people out.")}</p></div><div className="px-result-copy"><h1>{tr("还记得多少？", "What stayed?")}</h1><div className="px-recall-history">{recalls.map((value, i) => <span key={i}><small>{tr(`第 ${i + 1} 次`, `RECALL ${i + 1}`)}</small><b>{label(value)}</b></span>)}</div><dl><div><dt>{tr("原图人数", "Original count")}</dt><dd>{label(4)}</dd></div><div><dt>{tr("旋转木马：原图 / 回答", "Carousel: original / answer")}</dt><dd>{label("right")} / {label(details[0])}</dd></div><div><dt>{tr("天空：原图 / 回答", "Sky: original / answer")}</dt><dd>{label("blue")} / {label(details[1])}</dd></div></dl><p>{tr("路上的留言是写好的。它们说有五个人、粉色天空；原图却是四个人、蓝色天空。", "The comments were scripted: five people, a pink sky. The original shows four people and a blue sky.")}</p><p className="px-final-question">{tr("你想留下哪一版？", "Which version would you keep?")}</p><button type="button" data-primary className="px-primary" onClick={reset}>{tr("再看一次", "Look again")}</button></div></div>}
        </section>}
      </div>
      <footer className="px-footer"><span>{device === "gamepad" ? tr(`摇杆移动 · ${buttonName("jump")} 跳跃 · ${buttonName("protect")} 长按保护`, `STICK  MOVE · ${buttonName("jump")} JUMP · HOLD ${buttonName("protect")} PROTECT`) : tr("← → 移动 · Z / 空格 跳跃 · 长按 X 保护", "← → MOVE · Z / SPACE JUMP · HOLD X TO PROTECT")}</span><span>{tr("走到下一张照片前", "Reach the next photograph")}</span></footer>
    </div>
    <div className="px-touch" aria-label={tr("触屏操作", "Touch controls")} data-visible={screen === "play"}><div><button type="button" aria-label={tr("向左移动", "Move left")} {...bindTouch("left")}><Icon kind="left" /></button><button type="button" aria-label={tr("向右移动", "Move right")} {...bindTouch("right")}><Icon kind="right" /></button></div><div><button type="button" {...bindTouch("protect")}>{tr("保护", "Protect")}</button><button type="button" className="px-jump" {...bindTouch("jump")}>{tr("跳跃", "Jump")}</button></div></div>
    <p className="px-rotate">{tr("横过来，能看到完整的路。", "Turn your screen sideways for the full view.")}</p>
  </main>;
}
