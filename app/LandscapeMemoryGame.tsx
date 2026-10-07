"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MemoryAudio, type MemoryCue } from "./memory-audio";
import { emptyPhotoSlots, storePhoto, losePhoto, alterPhoto, photoCount, type PhotoSlots } from "./memory-storage";
import { COUNT_OPTIONS, moveChoiceIndex, recallLabel } from "./memory-recall";
import { createWorld, stepWorld, type WorldEvent } from "./pixel-world";
import { createPixelInput, loadPixelBindings, DEFAULT_BUTTONS, type PixelConnection, type PixelAction, type PixelTouchAction, type PixelDevice } from "./pixel-input";
import { practiceStep, PRACTICE_STEPS, type PracticeStep } from "./pixel-tutorial";
import { loadPixelArt, drawPixelWorld, drawMemoryPhoto, drawGameObject, type PixelArt } from "./pixel-renderer";
import "./pixel-game.css";

type Screen = "title" | "practice" | "loading" | "observe" | "count" | "detail" | "play" | "pause" | "controls" | "result";
type Lang = "en" | "zh";
type RecordData = { recalls: number[]; details: string[]; retained: number; collected: number; altered: number; replaced: number };
const ACTIONS: PixelAction[] = ["jump", "protect", "confirm", "pause", "compare", "help"];
const KEY_LABELS = ["Z / Space", "X", "Enter", "P / Esc", "C", "H"];
const NAMES = { en: ["Jump", "Protect photo", "Confirm", "Pause", "Compare (ending)", "Controls"], zh: ["跳跃", "保护照片", "确认", "暂停", "结尾看原图", "操作说明"] };

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
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (ctx && art) { ctx.clearRect(0, 0, 40, 40); ctx.imageSmoothingEnabled = false; drawGameObject(ctx, art, index, 2, 2, 36, 36); } }, [art, index]);
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
  const [connection, setConnection] = useState<PixelConnection>({ connected: false, id: '', buttons: 0 });
  const [pressedButton, setPressedButton] = useState<number | null>(null);
  const [practice, setPractice] = useState<PracticeStep>('move');
  const [shield, setShield] = useState(false);
  const [bindingAction, setBindingAction] = useState<PixelAction | null>(null);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [replaced, setReplaced] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLElement>(null);
  const world = useRef(createWorld());
  const runtime = useRef({ screen: "title" as Screen, stage: 0, selection: -1, recalls: [] as number[], details: [] as string[], photos: emptyPhotoSlots(), replaced: 0, comment: 0, sound: true, returnScreen: "title" as Screen, activeScreen: "play" as "play" | "practice", practice: 'move' as PracticeStep, shield: false });
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
    audio.current?.setScene((["A", "B", "C"] as const)[Math.min(world.current.checkpoint, 2)], next !== "play" && next !== "practice");
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
    world.current = createWorld();
    runtime.current.shield = false; setShield(false);
    setFeedback(['向右走，捡起沿路的照片。', 'Walk right and pick up the photographs.']);
    unlock(); changeScreen("loading"); cue("wake");
    bootTimer.current = setTimeout(() => { changeScreen("observe"); cue("ready"); }, 2200);
  };
  const startPractice = () => {
    if (!artRef.current) return;
    world.current = createWorld('practice');
    runtime.current.practice = 'move'; runtime.current.shield = false;
    setPractice('move'); setShield(false); setFeedback(['先试试按键，练习不计入正式游戏。', 'This is practice. It will not change your photographs.']);
    unlock(); changeScreen('practice');
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
      setFeedback(["选好了，继续往右走。", "Saved. Keep heading right."]);
    }
  };
  const openControls = () => {
    if (runtime.current.screen === "controls" || runtime.current.screen === "loading") return;
    runtime.current.returnScreen = runtime.current.screen;
    changeScreen("controls");
  };
  const closeControls = () => { input.current?.capture(null); setBindingAction(null); changeScreen(runtime.current.returnScreen); };
  const togglePause = () => {
    if (runtime.current.screen === "play" || runtime.current.screen === "practice") { runtime.current.activeScreen = runtime.current.screen; changeScreen("pause"); }
    else if (runtime.current.screen === "pause") changeScreen(runtime.current.activeScreen);
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
      if (current === "play" || current === "loading" || (current === "practice" && runtime.current.practice !== "done")) return;
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
      } else if (current !== "play" && current !== "loading" && current !== "practice") {
        const buttons = Array.from(overlay.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (!buttons.length) return;
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[at < 0 ? (direction > 0 ? 0 : buttons.length - 1) : (at + direction + buttons.length) % buttons.length]?.focus();
      }
    },
    event(event) {
      const state = runtime.current;
      if (state.screen === 'practice') {
        if (event.type === 'photo') { cue('collect'); setFeedback(['捡到了！落回地面，试试保护键。', 'Got it. Return to the ground and try protecting it.']); }
        else if (event.type === 'protect') { cue('protect'); setFeedback(['保护已开启，等泡泡过来。', 'Ready. Let the signal reach you.']); }
        else if (event.type === 'block') { cue('block'); setFeedback(['挡住了！可以正式开始了。', 'Blocked. You are ready to begin.']); }
        else if (event.type === 'bubble' || event.type === 'collision') { cue('bubble'); setFeedback(['练习时不会丢照片。松开保护键，再长按一次。', 'Photo safe. Release Protect, then hold it again.']); }
        return;
      }
      if (event.type === "photo") {
        const full = photoCount(state.photos) === 5;
        if (full) { state.replaced++; setReplaced(state.replaced); }
        setSlots(storePhoto(state.photos, { id: Number(event.id.split("-")[1]), at: world.current.time, version: (["A", "B", "C"] as const)[world.current.checkpoint], altered: false }));
        cue(full ? "overwrite" : "collect");
        setFeedback(full ? ["只能带五张，新照片换掉了最早捡到的那张。", "Five slots full. The oldest photo was replaced."] : ["捡到一张照片。", "Photograph collected."]);
      } else if (event.type === "collision") { const hadPhoto = photoCount(state.photos) > 0; setSlots(losePhoto(state.photos)); cue("collision"); setFeedback(hadPhoto ? ["撞到了，丢了一张照片。", "Hit. One stored photo was lost."] : ["撞到障碍了。", "You hit an obstacle."]); }
      else if (event.type === "bubble") { const hadPhoto = photoCount(state.photos) > 0; setSlots(alterPhoto(state.photos)); cue("bubble"); setFeedback(hadPhoto ? ["碰到泡泡，带着的一张照片变了。", "A bubble changed a stored photo."] : ["碰到泡泡，画面抖了一下。", "A bubble disturbed the picture."]); }
      else if (event.type === "protect") { cue("protect"); setFeedback(["保护已开启，接下来约四秒能挡一次碰撞。", "Ready to block one hit for four seconds."]); }
      else if (event.type === "block") { cue("block"); setFeedback(["挡住了，照片还在。", "Blocked. Your photographs are safe."]); }
      else if (event.type === "checkpoint") { ask(event.index); cue("transition"); }
      else if (event.type === "finish") finish();
      else if (event.type === "spring") { cue('confirm'); setFeedback(['弹起来了，上面有照片！', 'Up you go. There is a photograph above.']); }
    },
  };

  useEffect(() => {
    let live = true;
    void loadPixelArt().then(value => { if (live) { artRef.current = value; setArt(value); } }).catch(() => { if (live) setAssetError(true); });
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches); updateMotion(); motion.addEventListener("change", updateMotion);
    input.current = createPixelInput({ onAction: (a, p) => actions.current.action(a, p), onNavigate: d => actions.current.navigate(d), onDevice: setDevice, onConnection: setConnection, onButton: (index, pressed) => setPressedButton(previous => pressed ? index : previous === index ? null : previous), onRebind: (_a, _i, next) => { setBindings(next); setBindingAction(null); }, onDisconnect: () => { if (runtime.current.screen === "play" || runtime.current.screen === "practice") togglePause(); } });
    input.current.setLayout(6);
    const onBlur = () => { if (runtime.current.screen === "play" || runtime.current.screen === "practice") togglePause(); audio.current?.setActive(false); };
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
      if (runtime.current.screen === "play" || (runtime.current.screen === "practice" && runtime.current.practice !== 'done')) {
        accumulator += delta; jumpQueued ||= controls.jumpPressed;
        while (accumulator >= 1 / 120 && (runtime.current.screen === "play" || runtime.current.screen === 'practice')) {
          const practicing = runtime.current.screen === 'practice';
          const events = stepWorld(world.current, { ...controls, jumpPressed: jumpQueued, protect: controls.protect && (practicing ? world.current.collected.size > 0 : photoCount(runtime.current.photos) > 0) }, 1 / 120);
          jumpQueued = false; accumulator -= 1 / 120;
          events.forEach(event => actions.current.event(event));
          if (practicing) {
            const next = practiceStep(world.current);
            if (next !== runtime.current.practice) { runtime.current.practice = next; setPractice(next); }
            if (next === 'done') { input.current?.clear(); accumulator = 0; break; }
          }
        }
        const shieldActive = world.current.shieldUntil > world.current.time;
        if (shieldActive !== runtime.current.shield) { runtime.current.shield = shieldActive; setShield(shieldActive); }
        const x = world.current.x;
        const nextComment = runtime.current.screen !== 'play' ? 0 : x > 800 && x < 1200 ? 1 : x > 1980 && x < 2440 ? 2 : 0;
        if (nextComment !== runtime.current.comment) { runtime.current.comment = nextComment; setComment(nextComment); }
      } else { accumulator = 0; jumpQueued = false; }
      const ctx = canvas.current?.getContext("2d");
      if (ctx && artRef.current) drawPixelWorld(ctx, world.current, artRef.current, { reducedMotion, idle: runtime.current.screen !== "play" && runtime.current.screen !== 'practice', version: Math.min(world.current.checkpoint, 2) as 0 | 1 | 2 });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  useEffect(() => { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; document.title = language === "zh" ? "忘了自己是什么 · 像素横屏版" : "What Was I Again? · Pixel Edition"; }, [language]);
  useEffect(() => { overlay.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus({ preventScroll: true }); }, [screen]);
  useEffect(() => { if (screen === 'practice' && practice === 'done') overlay.current?.querySelector<HTMLButtonElement>('[data-primary]')?.focus({ preventScroll: true }); }, [screen, practice]);

  const bindTouch = (action: PixelTouchAction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); unlock(); input.current?.setTouch(action, true); },
    onPointerUp: () => input.current?.setTouch(action, false), onPointerCancel: () => input.current?.setTouch(action, false), onLostPointerCapture: () => input.current?.setTouch(action, false),
  });
  const isQuestion = screen === "count" || screen === "detail";
  const options: Array<string | number> = screen === "count" ? [...COUNT_OPTIONS] : stage === 1 ? ["left", "center", "right", "unknown"] : ["blue", "white", "pink", "unknown"];
  const area = Math.min(world.current.checkpoint, 2);
  const areaTitles = language === "en" ? ["THE FIRST IMAGE", "OTHER PEOPLE'S MEMORY", "WHAT REMAINS"] : ["第一张照片", "路边的留言", "再想一遍"];
  const primaryText = tr("看好了", "I have seen it");
  const buttonName = (action: PixelAction) => `${tr("键", "BTN ")}${bindings[action] + 1}`;
  const prompt = (action: PixelAction) => device === 'gamepad' ? buttonName(action) : device === 'touch' ? NAMES[language][ACTIONS.indexOf(action)] : KEY_LABELS[ACTIONS.indexOf(action)];
  const moving = screen === 'play' || screen === 'practice';
  const practiceIndex = practice === 'done' ? 4 : PRACTICE_STEPS.indexOf(practice);
  const practiceCopy = {
    move: [tr('先试试左右移动', 'Try moving.'), tr('往右走，到箭头路标那里。', 'Move left or right toward the arrow.'), device === 'keyboard' ? '← → / A D' : tr('摇杆左右', 'STICK ← →')],
    jump: [tr('跳一下试试', 'Now jump.'), tr('轻按跳得低，按住跳得高。', 'Hold Jump for a higher leap. Release for a short hop.'), prompt('jump')],
    collect: [tr('够到上面的照片', 'Get the photograph.'), tr('从平台左边往右跳，跳跃键多按一会儿。碰到照片就捡到了。', 'Jump from the left edge and keep moving right. Touch the photograph to collect it.'), `${device === 'keyboard' ? '→' : tr('摇杆', 'STICK')} + ${prompt('jump')}`],
    protect: [tr('挡住过来的泡泡', 'Block the signal.'), tr('落回地面，按住保护键 0.7 秒再松开。角色周围亮起边框后，等泡泡碰过来。', 'Return to the ground. Hold Protect for 0.7 seconds, then release. Let the signal reach you while the outline is lit.'), prompt('protect')],
    done: [tr('准备好了', 'You are ready.'), tr('接下来，撞到障碍会丢一张照片，碰到泡泡会让一张照片变样。练习不计入正式游戏。', 'On the route, obstacles lose a photo and bubbles change one. Practice does not carry over.'), prompt('confirm')],
  };
  const cabinetLabel = <span className="px-cabinet-label">{tr('六个按键 · 每排三个', '6 BUTTONS · TWO ROWS OF THREE')}</span>;
  const connectionLabel = connection.connected ? tr('手柄已连接', 'USB controller detected') : tr('接好摇杆后，先按一下上面的按键。', 'No controller yet? Press a physical button.');

  return <main className="px-page" data-screen={screen}>
    <div className="px-game">
      <header className="px-header">
        <strong>{tr("忘了自己是什么", "WHAT WAS I AGAIN?")}</strong>
        <span className="px-area">{screen === 'practice' ? tr('先练一练', 'PRACTICE / NO PENALTY') : `0${area + 1} / ${areaTitles[area]}`}</span>
        <nav aria-label={tr("游戏设置", "Game settings")}>
          <button type="button" className="px-language" onClick={() => setLanguage(language === "en" ? "zh" : "en")} aria-label={tr("Switch to English", "切换到中文")}>{language === "en" ? "中" : "EN"}</button>
          <button type="button" aria-label={tr(sound ? "关闭声音" : "开启声音", sound ? "Mute sound" : "Enable sound")} aria-pressed={!sound} onClick={() => { runtime.current.sound = !sound; setSound(!sound); audio.current?.setEnabled(!sound); if (!sound) unlock(); }}><Icon kind={sound ? "sound" : "muted"} /></button>
          <button type="button" aria-label={tr("操作说明与改键", "Controls and remapping")} onClick={openControls}><Icon kind="settings" /></button>
          <button type="button" aria-label={tr("暂停", "Pause")} disabled={!moving && screen !== "pause"} onClick={togglePause}><Icon kind="pause" /></button>
        </nav>
      </header>
      <div className="px-stage">
        <canvas ref={canvas} className="px-world" width={480} height={270} role="img" aria-label={tr("往右走，跳起来捡照片，躲开障碍和泡泡。", "Side-scrolling pixel level. Move right, jump to collect photographs and avoid interference.")} />
        {screen === "play" && <>
          <div className="px-hud" aria-label={tr("随身的照片", "Stored photographs")}><div className="px-slots">{photos.map((p, i) => <span key={i} className={p?.altered ? "is-altered" : ""} aria-label={p ? tr(p.altered ? "变了样的照片" : "照片", p.altered ? "Changed photograph" : "Photograph") : tr("空位", "Empty slot")}>{p ? <Sprite art={art} /> : <i />}{p?.altered && <b>×</b>}</span>)}</div><small>{tr("照片", "PHOTOS")} {photoCount(photos)} / 5 {replaced > 0 && <em> · {tr("已换下", "REPLACED")} {replaced}</em>}</small></div>
          <div className="px-route" aria-label={tr('回想进度', 'Recall progress')}>{[0, 1, 2].map(n => <span key={n} data-current={area === n} data-complete={area > n}>{n + 1}</span>)}</div>
          <p className="px-feedback" role="status">{tr(...feedback)}</p>
          <span className="px-shield-status" data-ready={shield}>{shield ? tr('保护中 · 还能挡一次', 'READY · ONE BLOCK') : photoCount(photos) ? tr(`按住 ${prompt('protect')} 开启保护`, `HOLD ${prompt('protect')} TO PROTECT`) : tr('先捡一张照片', 'COLLECT A PHOTO FIRST')}</span>
          {comment > 0 && <aside className="px-comment"><small>{tr("其他玩家的留言（游戏虚构）", "OTHER PEOPLE'S COMMENTS · FICTIONAL")}</small><p>{comment === 1 ? tr("“我数的是五个人。”", '“I remember five people.”') : tr("“我记得天空是粉色的。”", '“Wasn’t the sky pink that day?”')}</p><p>{comment === 1 ? tr("“对，我也数到五个。”", '“Yes, five. That’s what I remember.”') : tr("“我也是，粉色那张。”", '“That’s how I remember it too.”')}</p></aside>}
        </>}
        {screen === 'practice' && <section ref={overlay} className="px-practice-coach" aria-label={tr('操作练习', 'Hands-on practice')}>
          <div className="px-practice-heading"><ol aria-label={tr('练习步骤', 'Practice steps')}>{PRACTICE_STEPS.map((step, i) => <li key={step} aria-current={practice === step ? 'step' : undefined} data-complete={practiceIndex > i}>{practiceIndex > i ? '✓' : i + 1}</li>)}</ol><button type="button" onClick={begin}>{tr('跳过练习', 'Skip practice')}</button></div>
          <div className="px-practice-instruction" role="status"><kbd>{practiceCopy[practice][2]}</kbd><div><h2>{practiceCopy[practice][0]}</h2><p>{practiceCopy[practice][1]}</p></div></div>
          {practice === 'done' && <button type="button" data-primary className="px-primary" onClick={begin}>{tr('开始看照片', 'Open the photograph')}</button>}
          {practice === 'protect' && <small>{shield ? tr('边框亮了，等泡泡过来。', 'The outline is lit. Wait for the signal.') : tr(...feedback)}</small>}
        </section>}
        {screen !== "play" && screen !== 'practice' && <section ref={overlay} className={`px-overlay px-${screen}`} aria-label={tr("游戏面板", "Game panel")}>
          {screen === "title" && <div className="px-title-layout"><div><small className="px-eyebrow">{tr('同一张照片，你会记得一样吗？', 'ONE PHOTOGRAPH. THREE RECALLS.')}</small><h1>{language === "en" ? <>What was<br />I again?</> : <>忘了自己<br />是什么</>}</h1><p>{tr("先看一张照片，再往右走，捡照片、躲障碍。游戏会三次问你照片里有几个人，路上也会出现其他玩家的留言。留言是游戏虚构的，不一定说得对。", "Remember a photograph, then collect its fragments. Along the way, other people remember it differently.")}</p><div className="px-start-actions"><button type="button" data-primary className="px-primary" disabled={!art || assetError} onClick={startPractice}>{assetError ? tr("画面没能加载出来", "Art could not load") : art ? tr("先练一下", "Try the controls") : tr("画面加载中…", "Preparing the scene…")}</button><button type="button" className="px-text-button" disabled={!art || assetError} onClick={begin}>{tr('跳过练习，直接开始', 'Skip practice · view photograph')}</button></div>{assetError && <button type="button" onClick={() => location.reload()}>{tr("重新加载", "Reload")}</button>}<small>{tr("不限时，可以慢慢看。练习不计入正式游戏。", "No countdown. Practice will not affect the game.")}</small></div><div className="px-title-controls"><div className="px-cabinet" data-layout={6} aria-hidden="true"><span className="px-stick"><i /></span><div>{ACTIONS.map((action, n) => <i key={action} data-pressed={pressedButton === bindings[action]}>{n + 1}</i>)}</div></div><h2>{tr('一个摇杆，六个按键', 'One stick. Six buttons.')}</h2>{cabinetLabel}<p className="px-layout-note">{tr('先试试移动、跳跃和保护。不顺手的话，可以重新设置按键。', 'Start with movement, jumping and protection. Set your physical button positions below.')}</p><div className="px-mini-controls">{ACTIONS.map((action,i) => <span key={action}><kbd>{prompt(action)}</kbd>{NAMES[language][i]}</span>)}</div><p className="px-device-note" data-connected={connection.connected}>{connectionLabel}</p><button type="button" className="px-text-button" onClick={openControls}>{tr("检查摇杆 / 设置按键", "Check controller / remap")}</button></div></div>}
          {screen === "loading" && <div className="px-boot" role="status"><div className="px-signal">{Array.from({ length: 12 }, (_, n) => <i key={n} style={{ animationDelay: `${n * .09}s` }} />)}</div><p>{tr("正在打开照片", "Opening the photograph")}</p></div>}
          {screen === "observe" && <div className="px-observe-layout"><div className="px-photo-frame"><Photo art={art} label={tr("原始照片：四个人，右边有旋转木马，天空是蓝色的。", "Original photograph: four people, a carousel on the right and a blue sky.")} /><small>{tr("开头的照片", "ORIGINAL PHOTOGRAPH")}</small></div><div><h1>{tr("先看清这张照片", "Take a look.")}</h1><p>{tr("看看有几个人，旁边有什么。看好了，再往下走。", "Notice the people and the place around them. Continue when you are ready.")}</p><button type="button" data-primary className="px-primary" onClick={() => ask(0)}>{primaryText}</button></div></div>}
          {isQuestion && <div className="px-question"><small>{tr(`第 ${stage + 1} 次回想`, `RECALL ${stage + 1} / 3`)}</small><h1>{screen === "count" ? tr("开头那张照片里，有几个人？", "How many people were in the first photograph?") : stage === 1 ? tr("照片里的旋转木马在哪边？", "Where was the carousel?") : tr("开头那张照片，天空是什么颜色？", "What color was the sky?")}</h1><div className="px-choices" role="group" aria-label={tr("选择答案", "Choose an answer")}>{options.map((value, i) => <button type="button" key={value} aria-pressed={selection === i} onClick={() => choose(i)}>{label(value)}</button>)}</div><p>{tr("左右拨摇杆选答案，松回中间后可再选。选好按确认。", "Move the stick to choose, then return it to center. Press Confirm to continue.")}</p><button type="button" data-primary className="px-primary" disabled={selection < 0} onClick={submit}>{tr("选好了", "Keep this answer")}</button></div>}
          {screen === "pause" && <div className="px-pause-panel"><h1>{tr("已暂停", "Paused")}</h1><p>{tr("接着玩，会从刚才停下的地方继续。", "Your photographs and answers are still here.")}</p><button type="button" data-primary className="px-primary" onClick={() => { unlock(); changeScreen(runtime.current.activeScreen); }}>{tr("接着玩", "Continue")}</button><button type="button" onClick={openControls}>{tr("操作说明", "Controls")}</button><div className="px-object-guide"><span><Sprite art={art} index={4}/>{tr('照片：碰到就捡起', 'Photo: touch to collect')}</span><span><Sprite art={art} index={7}/>{tr('障碍：跳过去，或提前开启保护', 'Obstacle: jump or protect')}</span><span><Sprite art={art} index={5}/>{tr('泡泡：碰到会让照片变样', 'Bubble: changes a photo')}</span></div></div>}
          {screen === "controls" && <div className="px-controls-panel"><div className="px-controls-heading"><h1>{tr("摇杆和按键怎么用", "Controls & controller")}</h1><button type="button" data-primary onClick={closeControls}>{tr("返回", "Back")}</button></div><div className="px-device-panel">{cabinetLabel}<div role="status"><strong>{connectionLabel}</strong><small>{connection.connected ? connection.id : tr('有些摇杆会被当作键盘，下方按键也能用。没显示手柄名称，不一定是没连上。', 'Keyboard-mode controllers use the keys below. The USB connector alone does not identify the input mode.')}</small>{pressedButton !== null && <kbd>{tr('刚按下：键 ', 'Detected BTN ')}{pressedButton + 1}</kbd>}</div></div><p>{tr("左右推摇杆控制走路。打开菜单后，上下或左右选项目，按确认进入，按暂停键返回。", "Move with the stick. In menus, move it up/down or left/right to choose, Confirm to open, Menu to go back.")}</p><div className="px-binding-list">{ACTIONS.map((action, i) => <div key={action} data-active={pressedButton === bindings[action]}><span>{NAMES[language][i]}</span><kbd>{KEY_LABELS[i]}</kbd><button type="button" aria-label={`${tr("重新设置", "Remap")} ${NAMES[language][i]}`} aria-pressed={bindingAction === action} onClick={() => { input.current?.capture(action); setBindingAction(action); }}>{bindingAction === action ? tr("按一下想用的摇杆按键…", "Press a button…") : `${buttonName(action)} ↗`}</button></div>)}</div><p className="px-control-note">{tr("带着照片时，按住保护键 0.7 秒，亮起边框后约 4 秒内能挡一次碰撞。想换键：先选右侧键号，再按摇杆上的按键。键号不代表按键位置；如果这个键已有用途，两项功能会互换。", "Collect a photo, then hold Protect for 0.7 seconds to block one hit within 4 seconds. Numbers are not cabinet positions: choose a binding, then press the physical button. Conflicting bindings swap.")}</p><div className="px-control-footer"><button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); input.current?.setBindings({ ...DEFAULT_BUTTONS }); setBindings({ ...DEFAULT_BUTTONS }); }}>{tr("恢复默认按键", "Reset bindings")}</button>{bindingAction && <button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); }}>{tr("不改了", "Cancel remapping")}</button>}<span>{tr("声音", "AUDIO")}: PYNCHON — James Gargette · SFX — Kenney</span></div></div>}
          {screen === "result" && record && <div className="px-result-layout"><div><div className="px-result-tabs"><button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>{tr("开头的照片", "Original")}</button><button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>{tr("你选的人数", "From your count")}</button></div><Photo art={art} count={showOriginal ? 4 : (recalls[2] ?? 0)} sky="blue" carousel="right" label={showOriginal ? tr("开头的照片", "Original photograph") : tr("按你最后选的人数重画的照片，并非原图", "A reconstruction from your final count, not the original")} /><p>{showOriginal ? tr("这是开头那张照片，一直没变过。", "The original never changed.") : tr("这张图只按你最后选的人数重画。选“记不清了”时，人物会留空，不表示原图没人。", "Only the people are redrawn from your final count. Position and color are compared alongside. Not sure leaves the people out.")}</p></div><div className="px-result-copy"><h1>{tr("你刚才是这样记的", "What stayed?")}</h1><div className="px-recall-history">{recalls.map((value, i) => <span key={i}><small>{tr(`第 ${i + 1} 次`, `RECALL ${i + 1}`)}</small><b>{label(value)}</b></span>)}</div><div className="px-evidence" aria-label={tr("照片里的人数和留言里的说法", "Original and shared account")}><span><small>{tr("照片里的人数", "ORIGINAL")}</small><b>{label(4)}</b></span><span><small>{tr("留言里说的（虚构）", "SHARED ACCOUNT · FICTION")}</small><b>{label(5)}</b></span></div><dl><div><dt>{tr("旋转木马：原图 / 你选的", "Carousel: original / answer")}</dt><dd>{label("right")} / {label(details[0])}</dd></div><div><dt>{tr("天空颜色：原图 / 你选的", "Sky: original / answer")}</dt><dd>{label("blue")} / {label(details[1])}</dd></div></dl><p>{tr("原图里是四个人、蓝色天空。路上的几条留言和五人照片，是游戏特意放入的干扰。", "The comments and five-person prints were fictional retellings. The original always showed four people and a blue sky.")}</p><p className="px-final-question">{tr("再看一眼，和你记得的一样吗？", "Which version would you keep?")}</p><button type="button" data-primary className="px-primary" onClick={reset}>{tr("再玩一次", "Look again")}</button></div></div>}
        </section>}
      </div>
      <footer className="px-footer"><span>{moving ? tr(`← → 移动 · ${prompt('jump')} 跳跃 · 长按 ${prompt('protect')} 保护`, `← → MOVE · ${prompt('jump')} JUMP · HOLD ${prompt('protect')} PROTECT`) : tr(`摇杆 / 方向键选择 · ${prompt('confirm')} 确认 · ${prompt('pause')} 暂停 / 返回`, `STICK / ARROWS SELECT · ${prompt('confirm')} CONFIRM · ${prompt('pause')} MENU`)}</span><span>{screen === 'practice' ? tr('练习区 · 不会丢照片', 'PRACTICE · NO PHOTO LOSS') : tr('沿着路，往右走', 'Reach the next photograph')}</span></footer>
    </div>
    <div className="px-touch" aria-label={tr("触屏操作", "Touch controls")} data-visible={moving}><div><button type="button" aria-label={tr("向左移动", "Move left")} {...bindTouch("left")}><Icon kind="left" /></button><button type="button" aria-label={tr("向右移动", "Move right")} {...bindTouch("right")}><Icon kind="right" /></button></div><div><button type="button" {...bindTouch("protect")}>{tr("保护", "Protect")}</button><button type="button" className="px-jump" {...bindTouch("jump")}>{tr("跳跃", "Jump")}</button></div></div>
    <p className="px-rotate">{tr("把屏幕横过来，路就看全了。", "Turn your screen sideways for the full view.")}</p>
  </main>;
}
