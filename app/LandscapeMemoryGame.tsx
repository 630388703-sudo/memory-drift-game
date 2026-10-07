"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MemoryAudio, type MemoryCue } from "./memory-audio";
import { emptyPhotoSlots, storePhoto, losePhoto, alterPhoto, photoCount, type PhotoSlots } from "./memory-storage";
import { COUNT_OPTIONS, moveChoiceIndex, recallLabel } from "./memory-recall";
import { createWorld, stepWorld, type WorldEvent } from "./pixel-world";
import { createPixelInput, loadPixelBindings, DEFAULT_BUTTONS, type PixelConnection, type PixelAction, type PixelTouchAction, type PixelDevice } from "./pixel-input";
import { practiceStep, PRACTICE_STEPS, type PracticeStep } from "./pixel-tutorial";
import { loadPixelArt, drawPixelWorld, drawMemoryPhoto, drawAtlasSprite, type PixelArt } from "./pixel-renderer";
import "./pixel-game.css";

type Screen = "title" | "practice" | "loading" | "observe" | "count" | "detail" | "play" | "pause" | "controls" | "result";
type Lang = "en" | "zh";
type RecordData = { recalls: number[]; details: string[]; retained: number; collected: number; altered: number; replaced: number };
const ACTIONS: PixelAction[] = ["jump", "protect", "confirm", "pause", "compare", "help"];
const KEY_LABELS = ["Z / Space", "X", "Enter", "P / Esc", "C", "H"];
const NAMES = { en: ["Jump", "Protect photo", "Confirm", "Pause", "Compare (ending)", "Controls"], zh: ["跳跃", "保护照片", "确认", "暂停", "结尾对照照片", "操作说明"] };

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
    setPractice('move'); setShield(false); setFeedback(['这是练习，不会影响后面的照片。', 'This is practice. It will not change your photographs.']);
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
        if (event.type === 'photo') { cue('collect'); setFeedback(['捡到了。回到地面，试一下保护。', 'Got it. Return to the ground and try protecting it.']); }
        else if (event.type === 'protect') { cue('protect'); setFeedback(['准备好了。让信号碰一下。', 'Ready. Let the signal reach you.']); }
        else if (event.type === 'block') { cue('block'); setFeedback(['挡住了。现在可以开始了。', 'Blocked. You are ready to begin.']); }
        else if (event.type === 'bubble' || event.type === 'collision') { cue('bubble'); setFeedback(['照片还在。松开保护键，再长按试一次。', 'Photo safe. Release Protect, then hold it again.']); }
        return;
      }
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
      else if (event.type === "spring") { cue('confirm'); setFeedback(['弹上去，看看高处的照片。', 'Up you go. There is a photograph above.']); }
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
  const areaTitles = language === "en" ? ["THE FIRST IMAGE", "OTHER PEOPLE'S MEMORY", "WHAT REMAINS"] : ["最初的照片", "别人的记忆", "还记得什么"];
  const primaryText = tr("我看过了", "I have seen it");
  const buttonName = (action: PixelAction) => `${tr("键", "BTN ")}${bindings[action] + 1}`;
  const prompt = (action: PixelAction) => device === 'gamepad' ? buttonName(action) : device === 'touch' ? NAMES[language][ACTIONS.indexOf(action)] : KEY_LABELS[ACTIONS.indexOf(action)];
  const moving = screen === 'play' || screen === 'practice';
  const practiceIndex = practice === 'done' ? 4 : PRACTICE_STEPS.indexOf(practice);
  const practiceCopy = {
    move: [tr('先动一下摇杆', 'Try moving.'), tr('左右推摇杆，走到路标附近。', 'Move left or right toward the arrow.'), device === 'keyboard' ? '← → / A D' : tr('摇杆左右', 'STICK ← →')],
    jump: [tr('跳一下试试', 'Now jump.'), tr('按住跳跃键会跳得更高，松开会落得更早。', 'Hold Jump for a higher leap. Release for a short hop.'), prompt('jump')],
    collect: [tr('捡起平台上的照片', 'Get the photograph.'), tr('从平台左边起跳，边向右走边按住跳跃。碰到照片就能捡到。', 'Jump from the left edge and keep moving right. Touch the photograph to collect it.'), `${device === 'keyboard' ? '→' : tr('摇杆', 'STICK')} + ${prompt('jump')}`],
    protect: [tr('试着挡住信号', 'Block the signal.'), tr('回到地面，长按保护 0.7 秒后松开。边框亮起时，让慢慢靠近的信号碰到你。', 'Return to the ground. Hold Protect for 0.7 seconds, then release. Let the signal reach you while the outline is lit.'), prompt('protect')],
    done: [tr('会玩了，去看看照片', 'You are ready.'), tr('正式开始后，障碍会让你丢掉一张照片，泡泡会改动照片。练习记录不会带过去。', 'On the route, obstacles lose a photo and bubbles change one. Practice does not carry over.'), prompt('confirm')],
  };
  const cabinetLabel = <span className="px-cabinet-label">{tr('六键 · 两排三键', '6 BUTTONS · TWO ROWS OF THREE')}</span>;
  const connectionLabel = connection.connected ? tr('已识别 USB 手柄', 'USB controller detected') : tr('还没识别到手柄？先按一下实体键。', 'No controller yet? Press a physical button.');

  return <main className="px-page" data-screen={screen}>
    <div className="px-game">
      <header className="px-header">
        <strong>{tr("忘了自己是什么", "WHAT WAS I AGAIN?")}</strong>
        <span className="px-area">{screen === 'practice' ? tr('练习 / 不计入游戏', 'PRACTICE / NO PENALTY') : `0${area + 1} / ${areaTitles[area]}`}</span>
        <nav aria-label={tr("游戏设置", "Game settings")}>
          <button type="button" className="px-language" onClick={() => setLanguage(language === "en" ? "zh" : "en")} aria-label={tr("Switch to English", "切换到中文")}>{language === "en" ? "中" : "EN"}</button>
          <button type="button" aria-label={tr(sound ? "关闭声音" : "开启声音", sound ? "Mute sound" : "Enable sound")} aria-pressed={!sound} onClick={() => { runtime.current.sound = !sound; setSound(!sound); audio.current?.setEnabled(!sound); if (!sound) unlock(); }}><Icon kind={sound ? "sound" : "muted"} /></button>
          <button type="button" aria-label={tr("操作说明与改键", "Controls and remapping")} onClick={openControls}><Icon kind="settings" /></button>
          <button type="button" aria-label={tr("暂停", "Pause")} disabled={!moving && screen !== "pause"} onClick={togglePause}><Icon kind="pause" /></button>
        </nav>
      </header>
      <div className="px-stage">
        <canvas ref={canvas} className="px-world" width={480} height={270} role="img" aria-label={tr("横向像素关卡：向右移动，跳跃捡照片，避开干扰。", "Side-scrolling pixel level. Move right, jump to collect photographs and avoid interference.")} />
        {screen === "play" && <>
          <div className="px-hud" aria-label={tr("照片存档", "Stored photographs")}><div className="px-slots">{photos.map((p, i) => <span key={i} className={p?.altered ? "is-altered" : ""} aria-label={p ? tr(p.altered ? "已改动的照片" : "照片", p.altered ? "Changed photograph" : "Photograph") : tr("空位", "Empty slot")}>{p ? <Sprite art={art} /> : <i />}{p?.altered && <b>×</b>}</span>)}</div><small>{tr("照片", "PHOTOS")} {photoCount(photos)} / 5 {replaced > 0 && <em> · {tr("替换", "REPLACED")} {replaced}</em>}</small></div>
          <div className="px-route" aria-label={tr('回想进度', 'Recall progress')}>{[0, 1, 2].map(n => <span key={n} data-current={area === n} data-complete={area > n}>{n + 1}</span>)}</div>
          <p className="px-feedback" role="status">{tr(...feedback)}</p>
          <span className="px-shield-status" data-ready={shield}>{shield ? tr('已就绪 · 可挡一次', 'READY · ONE BLOCK') : photoCount(photos) ? tr(`长按 ${prompt('protect')} 保护照片`, `HOLD ${prompt('protect')} TO PROTECT`) : tr('先捡一张照片', 'COLLECT A PHOTO FIRST')}</span>
          {comment > 0 && <aside className="px-comment"><small>{tr("别人的留言 · 游戏虚构", "OTHER PEOPLE'S COMMENTS · FICTIONAL")}</small><p>{comment === 1 ? tr("“我记得有五个人。”", '“I remember five people.”') : tr("“那天的天空是粉色的吧。”", '“Wasn’t the sky pink that day?”')}</p><p>{comment === 1 ? tr("“对，我也记得五个。”", '“Yes, five. That’s what I remember.”') : tr("“嗯，我记得也是。”", '“That’s how I remember it too.”')}</p></aside>}
        </>}
        {screen === 'practice' && <section ref={overlay} className="px-practice-coach" aria-label={tr('操作练习', 'Hands-on practice')}>
          <div className="px-practice-heading"><ol aria-label={tr('练习步骤', 'Practice steps')}>{PRACTICE_STEPS.map((step, i) => <li key={step} aria-current={practice === step ? 'step' : undefined} data-complete={practiceIndex > i}>{practiceIndex > i ? '✓' : i + 1}</li>)}</ol><button type="button" onClick={begin}>{tr('跳过练习', 'Skip practice')}</button></div>
          <div className="px-practice-instruction" role="status"><kbd>{practiceCopy[practice][2]}</kbd><div><h2>{practiceCopy[practice][0]}</h2><p>{practiceCopy[practice][1]}</p></div></div>
          {practice === 'done' && <button type="button" data-primary className="px-primary" onClick={begin}>{tr('打开第一张照片', 'Open the photograph')}</button>}
          {practice === 'protect' && <small>{shield ? tr('边框亮起了，等信号过来。', 'The outline is lit. Wait for the signal.') : tr(...feedback)}</small>}
        </section>}
        {screen !== "play" && screen !== 'practice' && <section ref={overlay} className={`px-overlay px-${screen}`} aria-label={tr("游戏面板", "Game panel")}>
          {screen === "title" && <div className="px-title-layout"><div><small className="px-eyebrow">{tr('一张照片，三次回想', 'ONE PHOTOGRAPH. THREE RECALLS.')}</small><h1>{language === "en" ? <>What was<br />I again?</> : <>忘了自己<br />是什么</>}</h1><p>{tr("记住一张照片，再沿路捡起它的碎片。有人记得的，可能和你不一样。", "Remember a photograph, then collect its fragments. Along the way, other people remember it differently.")}</p><div className="px-start-actions"><button type="button" data-primary className="px-primary" disabled={!art || assetError} onClick={startPractice}>{assetError ? tr("素材加载失败", "Art could not load") : art ? tr("先试一下操作", "Try the controls") : tr("正在准备画面…", "Preparing the scene…")}</button><button type="button" className="px-text-button" disabled={!art || assetError} onClick={begin}>{tr('我会玩了，直接看照片', 'Skip practice · view photograph')}</button></div>{assetError && <button type="button" onClick={() => location.reload()}>{tr("重新加载", "Reload")}</button>}<small>{tr("没有倒计时。练习不会影响正式游戏。", "No countdown. Practice will not affect the game.")}</small></div><div className="px-title-controls"><div className="px-cabinet" data-layout={6} aria-hidden="true"><span className="px-stick"><i /></span><div>{ACTIONS.map((action, n) => <i key={action} data-pressed={pressedButton === bindings[action]}>{n + 1}</i>)}</div></div><h2>{tr('一个摇杆，六个按键', 'One stick. Six buttons.')}</h2>{cabinetLabel}<p className="px-layout-note">{tr('先学移动、跳跃和保护。机台键位可在下方重新绑定。', 'Start with movement, jumping and protection. Set your physical button positions below.')}</p><div className="px-mini-controls">{ACTIONS.map((action,i) => <span key={action}><kbd>{prompt(action)}</kbd>{NAMES[language][i]}</span>)}</div><p className="px-device-note" data-connected={connection.connected}>{connectionLabel}</p><button type="button" className="px-text-button" onClick={openControls}>{tr("检测设备 / 调整按键", "Check controller / remap")}</button></div></div>}
          {screen === "loading" && <div className="px-boot" role="status"><div className="px-signal">{Array.from({ length: 12 }, (_, n) => <i key={n} style={{ animationDelay: `${n * .09}s` }} />)}</div><p>{tr("正在打开照片", "Opening the photograph")}</p></div>}
          {screen === "observe" && <div className="px-observe-layout"><div className="px-photo-frame"><Photo art={art} label={tr("原始照片：四个人，右侧旋转木马，蓝色天空。", "Original photograph: four people, a carousel on the right and a blue sky.")} /><small>{tr("原始照片", "ORIGINAL PHOTOGRAPH")}</small></div><div><h1>{tr("看看这张照片", "Take a look.")}</h1><p>{tr("记住你看到的人和周围的景物。看好后再继续。", "Notice the people and the place around them. Continue when you are ready.")}</p><button type="button" data-primary className="px-primary" onClick={() => ask(0)}>{primaryText}</button></div></div>}
          {isQuestion && <div className="px-question"><small>{tr(`第 ${stage + 1} 次回想`, `RECALL ${stage + 1} / 3`)}</small><h1>{screen === "count" ? tr("最初的照片里，有几个人？", "How many people were in the first photograph?") : stage === 1 ? tr("旋转木马在哪一侧？", "Where was the carousel?") : tr("最初的天空是什么颜色？", "What color was the sky?")}</h1><div className="px-choices" role="group" aria-label={tr("选择答案", "Choose an answer")}>{options.map((value, i) => <button type="button" key={value} aria-pressed={selection === i} onClick={() => choose(i)}>{label(value)}</button>)}</div><p>{tr("摇杆左右选择，回中后可再选。按确认键提交。", "Move the stick to choose, then return it to center. Press Confirm to continue.")}</p><button type="button" data-primary className="px-primary" disabled={selection < 0} onClick={submit}>{tr("记下这个回答", "Keep this answer")}</button></div>}
          {screen === "pause" && <div className="px-pause-panel"><h1>{tr("暂停了", "Paused")}</h1><p>{tr("照片和你的回答都还在。", "Your photographs and answers are still here.")}</p><button type="button" data-primary className="px-primary" onClick={() => { unlock(); changeScreen(runtime.current.activeScreen); }}>{tr("继续走", "Continue")}</button><button type="button" onClick={openControls}>{tr("操作说明", "Controls")}</button><div className="px-object-guide"><span><Sprite art={art} index={4}/>{tr('照片：碰到就收集', 'Photo: touch to collect')}</span><span><Sprite art={art} index={7}/>{tr('障碍：跳过，或提前保护', 'Obstacle: jump or protect')}</span><span><Sprite art={art} index={5}/>{tr('泡泡：会改动一张照片', 'Bubble: changes a photo')}</span></div></div>}
          {screen === "controls" && <div className="px-controls-panel"><div className="px-controls-heading"><h1>{tr("操作与设备", "Controls & controller")}</h1><button type="button" data-primary onClick={closeControls}>{tr("返回", "Back")}</button></div><div className="px-device-panel">{cabinetLabel}<div role="status"><strong>{connectionLabel}</strong><small>{connection.connected ? connection.id : tr('若设备输出键盘按键，可直接使用下方键盘操作。USB 外观无法判断输入方式。', 'Keyboard-mode controllers use the keys below. The USB connector alone does not identify the input mode.')}</small>{pressedButton !== null && <kbd>{tr('检测到键 ', 'Detected BTN ')}{pressedButton + 1}</kbd>}</div></div><p>{tr("摇杆左右移动；菜单里摇杆上下或左右选项，确认键进入，菜单键返回。", "Move with the stick. In menus, move it up/down or left/right to choose, Confirm to open, Menu to go back.")}</p><div className="px-binding-list">{ACTIONS.map((action, i) => <div key={action} data-active={pressedButton === bindings[action]}><span>{NAMES[language][i]}</span><kbd>{KEY_LABELS[i]}</kbd><button type="button" aria-label={`${tr("重新设置", "Remap")} ${NAMES[language][i]}`} aria-pressed={bindingAction === action} onClick={() => { input.current?.capture(action); setBindingAction(action); }}>{bindingAction === action ? tr("请按实体按键…", "Press a button…") : `${buttonName(action)} ↗`}</button></div>)}</div><p className="px-control-note">{tr("先捡到照片，再长按保护 0.7 秒，随后 4 秒内可挡一次。键号不是机台位置：选中右侧“改键”，再按实体键。重复分配会交换功能。", "Collect a photo, then hold Protect for 0.7 seconds to block one hit within 4 seconds. Numbers are not cabinet positions: choose a binding, then press the physical button. Conflicting bindings swap.")}</p><div className="px-control-footer"><button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); input.current?.setBindings({ ...DEFAULT_BUTTONS }); setBindings({ ...DEFAULT_BUTTONS }); }}>{tr("恢复默认按键", "Reset bindings")}</button>{bindingAction && <button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); }}>{tr("取消改键", "Cancel remapping")}</button>}<span>{tr("声音", "AUDIO")}: Glitch Light — BerryDeep</span></div></div>}
          {screen === "result" && record && <div className="px-result-layout"><div><div className="px-result-tabs"><button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>{tr("原始照片", "Original")}</button><button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>{tr("按人数重画的一版", "From your count")}</button></div><Photo art={art} count={showOriginal ? 4 : (recalls[2] ?? 0)} sky="blue" carousel="right" label={showOriginal ? tr("原始照片", "Original photograph") : tr("依据最后人数重画的照片，不是原图", "A reconstruction from your final count, not the original")} /><p>{showOriginal ? tr("原图一直没有变。", "The original never changed.") : tr("这一版只按最后回答的人数重画；位置和颜色的回答在旁边对照。选了记不清，就不补入人物。", "Only the people are redrawn from your final count. Position and color are compared alongside. Not sure leaves the people out.")}</p></div><div className="px-result-copy"><h1>{tr("还记得多少？", "What stayed?")}</h1><div className="px-recall-history">{recalls.map((value, i) => <span key={i}><small>{tr(`第 ${i + 1} 次`, `RECALL ${i + 1}`)}</small><b>{label(value)}</b></span>)}</div><dl><div><dt>{tr("原图人数", "Original count")}</dt><dd>{label(4)}</dd></div><div><dt>{tr("旋转木马：原图 / 回答", "Carousel: original / answer")}</dt><dd>{label("right")} / {label(details[0])}</dd></div><div><dt>{tr("天空：原图 / 回答", "Sky: original / answer")}</dt><dd>{label("blue")} / {label(details[1])}</dd></div></dl><p>{tr("路上的留言是写好的。它们说有五个人、粉色天空；原图却是四个人、蓝色天空。", "The comments were scripted: five people, a pink sky. The original shows four people and a blue sky.")}</p><p className="px-final-question">{tr("你想留下哪一版？", "Which version would you keep?")}</p><button type="button" data-primary className="px-primary" onClick={reset}>{tr("再看一次", "Look again")}</button></div></div>}
        </section>}
      </div>
      <footer className="px-footer"><span>{moving ? tr(`← → 移动 · ${prompt('jump')} 跳跃 · 长按 ${prompt('protect')} 保护`, `← → MOVE · ${prompt('jump')} JUMP · HOLD ${prompt('protect')} PROTECT`) : tr(`摇杆 / 方向键选择 · ${prompt('confirm')} 确认 · ${prompt('pause')} 菜单`, `STICK / ARROWS SELECT · ${prompt('confirm')} CONFIRM · ${prompt('pause')} MENU`)}</span><span>{screen === 'practice' ? tr('练习区 · 不会丢照片', 'PRACTICE · NO PHOTO LOSS') : tr('走到下一张照片前', 'Reach the next photograph')}</span></footer>
    </div>
    <div className="px-touch" aria-label={tr("触屏操作", "Touch controls")} data-visible={moving}><div><button type="button" aria-label={tr("向左移动", "Move left")} {...bindTouch("left")}><Icon kind="left" /></button><button type="button" aria-label={tr("向右移动", "Move right")} {...bindTouch("right")}><Icon kind="right" /></button></div><div><button type="button" {...bindTouch("protect")}>{tr("保护", "Protect")}</button><button type="button" className="px-jump" {...bindTouch("jump")}>{tr("跳跃", "Jump")}</button></div></div>
    <p className="px-rotate">{tr("横过来，能看到完整的路。", "Turn your screen sideways for the full view.")}</p>
  </main>;
}
